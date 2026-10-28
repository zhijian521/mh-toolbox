<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { EquipmentDraft, EquipmentProfile } from '../../app/types';
import { desktop } from '../../services/desktop';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import EquipmentFields from './EquipmentFields.vue';
import { pruneDetail, type DraftDetail } from './properties';

/**
 * 截图录入装备。
 *
 * 每张图识别成一段文本，再走与粘贴导入完全相同的解析（`parseEquipmentText`），
 * 所以「截图」和「粘贴」最终得到的是同一种草稿、同一个核对界面——OCR 只是多了一个
 * 文本来源，不是第二套导入逻辑。
 *
 * 图片只在内存里过一遍：渲染层拿 dataURL，主进程解码校验后丢给独立进程识别，
 * 不落盘、不上传。识别完队列里只留缩略图供对照，关掉弹窗即全部释放。
 *
 * 一次只认一张：模型常驻占内存，并发反而让进度条失真，出错也更难定位是哪张。
 */

type ItemStatus = 'queued' | 'running' | 'ready' | 'error';
interface ShotItem {
    id: string;
    /** 原图：裁剪时以它为底，重新识别也不会越裁越小。 */
    original: string;
    /** 当前用于识别的图（裁剪后与 `original` 不同）。 */
    image: string;
    status: ItemStatus;
    progress: number;
    requestId: string;
    draft: EquipmentDraft | null;
    detail: DraftDetail | null;
    error: string;
    confidence: number;
}

const props = defineProps<{ profile: EquipmentProfile }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();
const gateway = desktop();
const limits = rules.equipmentImportLimits;

const items = ref<ShotItem[]>([]);
const selectedId = ref('');
const plan = ref('');
const error = ref('');
const saving = ref(false);
const reading = ref(0);
const fileInput = ref<HTMLInputElement>();
const preview = ref<HTMLElement>();
const cropping = ref(false);
const cropBox = ref<HTMLElement>();

const selected = computed(() => items.value.find((item) => item.id === selectedId.value) || null);
const busyCount = computed(
    () =>
        items.value.filter((item) => item.status === 'queued' || item.status === 'running').length,
);
const incomplete = computed(
    () => items.value.filter((item) => item.status === 'ready' && item.error).length,
);
const dirty = computed(() => items.value.length > 0);
const canSave = computed(
    () => items.value.length > 0 && !busyCount.value && !incomplete.value && !saving.value,
);
const planOptions = computed(() => [
    { value: '', label: '只入库，不自动穿戴' },
    ...props.profile.equipmentSets.map((set, index) => ({
        value: String(index),
        label: set.name,
    })),
]);
const slotOptions = computed(() =>
    rules.slots.filter((slot) => slot !== '其他').map((slot) => ({ value: slot, label: slot })),
);
const summary = computed(() => {
    if (reading.value) return '正在读取图片…';
    if (!items.value.length) return '本地识别，图片不会上传';
    if (busyCount.value)
        return (
            '识别中 ' +
            (selected.value && selected.value.status === 'running' ? selected.value.progress : 0) +
            '% · 还剩 ' +
            busyCount.value +
            ' 张'
        );
    if (incomplete.value) return items.value.length + ' 件 · ' + incomplete.value + ' 件待补充';
    return items.value.length + ' 件可保存 · 请对照原图核对';
});
const confidenceNote = computed(() => {
    const item = selected.value;
    if (!item || item.status !== 'ready') return '';
    return item.confidence && item.confidence < 85
        ? '部分文字识别不确定，请对照原图核对数值'
        : '本地识别完成，可对照原图修正';
});

/* ---------------- 识别错误：与领域校验共用一条规则 ---------------- */
/**
 * 单件的入库前错误。
 *
 * 领域校验（`equipmentImportError`）管格式与取值；这里额外补一条玉魄的业务要求：
 * 没有三条属性的玉魄存下去只是一行名字，栏里看不出是什么，和编辑器里的判断保持一致。
 */
