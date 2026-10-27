<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useApplication } from '../stores/application';
import AppIcon from '../components/AppIcon.vue';
import WindowControls from '../components/WindowControls.vue';
import RescuePanel from '../features/rescue/RescuePanel.vue';
import { sections } from './navigation';
const application = useApplication();
const route = useRoute();
const collapsed = ref(localStorage.getItem('mhv2.sidebarCollapsed') === 'true');
function toggleSidebar() {
    collapsed.value = !collapsed.value;
    localStorage.setItem('mhv2.sidebarCollapsed', String(collapsed.value));
}
onMounted(application.initialize);
</script>
<template>
    <div id="app-shell" :class="{ collapsed }">
        <header class="titlebar">
            <span class="titlebar-brand">
                梦幻养老助手
                <small>V2</small>
            </span>
            <WindowControls />
        </header>
        <aside class="sidebar">
            <div class="brand">
                <span class="seal">梦</span>
                <div v-if="!collapsed">
                    <h1>梦幻养老助手</h1>
                    <p>养老手账 · V2</p>
                </div>
            </div>
            <nav id="main-menu" aria-label="主菜单">
                <RouterLink
                    v-for="section in sections"
                    :key="section.path"
                    :to="section.path"
                    class="nav-item"
                    :title="section.title + (section.pending ? ' · 待迁移' : '')"
                    :aria-label="section.title"
                >
                    <AppIcon :name="section.icon" />
                    <span v-if="!collapsed">{{ section.title }}</span>
                    <small v-if="section.pending && !collapsed" aria-hidden="true">待迁移</small>
                </RouterLink>
            </nav>
            <footer class="sidebar-footer">
                <span v-if="!collapsed">本地保存 · 独立数据</span>
                <button
                    class="icon-button"
                    :aria-label="collapsed ? '展开菜单' : '收起菜单'"
                    :title="collapsed ? '展开菜单' : '收起菜单'"
                    :aria-expanded="!collapsed"
                    aria-controls="main-menu"
                    @click="toggleSidebar"
                >
                    <AppIcon :name="collapsed ? 'panel-expand' : 'panel-collapse'" />
                </button>
            </footer>
        </aside>
        <main class="workspace">
            <div v-if="application.loading" class="empty" role="status">正在打开手账…</div>
            <!--
                启动失败不再只是「重试」：重试走的是同一条必然失败的路径，而设置页
                在路由未挂载时又不可达。这里直接给出可执行的自救手段。
            -->
            <RescuePanel v-else-if="application.startupError" />
            <RouterView v-else :key="route.path" />
        </main>
    </div>
    <div
        v-if="application.toast"
        class="toast"
        :class="{ error: application.toastError }"
        :role="application.toastError ? 'alert' : 'status'"
    >
        {{ application.toast }}
    </div>
</template>

<style scoped>
#app-shell {
    height: 100vh;
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    grid-template-rows: 36px minmax(0, 1fr);
}
#app-shell.collapsed {
    grid-template-columns: 64px minmax(0, 1fr);
}
.titlebar {
    grid-column: 1/-1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-left: 14px;
    background: var(--panel-3);
    border-bottom: 1px solid var(--line);
    font-size: 12px;
    -webkit-app-region: drag;
    user-select: none;
    color: var(--muted);
}
.titlebar-brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    letter-spacing: 0.5px;
}
.titlebar-brand small {
    color: var(--red);
    font-size: 10px;
    line-height: 16px;
    padding: 0 5px;
    border: 1px solid #b33a3a30;
    border-radius: 3px;
    letter-spacing: 0;
}
.sidebar {
    display: flex;
    flex-direction: column;
    background: var(--paper-2);
    border-right: 1px solid var(--line);
    min-height: 0;
    user-select: none;
}
.brand {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 25px 17px 28px;
    white-space: nowrap;
}
.seal {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 34px;
    height: 36px;
    border: 1px solid var(--red);
    border-radius: 3px;
    font-size: 24px;
    color: var(--red);
}
.brand h1 {
    font-size: 16px;
}
.brand p {
    font-size: 12px;
    color: var(--muted);
    letter-spacing: 1px;
    margin-top: 4px;
}
.sidebar nav {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 0 12px;
    overflow-y: auto;
    min-height: 0;
}
.nav-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 11px;
    border: 0;
    background: none;
    border-radius: 3px;
    min-height: 40px;
    text-decoration: none;
    color: inherit;
    padding: 0 13px;
    text-align: left;
    white-space: nowrap;
    font-size: 14px;
    flex-shrink: 0;
    transition:
        background-color 120ms ease,
        color 120ms ease;
}
.nav-item.router-link-active {
    background: #ead9c7;
    color: #8d3430;
}
.nav-item.router-link-active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 18px;
    border-radius: 0 2px 2px 0;
    background: var(--red);
}
.nav-item:not(.router-link-active):hover {
    background: #eee4d3;
}
.nav-item small {
    font-size: 10px;
    margin-left: auto;
    color: var(--muted);
    border: 1px solid #c2b58f80;
    border-radius: 3px;
    padding: 1px 4px;
    line-height: 15px;
}
.sidebar-footer {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid var(--line);
    min-height: 49px;
    padding: 8px 15px;
    font-size: 11.5px;
    color: var(--muted);
    flex-shrink: 0;
}
.collapsed .brand {
    padding: 25px 15px 28px;
}
.collapsed .sidebar nav {
    padding: 0 10px;
}
.collapsed .nav-item {
    padding: 0;
    justify-content: center;
}
.collapsed .sidebar-footer {
    justify-content: center;
}
.workspace {
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 11px 20px;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    background: var(--paper);
    box-shadow: 0 3px 12px #2f2a2414;
    color: var(--green);
    z-index: 100;
}
.toast.error {
    color: var(--red);
}
</style>
