<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { useApplication } from '../stores/application';
import { desktopOrNull } from '../services/desktop';

const application = useApplication();
const maximized = ref(false);
const available = !!desktopOrNull();
let unsubscribe: (() => void) | undefined;

onMounted(async () => {
    const gateway = desktopOrNull();
    if (!gateway) return;
    unsubscribe = gateway.onWindowStateChanged((state) => {
        maximized.value = state.maximized;
    });
    try {
        maximized.value = (await gateway.getWindowState()).maximized;
    } catch {
        application.notify('无法获取窗口状态，请重新打开 V2。', true);
    }
});
onUnmounted(() => unsubscribe?.());

async function windowAction(action: 'minimize' | 'maximize' | 'close') {
    try {
        await desktopOrNull()?.window(action);
    } catch {
        application.notify('窗口操作失败，请重试。', true);
    }
}
</script>

<template>
    <div class="window-controls" role="group" aria-label="窗口控制">
        <button
            type="button"
            class="window-control"
            aria-label="最小化"
            title="最小化"
            :disabled="!available"
            @click="windowAction('minimize')"
        >
            <AppIcon name="window-minimize" :size="14" />
        </button>
        <button
            type="button"
            class="window-control"
            :aria-label="maximized ? '还原窗口' : '最大化'"
            :title="maximized ? '还原窗口' : '最大化'"
            :disabled="!available"
            @click="windowAction('maximize')"
        >
            <AppIcon :name="maximized ? 'window-restore' : 'window-maximize'" :size="14" />
        </button>
        <button
            type="button"
            class="window-control window-close"
            aria-label="关闭窗口"
            title="关闭窗口"
            :disabled="!available"
            @click="windowAction('close')"
        >
            <AppIcon name="window-close" :size="14" />
        </button>
    </div>
</template>

<style scoped>
.window-controls {
    display: flex;
    align-self: stretch;
    height: 100%;
    -webkit-app-region: no-drag;
}
.window-control {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 0;
    border-radius: 0;
    width: 44px;
    height: 100%;
    padding: 0;
    color: var(--ink);
    transition:
        background-color 120ms ease,
        color 120ms ease;
}
.window-control svg {
    display: block;
}
.window-control:focus-visible {
    outline-offset: -3px;
}
.window-control:hover:not(:disabled) {
    background: var(--line);
}
.window-control:active:not(:disabled) {
    background: var(--line-2);
}
.window-close:hover:not(:disabled),
.window-close:active:not(:disabled) {
    background: var(--red);
    color: var(--paper);
}
</style>
