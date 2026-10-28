<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useApplication } from '../stores/application';
import AppIcon from '../components/AppIcon.vue';
import ErrorBoundary from '../components/ErrorBoundary.vue';
import WindowControls from '../components/WindowControls.vue';
import RescuePanel from '../features/rescue/RescuePanel.vue';
import { loadTheme, themeDark, toggleTheme } from '../services/theme';
import { sections } from './navigation';
const application = useApplication();
const route = useRoute();
const collapsed = ref(localStorage.getItem('mhv2.sidebarCollapsed') === 'true');
function toggleSidebar() {
    collapsed.value = !collapsed.value;
    localStorage.setItem('mhv2.sidebarCollapsed', String(collapsed.value));
}
function switchTheme() {
    toggleTheme().catch((failure) => {
        application.notify(failure instanceof Error ? failure.message : String(failure), true);
    });
}
onMounted(() => {
    void loadTheme();
    void application.initialize();
});
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
                    :title="section.title"
                    :aria-label="section.title"
                >
                    <AppIcon :name="section.icon" />
                    <span v-if="!collapsed">{{ section.title }}</span>
                </RouterLink>
            </nav>
            <footer class="sidebar-footer">
                <!--
                    明暗切换放在折叠按钮旁边：换主题是随手动作，不该为此翻进设置页。
                    图标画的是「现在是什么」，悬停才说明「点了会变成什么」。
                -->
                <button
                    class="icon-button"
                    :aria-label="themeDark ? '切换到浅色模式' : '切换到深色模式'"
                    :title="themeDark ? '切换到浅色模式' : '切换到深色模式'"
                    :aria-pressed="themeDark"
                    @click="switchTheme"
                >
                    <AppIcon :name="themeDark ? 'moon' : 'sun'" />
                </button>
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
            <!--
                单个页面渲染抛错时只换掉工作区，侧栏仍可用：替代界面给出重开与回角色页
                两条出路，而不是留一片白屏。
            -->
            <ErrorBoundary v-else :reset-key="route.path">
                <RouterView :key="route.path" />
            </ErrorBoundary>
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
    border: 1px solid color-mix(in srgb, var(--red) 19%, transparent);
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
    background: var(--danger-bg);
    color: color-mix(in srgb, var(--red) 78%, var(--ink));
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
    background: var(--warn-bg);
}
/*
 * 只剩两个图标按钮，居中摆。原来左边那行「本地保存 · 独立数据」是启动时的自我
 * 说明，看两天就成噪音了，占的位置正好给明暗切换。
 */
.sidebar-footer {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-top: 1px solid var(--line);
    padding: 9px 0;
    flex-shrink: 0;
}
/* 收起后侧栏只有 64px，两个按钮横排放不下，改成一列。 */
.collapsed .sidebar-footer {
    flex-direction: column;
    gap: 4px;
}
/*
 * 侧栏底色就是 --paper-2，全局 .icon-button:hover 也用它，等于没反馈。
 * 这一处换成深一档的 --panel-3，指上去才看得出按到了哪个。
 */
.sidebar-footer .icon-button:hover:not(:disabled) {
    background: var(--panel-3);
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
.workspace {
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
/*
 * 成功与失败要能一眼分开：只看文字颜色的差别在余光里几乎等于没有。
 * 底色、边框、前置符号三处同时变，扫一眼就知道刚才那下成没成。
 */
.toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 20px;
    border: 1px solid color-mix(in srgb, var(--green) 45%, var(--line));
    border-radius: 4px;
    background: color-mix(in srgb, var(--green) 10%, var(--paper));
    box-shadow: 0 3px 12px var(--shadow);
    color: var(--green);
    z-index: 100;
}
.toast::before {
    content: '✓';
    font-weight: 700;
}
.toast.error {
    border-color: color-mix(in srgb, var(--red) 45%, var(--line));
    background: color-mix(in srgb, var(--red) 9%, var(--paper));
    color: var(--red);
}
.toast.error::before {
    content: '!';
}
</style>