function issueOf(item: ShotItem): string {
    if (!item.draft || item.status !== 'ready') return '';
    const draft = { ...item.draft, details: pruneDetail(item.detail!) };
    const error = rules.equipmentImportError(draft, props.profile.id);
    if (error) return error;
    if (rules.isJade(draft.slot)) {
        const detail = draft.details;
        if (detail.base.length < 1 || detail.extra.length < 2)
            return '玉魄需要一条基础属性和两条附加属性，可在右侧补齐';
    }
    return '';
}
function refresh(item: ShotItem) {
    item.error = issueOf(item);
}

/* ---------------- 队列 ---------------- */
function message(failure: unknown) {
    return failure instanceof Error ? failure.message : String(failure);
}

async function addImage(dataUrl: string) {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('无法读取图片，请重新截图'));
        image.src = dataUrl;
    });
    if (image.naturalWidth * image.naturalHeight > limits.pixels)
        throw new Error('图片尺寸过大，请截取单件装备属性');
    if (image.naturalWidth < 16 || image.naturalHeight < 16)
        throw new Error('图片过小，请重新截取装备属性');
    if (!/^data:image\/(?:png|jpeg);base64,/.test(dataUrl)) {
        // WebP / BMP 统一转 PNG：识别链路只处理像素，但队列里要能直接预览。
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext('2d')!.drawImage(image, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
    }
    if (items.value.some((item) => item.original === dataUrl)) {
        app.notify('这张截图已经在列表里了');
        return;
    }
    const item: ShotItem = {
        id: 'shot-' + Date.now() + '-' + items.value.length,
        original: dataUrl,
        image: dataUrl,
        status: 'queued',
        progress: 0,
        requestId: '',
        draft: null,
        detail: null,
        error: '',
        confidence: 0,
    };
    items.value.push(item);
    if (!selectedId.value) selectedId.value = item.id;
    void pump();
}
/** 逐个读文件；单个失败只提示那一张，不中断整批。 */
async function ingest(sources: File[]) {
    if (!sources.length) return;
    reading.value += 1;
    try {
        for (const file of sources) {
            if (items.value.length >= limits.count) {
                app.notify('一次最多 ' + limits.count + ' 张，请先保存这一批', true);
                break;
            }
            try {
                if (
                    !/^(image\/(png|jpeg|webp|bmp|x-ms-bmp))$/.test(file.type) &&
                    !/\.(png|jpe?g|webp|bmp)$/i.test(file.name)
                )
                    throw new Error('请选择 PNG、JPG、WebP 或 BMP 图片');
                if (file.size > limits.bytes) throw new Error('单张图片不超过 16 MB');
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(new Error('图片读取失败，请重试'));
                    reader.readAsDataURL(file);
                });
                await addImage(dataUrl);
            } catch (failure) {
                app.notify(message(failure), true);
            }
        }
    } finally {
        reading.value = Math.max(0, reading.value - 1);
    }
}
function pickFiles() {
    fileInput.value?.click();
}
async function pasteFromClipboard() {
    try {
        const image = await gateway.equipmentClipboard();
        if (!image) {
            app.notify('剪贴板里没有图片，先截个图或复制图片', true);
            return;
        }
        await ingest([dataUrlToFile(image)]);
    } catch (failure) {
        app.notify(message(failure), true);
    }
}
/**
 * 剪贴板拿到的已经是 dataURL，包成 File 走同一条入库路径，避免两套校验。
 *
 * 不用 `fetch(dataURL)`：页面的 CSP 是 `connect-src 'self'`，fetch 一个 data URL
 * 会被直接拒绝（"Failed to fetch"）。atob 解一遍就够了。
 */
function dataUrlToFile(dataUrl: string) {
    const comma = dataUrl.indexOf(',');
    const head = dataUrl.slice(5, comma);
    const type = head.split(';')[0] || 'image/png';
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], 'clipboard.png', { type });
}
function onPaste(event: ClipboardEvent) {
    const files = [...(event.clipboardData?.files || [])].filter((file) =>
        file.type.startsWith('image/'),
    );
    if (!files.length) return;
    event.preventDefault();
    void ingest(files);
}
function onDrop(event: DragEvent) {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files || [])].filter((file) =>
        file.type.startsWith('image/'),
    );
    if (!files.length) app.notify('拖进来的是文件而不是图片', true);
    else void ingest(files);
}
function onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    void ingest([...(input.files || [])]);
    input.value = '';
}

