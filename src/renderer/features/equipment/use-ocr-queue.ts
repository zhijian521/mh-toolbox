import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { EquipmentDraft, Domain } from '../../app/types';
import { desktop } from '../../services/desktop';
import type { useApplication } from '../../stores/application';
import { pruneDetail, type DraftDetail } from './properties';

type AppStore = ReturnType<typeof useApplication>;
export type ItemStatus = 'queued' | 'running' | 'ready' | 'error';
export interface ShotItem {
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

/**
 * 截图队列与本地识别。
 *
 * 一次只认一张：模型常驻占内存，并发反而让进度条失真，出错也更难定位是哪张。
 * 图片只在内存里过一遍——渲染层拿 dataURL，主进程解码校验后丢给独立进程识别，
 * 不落盘、不上传；识别完队列里只留缩略图供对照，关掉弹窗即全部释放。
 *
 * 之所以把队列抽成组合式函数：识别进度订阅、粘贴监听、卸载时的取消，这三件事都挂在
 * 组件生命周期上，但和「核对表单」「入库」没有关系。留在弹窗里会让那个 setup 同时
 * 管着 OCR 状态机与表单编排，改一样得先确认没碰到另一样。
 */
export function useOcrQueue(options: {
    app: AppStore;
    rules: Domain;
    profileId: string;
    /** 入库进行中：由弹窗持有（它才知道什么时候在提交），这里只用来压住保存按钮。 */
    saving: Ref<boolean>;
}) {
    const { app, rules, profileId, saving } = options;
    const gateway = desktop();
    const limits = rules.equipmentImportLimits;

    const items = ref<ShotItem[]>([]);
    const selectedId = ref('');
    /** 正在读文件（FileReader 阶段），只影响提示文案。 */
    const reading = ref(0);
    const fileInput = ref<HTMLInputElement>();

    const selected = computed(
        () => items.value.find((item) => item.id === selectedId.value) || null,
    );
    const busyCount = computed(
        () =>
            items.value.filter((item) => item.status === 'queued' || item.status === 'running')
                .length,
    );
    const incomplete = computed(
        () => items.value.filter((item) => item.status === 'ready' && item.error).length,
    );
    /**
     * 识别失败的张数（`draft` / `detail` 都是空）。
     *
     * 它必须单独算一份并挡在 `canSave` 上：失败项的 `status` 既不是 `ready` 也不是
     * `queued`，以前两头都不占，按钮照样亮着，点下去 `pruneDetail(null)` 直接抛
     * `TypeError`，整批都存不了，界面上还只显示一句英文堆栈。
     */
    const failed = computed(() => items.value.filter((item) => item.status === 'error').length);
    const dirty = computed(() => items.value.length > 0);
    const canSave = computed(
        () =>
            items.value.length > 0 &&
            !busyCount.value &&
            !incomplete.value &&
            !failed.value &&
            !saving.value,
    );

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
        const error = rules.equipmentImportError(draft, profileId);
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
                        item.detail = rules.equipmentImportRecord(item.draft, profileId)
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
        void pump();
    }
    function remove(item: ShotItem) {
        if (item.status === 'running') void gateway.cancelEquipmentOcr(item.requestId);
        const index = items.value.indexOf(item);
        items.value.splice(index, 1);
        if (selectedId.value === item.id)
            selectedId.value = (items.value[index] || items.value[index - 1] || { id: '' }).id;
    }
    /** 裁完之后换掉识别用的图再重排队，原图留着（下次还能往外扩）。 */
    function replaceImage(item: ShotItem, dataUrl: string) {
        item.image = dataUrl;
        retry(item);
    }

    /* ---------------- 单件编辑 ---------------- */
    /** 换部位：按新部位的规则重新解析识别文本，等于给这件装备换一套词条池。 */
    function changeSlot(value: string) {
        const item = selected.value;
        if (!item || !item.draft || !value || item.draft.slot === value) return;
        item.draft.slot = value;
        item.draft.level = rules.isJade(value) ? '' : item.draft.level;
        item.detail = rules.equipmentImportRecord(item.draft, profileId)
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
    /** 属性区整块换了新对象：写回草稿后重算「待补充」。 */
    function setDetail(value: DraftDetail) {
        const item = selected.value;
        if (!item) return;
        item.detail = value;
        refresh(item);
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

    return {
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
        confidenceNote,
        ingest,
        pickFiles,
        pasteFromClipboard,
        onPaste,
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
    };
}
