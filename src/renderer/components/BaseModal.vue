<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { tabbable } from './focus';
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
let previous: HTMLElement | null, editingFocus: HTMLElement | null;
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
    document.getElementById('app-shell')?.setAttribute('inert', '');
    document.addEventListener('keydown', onKeydown, true);
    await nextTick();
    const initial = panel.value?.querySelector<HTMLElement>(
        '[autofocus],input:not([type="hidden"]),select,textarea',
    );
    (initial || focusable(panel.value)[0] || panel.value)?.focus();
});
onBeforeUnmount(() => {
    document.getElementById('app-shell')?.removeAttribute('inert');
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
                :aria-labelledby="confirming ? undefined : 'modal-title'"
                tabindex="-1"
            >
                <div class="modal-content" :inert="confirming || undefined">
                    <header class="modal-head">
                        <h2 id="modal-title">{{ title }}</h2>
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
                    aria-labelledby="discard-title"
                    aria-describedby="discard-description"
                >
                    <div class="discard-panel">
                        <h3 id="discard-title">放弃未保存的修改？</h3>
                        <p id="discard-description">本次修改尚未保存，关闭后将丢失。</p>
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
    background: #2f2a2445;
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
    box-shadow: 0 5px 24px #2f2a241c;
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
    background: #fbf7ecb8;
}
.discard-panel {
    background: var(--paper);
    border: 1px solid var(--line-2);
    border-radius: 4px;
    padding: 24px;
    max-width: 400px;
    box-shadow: 0 4px 15px #2f2a2414;
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