/* ---------------- 识别 ---------------- */
let processing = false;
async function pump() {
    if (processing) return;
    processing = true;
    try {
        for (let item; (item = items.value.find((entry) => entry.status === 'queued')); ) {
            item.status = 'running';
            item.progress = 0;
            item.requestId = 'shot-' + Date.now() + '-' + item.id;
            try {
                const result = await gateway.recognizeEquipment(item.image, item.requestId);
                if (result.ok && result.text && result.text.trim()) {
                    item.status = 'ready';
                    item.confidence = result.confidence || 0;
                    item.error = '';
                    item.draft = rules.parseEquipmentText(result.text) as EquipmentDraft;
                    item.detail = rules.equipmentImportRecord(item.draft, props.profile.id)
                        .details as unknown as DraftDetail;
                } else {
                    item.status = 'error';
                    item.error = result.error || '未识别到文字，请裁剪到装备文字区域后重试';
                }
            } catch {
                item.status = 'error';
                item.error = '识别未完成，可重新识别或手动补全';
            }
            if (item.status === 'ready') refresh(item);
        }
    } finally {
        processing = false;
    }
}
/** 重新识别：清掉结果重排队，裁剪后也走这里。 */
function retry(item: ShotItem) {
    if (item.status === 'running') void gateway.cancelEquipmentOcr(item.requestId);
    item.status = 'queued';
    item.error = '';
    item.progress = 0;
    item.draft = null;
    item.detail = null;
    cropping.value = false;
    void pump();
}
function remove(item: ShotItem) {
    if (item.status === 'running') void gateway.cancelEquipmentOcr(item.requestId);
    const index = items.value.indexOf(item);
    items.value.splice(index, 1);
    if (selectedId.value === item.id)
        selectedId.value = (items.value[index] || items.value[index - 1] || { id: '' }).id;
}

/* ---------------- 裁剪 ---------------- */
let start: { x: number; y: number } | null = null;
let rectangle: { x: number; y: number; width: number; height: number } | null = null;
const cropReady = ref(false);
function pointOf(event: PointerEvent) {
    const image = preview.value?.querySelector('img');
    if (!image) return { x: 0, y: 0 };
    const bounds = image.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
        y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
    };
}
function beginCrop() {
    const item = selected.value;
    if (!item || item.status === 'running') return;
    cropping.value = true;
    cropReady.value = false;
    rectangle = null;
    if (cropBox.value) cropBox.value.hidden = true;
}
function onPointerDown(event: PointerEvent) {
    if (!cropping.value || event.button !== 0) return;
    event.preventDefault();
    start = pointOf(event);
    rectangle = null;
    cropReady.value = false;
    if (cropBox.value) cropBox.value.hidden = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function onPointerMove(event: PointerEvent) {
    if (!start) return;
    const end = pointOf(event);
    const image = preview.value?.querySelector('img');
    if (!image) return;
    rectangle = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(start.x - end.x),
        height: Math.abs(start.y - end.y),
    };
    if (cropBox.value) {
        cropBox.value.hidden = false;
        Object.assign(cropBox.value.style, {
            left: rectangle.x + image.offsetLeft + 'px',
            top: rectangle.y + image.offsetTop + 'px',
            width: rectangle.width + 'px',
            height: rectangle.height + 'px',
        });
        cropReady.value = rectangle.width >= 16 && rectangle.height >= 16;
    }
}
function endCrop() {
    start = null;
}
function applyCrop() {
    const item = selected.value;
    const image = preview.value?.querySelector('img');
    if (!item || !image || !rectangle || !cropReady.value || !image.naturalWidth) return;
    // 预览是缩放过的，按 naturalWidth / clientWidth 换回原图像素再裁。
    const scale = image.naturalWidth / image.clientWidth;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(rectangle.width * scale);
    canvas.height = Math.round(rectangle.height * scale);
    canvas
        .getContext('2d')!
        .drawImage(
            image,
            rectangle.x * scale,
            rectangle.y * scale,
            rectangle.width * scale,
            rectangle.height * scale,
            0,
            0,
            canvas.width,
            canvas.height,
        );
    item.image = canvas.toDataURL('image/png');
    retry(item);
}

