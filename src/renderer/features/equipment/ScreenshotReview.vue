<script setup lang="ts">
import { computed } from 'vue';
import { useApplication } from '../../stores/application';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import EquipmentFields from './EquipmentFields.vue';
import { useImageCrop } from './use-image-crop';
import type { ShotItem } from './use-ocr-queue';
import type { DraftDetail } from './properties';

/**
 * 单张截图的核对区：左边原图（可在上面框选重识别），右边识别出来的字段。
 *
 * 属性块与装备编辑器共用 `EquipmentFields`，所以截图录入的核对界面和手填的编辑界面
 * 长得一样、规则也一样——OCR 只是多一个文本来源，不是第二套导入逻辑。
 *
 * 草稿的修改不在这里落库：改名、换部位、改等级都往外抛事件，由队列那一层统一写回，
 * 因为「改完要重算待补充」这条规则跟着队列走。
 */
const props = defineProps<{ item: ShotItem }>();
const emit = defineEmits<{
    retry: [];
    cropped: [dataUrl: string];
    rename: [value: string];
    changeSlot: [value: string];
    setLevel: [value: number | ''];
    setNote: [value: string];
    detail: [value: DraftDetail];
}>();

const app = useApplication();
const rules = app.rules();
const slotOptions = computed(() =>
    rules.slots.filter((slot) => slot !== '其他').map((slot) => ({ value: slot, label: slot })),
);
const {
    cropping,
    cropReady,
    preview,
    cropBox,
    begin,
    cancel,
    apply,
    onPointerDown,
    onPointerMove,
    end,
} = useImageCrop((dataUrl) => emit('cropped', dataUrl));

const caption = computed(() => {
    if (cropping.value) return '在图上拖出装备属性范围，再点「识别选区」';
    if (props.item.status === 'running') return '正在本地识别，请稍候…';
    if (props.item.status === 'queued') return '排队中';
    if (props.item.status === 'error') return props.item.error;
    return props.item.confidence && props.item.confidence < 85
        ? '部分文字识别不确定，请对照原图核对数值'
        : '本地识别完成，可对照原图修正';
});
</script>

<template>
    <div class="shot-review">
        <div class="shot-preview">
            <div
                ref="preview"
                class="shot-image"
                :class="{ cropping }"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="end"
                @pointercancel="end"
            >
                <img :src="item.original" alt="装备截图" draggable="false" />
                <span ref="cropBox" class="shot-crop" hidden></span>
            </div>
            <div class="shot-image-actions">
                <template v-if="cropping">
                    <button class="btn compact" type="button" :disabled="!cropReady" @click="apply">
                        识别选区
                    </button>
                    <button class="btn compact" type="button" @click="cancel">取消裁剪</button>
                </template>
                <template v-else>
                    <button
                        class="btn compact"
                        type="button"
                        :disabled="item.status === 'running'"
                        @click="begin"
                    >
                        裁剪重识别
                    </button>
                    <button
                        class="btn compact"
                        type="button"
                        :disabled="item.status === 'running'"
                        @click="emit('retry')"
                    >
                        重新识别
                    </button>
                </template>
            </div>
            <p class="hint shot-caption">{{ caption }}</p>
        </div>

        <div v-if="item.draft && item.detail" class="shot-fields">
            <div class="shot-meta">
                <label>
                    名称
                    <input
                        :value="item.draft.name"
                        type="text"
                        placeholder="必填"
                        @input="emit('rename', ($event.target as HTMLInputElement).value)"
                    />
                </label>
                <label>
                    部位
                    <BaseSelect
                        :model-value="item.draft.slot"
                        :options="slotOptions"
                        label="装备部位"
                        @update:model-value="emit('changeSlot', $event)"
                    />
                </label>
                <label v-if="!rules.isJade(item.draft.slot)">
                    等级
                    <BaseNumber
                        :model-value="item.draft.level"
                        :min="0"
                        :max="999"
                        placeholder="可不填"
                        @update:model-value="emit('setLevel', $event)"
                    />
                </label>
            </div>
            <EquipmentFields
                :model-value="item.detail"
                :part="item.draft.slot"
                @update:model-value="emit('detail', $event)"
            />
            <details class="shot-more">
                <summary>备注与识别原文</summary>
                <label class="shot-note">
                    备注
                    <textarea
                        :value="item.draft.note"
                        rows="2"
                        placeholder="可不填"
                        @input="emit('setNote', ($event.target as HTMLTextAreaElement).value)"
                    ></textarea>
                </label>
                <pre class="shot-raw">{{ item.draft.ocrText || '未识别到文字' }}</pre>
            </details>
            <p v-if="item.error" class="error shot-error" role="alert">
                {{ item.error }}
            </p>
        </div>
    </div>
</template>

<style scoped>
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
@media (max-width: 1080px) {
    .shot-review {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
