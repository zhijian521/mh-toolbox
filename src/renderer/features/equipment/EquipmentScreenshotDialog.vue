<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EquipmentDraft, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import ScreenshotQueue from './ScreenshotQueue.vue';
import ScreenshotReview from './ScreenshotReview.vue';
import { useOcrQueue } from './use-ocr-queue';
import { pruneDetail } from './properties';

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
 * 这一层只做编排：加图、队列、核对、入库后是否穿戴、提交。队列与识别状态机在
 * `use-ocr-queue.ts`，框选裁剪在 `use-image-crop.ts`，两块界面各有一个组件。
 */
/**
 * `index` 只在「从某个空位点进来」时传：默认入库后就穿到那一套，
 * 免得用户识别完还要回装备栏再点一次。从工具栏进来时留空，不自动穿戴。
 */
const props = defineProps<{ profile: EquipmentProfile; index?: number | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

const plan = ref(props.index == null ? '' : String(props.index));
const error = ref('');
const saving = ref(false);

const {
    items,
    selectedId,
    selected,
    reading,
    fileInput,
    busyCount,
    incomplete,
    failed,
    dirty,
    canSave,
    pickFiles,
    pasteFromClipboard,
    onDrop,
    onFileChange,
    retry,
    remove,
    replaceImage,
    changeSlot,
    rename,
    setLevel,
    setNote,
    setDetail,
} = useOcrQueue({ app, rules, profileId: props.profile.id, saving });

const planOptions = computed(() => [
    { value: '', label: '只入库，不自动穿戴' },
    ...props.profile.equipmentSets.map((set, index) => ({
        value: String(index),
        label: set.name,
    })),
]);
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
    if (failed.value)
        return items.value.length + ' 件 · ' + failed.value + ' 件识别失败，先重试或移除';
    if (incomplete.value) return items.value.length + ' 件 · ' + incomplete.value + ' 件待补充';
    return items.value.length + ' 件可保存 · 请对照原图核对';
});

/** 队列里选中某一张。模板里不能直接给解构出来的 ref 赋值，所以收在这里。 */
function selectItem(id: string) {
    selectedId.value = id;
}
function retrySelected() {
    if (selected.value) retry(selected.value);
}
function cropSelected(dataUrl: string) {
    if (selected.value) replaceImage(selected.value, dataUrl);
}

async function submit() {
    if (!canSave.value) return;
    error.value = '';
    // 兜底：只有「识别成功且核对过」的条目能进库，避免任何一条空草稿把整批带崩。
    if (!items.value.every((item) => item.status === 'ready' && item.draft && item.detail)) {
        error.value = '还有图片没有识别成功，先重试或移除后再保存';
        return;
    }
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
        error.value = failure instanceof Error ? failure.message : String(failure);
    } finally {
        saving.value = false;
    }
}
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
            <ScreenshotQueue
                :items="items"
                :selected-id="selectedId"
                @select="selectItem"
                @remove="remove"
                @drop="onDrop"
            />

            <ScreenshotReview
                v-if="selected"
                :item="selected"
                @retry="retrySelected"
                @cropped="cropSelected"
                @rename="rename"
                @change-slot="changeSlot"
                @set-level="setLevel"
                @set-note="setNote"
                @detail="setDetail"
            />

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
</style>