/* ---------------- 核对与保存 ---------------- */
/** 换部位：按新部位的规则重新解析识别文本，等于给这件装备换一套词条池。 */
function changeSlot(value: string) {
    const item = selected.value;
    if (!item || !item.draft || !value || item.draft.slot === value) return;
    item.draft.slot = value;
    item.draft.level = rules.isJade(value) ? '' : item.draft.level;
    item.detail = rules.equipmentImportRecord(item.draft, props.profile.id)
        .details as unknown as DraftDetail;
    refresh(item);
}
function rename(value: string) {
    const item = selected.value;
    if (!item || !item.draft) return;
    item.draft.name = value;
    refresh(item);
}
function setLevel(value: number | '') {
    const item = selected.value;
    if (!item || !item.draft) return;
    item.draft.level = value;
    refresh(item);
}
function setNote(value: string) {
    const item = selected.value;
    if (!item || !item.draft) return;
    item.draft.note = value;
}
async function submit() {
    if (!canSave.value) return;
    error.value = '';
    saving.value = true;
    try {
        const drafts = items.value.map(
            (item) => ({ ...item.draft!, details: pruneDetail(item.detail!) }) as EquipmentDraft,
        );
        const result = await app.execute((domain) =>
            domain.importEquipment(drafts, {
                characterId: props.profile.id,
                index: plan.value === '' ? null : Number(plan.value),
            }),
        );
        const parts = ['新建 ' + result.created + ' 件'];
        if (result.reused) parts.push('已存在 ' + result.reused + ' 件');
        if (result.equipped) parts.push('穿戴 ' + result.equipped + ' 件');
        else if (result.stored) parts.push('入库 ' + result.stored + ' 件');
        app.notify(parts.join('，'));
        emit('saved');
    } catch (failure) {
        error.value = message(failure);
    } finally {
        saving.value = false;
    }
}

// 属性区直接改草稿对象、不逐项发事件，所以用深监听刷新「待补充」的判定。
watch(
    () => selected.value?.detail,
    () => {
        if (selected.value) refresh(selected.value);
    },
    { deep: true },
);

const offProgress = gateway.onEquipmentOcrProgress(({ id, progress }) => {
    const item = items.value.find((entry) => entry.requestId === id);
    if (!item) return;
    item.progress = Math.round(Math.max(0, Math.min(1, progress)) * 100);
});
document.addEventListener('paste', onPaste);
onBeforeUnmount(() => {
    offProgress();
    document.removeEventListener('paste', onPaste);
    items.value
        .filter((item) => item.status === 'running')
        .forEach((item) => void gateway.cancelEquipmentOcr(item.requestId));
});
</script>

