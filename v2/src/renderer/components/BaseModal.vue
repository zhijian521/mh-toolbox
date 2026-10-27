<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
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
function focusable(root?: HTMLElement) {
    return [
        ...(root?.querySelectorAll<HTMLElement>(
            'button,input,select,textarea,a[href],[tabindex="0"]',
        ) || []),
    ].filter(
        (element) =>
            !element.matches(':disabled') &&
            !element.closest('[inert]') &&
            element.getClientRects().length,
    );
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
