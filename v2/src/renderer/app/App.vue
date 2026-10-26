<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useApplication } from '../stores/application';
import AppIcon from '../components/AppIcon.vue';
import WindowControls from '../components/WindowControls.vue';
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
            <div v-else-if="application.startupError" class="empty">
                <h2>暂时无法打开手账</h2>
                <p class="error">{{ application.startupError }}</p>
                <button class="btn" @click="application.initialize">重试</button>
            </div>
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