<template>
    <BaseModal
        title="截图录入装备"
        wide
        :busy="app.busy || saving"
        :dirty="dirty"
        @close="emit('close')"
    >
        <div class="shot-add">
            <div class="shot-add-text">
                <b>每张图放一件装备</b>
                <span class="hint">Ctrl+V 粘贴、拖入图片，或从文件选择；本地识别，不上传。</span>
            </div>
            <button
                class="btn primary"
                type="button"
                :disabled="saving"
                @click="pasteFromClipboard"
            >
                粘贴截图
            </button>
            <button class="btn" type="button" :disabled="saving" @click="pickFiles">
                选择图片
            </button>
            <input
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp,.bmp"
                multiple
                hidden
                @change="onFileChange"
            />
        </div>

        <div v-if="!items.length" class="shot-drop" @dragover.prevent @drop="onDrop">
            <p>把装备属性截图拖到这里，或点上面的「粘贴截图」</p>
            <p class="hint">图片只在内存里识别，关掉弹窗就没了</p>
        </div>

        <template v-else>
            <ul class="shot-queue" @dragover.prevent @drop="onDrop">
                <li
                    v-for="(item, index) in items"
                    :key="item.id"
                    class="shot-thumb"
                    :class="{ on: item.id === selectedId, bad: item.status === 'error' }"
                >
                    <button
                        type="button"
                        class="shot-pick"
                        :aria-label="'查看第 ' + (index + 1) + ' 张截图'"
                        @click="selectedId = item.id"
                    >
                        <img :src="item.image" alt="" />
                        <span v-if="item.status === 'running'" class="shot-badge">
                            识别中 {{ item.progress }}%
                        </span>
                        <span v-else-if="item.status === 'queued'" class="shot-badge">
                            等待识别
                        </span>
                        <span v-else-if="item.status === 'error'" class="shot-badge bad">
                            识别失败
                        </span>
                        <span v-else-if="item.error" class="shot-badge warn">待补充</span>
                    </button>
                    <button
                        type="button"
                        class="shot-remove"
                        :aria-label="'移除第 ' + (index + 1) + ' 张截图'"
                        @click="remove(item)"
                    >
                        ×
                    </button>
                </li>
            </ul>

            <div v-if="selected" class="shot-review">
                <div class="shot-preview">
                    <div
                        ref="preview"
                        class="shot-image"
                        :class="{ cropping }"
                        @pointerdown="onPointerDown"
                        @pointermove="onPointerMove"
                        @pointerup="endCrop"
                        @pointercancel="endCrop"
                    >
                        <img :src="selected.original" alt="装备截图" draggable="false" />
                        <span ref="cropBox" class="shot-crop" hidden></span>
                    </div>
                    <div class="shot-image-actions">
                        <template v-if="cropping">
                            <button
                                class="btn compact"
                                type="button"
                                :disabled="!cropReady"
                                @click="applyCrop"
                            >
                                识别选区
                            </button>
                            <button class="btn compact" type="button" @click="cropping = false">
                                取消裁剪
                            </button>
                        </template>
                        <template v-else>
                            <button
                                class="btn compact"
                                type="button"
                                :disabled="selected.status === 'running'"
                                @click="beginCrop"
                            >
                                裁剪重识别
                            </button>
                            <button
                                class="btn compact"
                                type="button"
                                :disabled="selected.status === 'running'"
                                @click="retry(selected)"
                            >
                                重新识别
                            </button>
                        </template>
                    </div>
                    <p class="hint shot-caption">
                        {{
                            cropping
                                ? '在图上拖出装备属性范围，再点「识别选区」'
                                : selected.status === 'running'
                                  ? '正在本地识别，请稍候…'
                                  : selected.status === 'queued'
                                    ? '排队中'
                                    : selected.status === 'error'
                                      ? selected.error
                                      : confidenceNote
                        }}
                    </p>
                </div>

                <div v-if="selected.draft && selected.detail" class="shot-fields">
                    <div class="shot-meta">
                        <label>
                            名称
                            <input
                                :value="selected.draft.name"
                                type="text"
                                placeholder="必填"
                                @input="rename(($event.target as HTMLInputElement).value)"
                            />
                        </label>
                        <label>
                            部位
                            <BaseSelect
                                :model-value="selected.draft.slot"
                                :options="slotOptions"
                                label="装备部位"
                                @update:model-value="changeSlot"
                            />
                        </label>
                        <label v-if="!rules.isJade(selected.draft.slot)">
                            等级
                            <BaseNumber
                                :model-value="selected.draft.level"
                                :min="0"
                                :max="999"
                                placeholder="可不填"
                                @update:model-value="setLevel"
                            />
                        </label>
                    </div>
                    <EquipmentFields v-model="selected.detail" :part="selected.draft.slot" />
                    <details class="shot-more">
                        <summary>备注与识别原文</summary>
                        <label class="shot-note">
                            备注
                            <textarea
                                :value="selected.draft.note"
                                rows="2"
                                placeholder="可不填"
                                @input="setNote(($event.target as HTMLTextAreaElement).value)"
                            ></textarea>
                        </label>
                        <pre class="shot-raw">{{ selected.draft.ocrText || '未识别到文字' }}</pre>
                    </details>
                    <p v-if="selected.error" class="error shot-error" role="alert">
                        {{ selected.error }}
                    </p>
                </div>
            </div>

            <div class="shot-plan">
                <label>
                    入库后
                    <BaseSelect v-model="plan" label="入库后是否穿戴" :options="planOptions" />
                </label>
                <span class="hint">只填该部位的空白，已有装备保留</span>
            </div>
        </template>

        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <span class="hint shot-summary" role="status" aria-live="polite">{{ summary }}</span>
            <button class="btn" :disabled="saving" @click="close">取消</button>
            <button class="btn primary" type="button" :disabled="!canSave" @click="submit">
                {{ saving ? '入库中…' : items.length ? '入库 ' + items.length + ' 件' : '入库' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.shot-add {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
}
.shot-add-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    margin-right: auto;
}
.shot-add-text b {
    font-size: 13px;
    font-weight: 600;
}
.shot-add-text .hint {
    font-size: 11.5px;
}
.shot-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 14px;
    padding: 34px 16px;
    border: 1px dashed var(--line-2);
    border-radius: 4px;
    background: var(--paper-2);
    text-align: center;
}
.shot-drop p {
    margin: 0;
    font-size: 13px;
}
.shot-queue {
    display: flex;
    gap: 8px;
    margin: 14px 0 0;
    padding: 0 0 4px;
    list-style: none;
    overflow-x: auto;
}
.shot-thumb {
    position: relative;
    flex: none;
    width: 108px;
}
.shot-pick {
    position: relative;
    display: block;
    width: 100%;
    height: 72px;
    padding: 0;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    overflow: hidden;
    background: var(--panel-3);
}
.shot-thumb.on .shot-pick {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
}
.shot-thumb.bad .shot-pick {
    border-color: color-mix(in srgb, var(--red) 55%, var(--line-2));
}
.shot-pick img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
}
.shot-badge {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 1px 4px;
    background: #2f2a24bf;
    color: #f6f1e7;
    font-size: 10.5px;
    text-align: center;
}
.shot-badge.bad {
    background: #a4342bbf;
}
.shot-badge.warn {
    background: #8a6d1fbf;
}
.shot-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: #2f2a24b3;
    color: #f6f1e7;
    font-size: 13px;
    line-height: 1;
}
.shot-remove:hover {
    background: var(--red);
}
.shot-review {
    display: grid;
    grid-template-columns: minmax(0, 250px) minmax(0, 1fr);
    gap: 14px;
    margin-top: 12px;
    align-items: start;
}
.shot-preview {
    min-width: 0;
}
.shot-image {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--panel-3);
    overflow: hidden;
}
.shot-image.cropping {
    cursor: crosshair;
}
.shot-image img {
    display: block;
    width: 100%;
    height: auto;
    user-select: none;
}
.shot-crop {
    position: absolute;
    border: 1px solid var(--gold);
    background: color-mix(in srgb, var(--gold) 18%, transparent);
    pointer-events: none;
}
.shot-image-actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
}
.shot-caption {
    margin: 6px 0 0;
    font-size: 11.5px;
}
.shot-fields {
    min-width: 0;
}
.shot-meta {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 0.8fr);
    gap: 8px;
}
.shot-meta label,
.shot-note {
    display: block;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
}
.shot-meta input {
    margin-top: 3px;
}
.shot-more {
    margin-top: 12px;
}
.shot-more > summary {
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
}
.shot-note textarea {
    margin-top: 4px;
}
.shot-raw {
    max-height: 140px;
    margin: 8px 0 0;
    padding: 8px 10px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--paper-2);
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre-wrap;
}
.shot-error {
    margin: 10px 0 0;
    font-size: 12px;
}
.shot-plan {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
}
.shot-plan label {
    display: block;
    width: 220px;
    font-size: 12.5px;
}
.shot-plan .hint {
    padding-bottom: 8px;
    font-size: 11.5px;
}
.shot-summary {
    margin-right: auto;
    font-size: 11.5px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
@media (max-width: 1080px) {
    .shot-review {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
