<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import AppIcon from './AppIcon.vue';
import { tabbable } from './focus';
import { closeLayer, isTopLayer, onLayerChange, openLayer } from './modal-layer';
const props = withDefaults(
    defineProps<{
        title: string;
        wide?: boolean;
        medium?: boolean;
        busy?: boolean;
        dirty?: boolean;
    }>(),
    { wide: false, medium: false, busy: false, dirty: false },
);
const emit = defineEmits<{ close: [] }>();
const overlay = ref<HTMLElement>(),
    panel = ref<HTMLElement>(),
    discard = ref<HTMLElement>();
const confirming = ref(false);
/**
 * 每个实例独立的标题 ID。
 *
 * 以前写死 `modal-title`，而弹窗挂到 body 后可以叠层（见 `modal-layer.ts`）：
 * 两层同时存在时文档里会出现两个同名 ID，内层的 `aria-labelledby` 会解析到外层标题，
 * 读屏念出的标题与内容不符。`useId()` 保证同一份模板渲染多次也不重名。
 */
const uid = useId();
const titleId = 'modal-title-' + uid;
const discardTitleId = 'discard-title-' + uid;
const discardDescriptionId = 'discard-description-' + uid;
/** 是否是最上层弹窗：叠层时只有它响应 Escape、Tab 与遮罩点击，其余整块 inert。 */
const top = ref(true);
let previous: HTMLElement | null, editingFocus: HTMLElement | null;
let layer = 0,
    offLayer = () => {};
/** 弹窗内的可聚焦元素；未挂载时返回空列表。判定规则见 `focus.ts`。 */
function focusable(root?: HTMLElement) {
    return root ? tabbable(root) : [];
}
async function requestClose() {
    if (props.busy) return;
    if (!props.dirty) {
        emit('close');
        return;
    }
    editingFocus = document.activeElement as HTMLElement;
    confirming.value = true;
    await nextTick();
    focusable(discard.value)[0]?.focus();
}
async function continueEditing() {
    confirming.value = false;
    await nextTick();
    editingFocus?.focus({ preventScroll: true });
}
function onKeydown(event: KeyboardEvent) {
    // 叠层时外层也会收到这个捕获阶段的 keydown，必须让给最上面那层。
    if (!isTopLayer(layer)) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (confirming.value) void continueEditing();
        else void requestClose();
    }
    if (event.key !== 'Tab') return;
    const elements = focusable(confirming.value ? discard.value : panel.value);
    const index = elements.indexOf(document.activeElement as HTMLElement);
    if (!elements.length) {
        event.preventDefault();
        panel.value?.focus();
        return;
    }
    if (event.shiftKey && index <= 0) {
        event.preventDefault();
        elements.at(-1)?.focus();
    } else if (!event.shiftKey && (index < 0 || index === elements.length - 1)) {
        event.preventDefault();
        elements[0]?.focus();
    }
}
onMounted(async () => {
    previous = document.activeElement as HTMLElement;
    layer = openLayer();
    top.value = isTopLayer(layer);
    offLayer = onLayerChange(() => {
        top.value = isTopLayer(layer);
    });
    document.addEventListener('keydown', onKeydown, true);
    await nextTick();
    const initial = panel.value?.querySelector<HTMLElement>(
        '[autofocus],input:not([type="hidden"]),select,textarea',
    );
    (initial || focusable(panel.value)[0] || panel.value)?.focus();
});
onBeforeUnmount(() => {
    offLayer();
    closeLayer(layer);
    document.removeEventListener('keydown', onKeydown, true);
    if (previous?.isConnected) previous.focus({ preventScroll: true });
});
</script>
<template>
    <Teleport to="body">
        <div ref="overlay" class="modal-overlay" @mousedown.self.prevent="requestClose">
            <section
                ref="panel"
                class="modal"
                :class="{ wide, medium }"
                :role="confirming ? undefined : 'dialog'"
                :aria-modal="confirming ? undefined : true"
                :aria-labelledby="confirming ? undefined : titleId"
                :inert="top ? undefined : true"
                tabindex="-1"
            >
                <div class="modal-content" :inert="confirming || undefined">
                    <header class="modal-head">
                        <h2 :id="titleId">{{ title }}</h2>
                        <button
                            class="icon-button"
                            aria-label="关闭"
                            :disabled="busy"
                            @click="requestClose"
                        >
                            <AppIcon name="close" />
                        </button>
                    </header>
                    <slot name="navigation" />
                    <div class="modal-body"><slot /></div>
                    <footer class="modal-foot">
                        <slot name="footer" :close="requestClose">
                            <button class="btn" :disabled="busy" @click="requestClose">关闭</button>
                        </slot>
                    </footer>
                </div>
                <div
                    v-if="confirming"
                    ref="discard"
                    class="discard-overlay"
                    role="alertdialog"
                    aria-modal="true"
                    :aria-labelledby="discardTitleId"
                    :aria-describedby="discardDescriptionId"
                >
                    <div class="discard-panel">
                        <h3 :id="discardTitleId">放弃未保存的修改？</h3>
                        <p :id="discardDescriptionId">本次修改尚未保存，关闭后将丢失。</p>
                        <div class="actions">
                            <button class="btn primary" @click="continueEditing">继续编辑</button>
                            <button class="btn danger" @click="emit('close')">放弃修改</button>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </Teleport>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30px;
    z-index: 50;
}
.modal {
    position: relative;
    width: min(470px, 100%);
    max-height: calc(100vh - 60px);
    background: var(--paper);
    border: 1px solid var(--line-2);
    border-radius: 5px;
    box-shadow: 0 5px 24px var(--shadow);
    overflow: hidden;
    outline: none;
}
.modal.medium {
    width: min(760px, 100%);
}
.modal.wide {
    width: min(880px, 100%);
}
.modal-content {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 62px);
}
.modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    flex: none;
}
.modal-head h2 {
    font-size: 18px;
}
.modal-body {
    padding: 6px 20px 20px;
    overflow: auto;
    min-height: 0;
    scroll-padding-top: 12px;
}
.modal-body > p + p {
    margin-top: 12px;
}
.modal-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding: 12px 20px;
    background: var(--paper-2);
    flex: none;
}
.discard-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 25px;
    /* 盖在弹窗上的那层：半透明纸色，暗色下自动变成半透明暗底。 */
    background: color-mix(in srgb, var(--paper) 72%, transparent);
}
.discard-panel {
    background: var(--paper);
    border: 1px solid var(--line-2);
    border-radius: 4px;
    padding: 24px;
    max-width: 400px;
    box-shadow: 0 4px 15px var(--shadow);
}
.discard-panel h3 {
    font-size: 17px;
    margin-bottom: 10px;
}
.discard-panel .actions {
    justify-content: flex-end;
    margin-top: 20px;
}
@media (max-width: 1150px) {
    .modal.medium {
        width: min(700px, 100%);
    }
    .modal.wide {
        width: min(780px, 100%);
    }
}
@media (max-width: 750px) {
    .modal-overlay {
        padding: 15px;
    }
    .modal,
    .modal-content {
        max-height: calc(100vh - 30px);
    }
}
</style>
