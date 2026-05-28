<template>
  <div class="layout-root">
    <!-- 左侧竖排窄栏 -->
    <aside class="sidebar">
      <!-- 品牌 Logo -->
      <div class="sidebar-brand">
        <router-link to="/online-record" class="brand-link" title="工具箱">
          <img src="/images/logo.png" alt="工具箱" class="brand-logo" />
        </router-link>
      </div>

      <!-- Tabs 导航 — 竖排文字 -->
      <nav class="sidebar-nav">
        <router-link
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          class="nav-tab"
          :class="{ active: isActive(tab.path) }"
          :title="tab.label"
        >
          <AppIcon class="nav-icon" :name="tab.icon" :size="18" />
          <span class="nav-label">{{ tab.label }}</span>
        </router-link>
      </nav>

      <!-- 底部外链 -->
      <div class="sidebar-bottom">
        <a
          class="bottom-btn"
          href="https://xyq.163.com"
          target="_blank"
          rel="noopener"
          title="梦幻西游官网">
          <img src="/icons/icon.svg" alt="梦幻西游" class="bottom-icon-img" />
        </a>
        <a
          class="bottom-btn"
          href="https://github.com/zhijian521/mh-toolbox"
          target="_blank"
          rel="noopener"
          title="GitHub">
          <svg class="bottom-icon-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
      </div>
    </aside>

    <!-- 右侧内容区 — 撑满 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import AppIcon from './AppIcon.vue'

const route = useRoute()

const tabs = [
  { path: '/online-record', label: '收益记录', icon: 'clock' },
  { path: '/trade-record', label: '交易记录', icon: 'coin' },
  { path: '/character-record', label: '角色记录', icon: 'user-filled' },
  { path: '/growth-record', label: '养成记录', icon: 'trend-charts' },
]

const isActive = (path) => route.path.startsWith(path)
</script>

<style lang="less" scoped>
@import '../styles/variables.less';
@import '../styles/mixins.less';

.layout-root {
  display: flex;
  min-height: 100vh;
}

/* ========== 侧边栏 — 窄竖排 ========== */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: @sidebar-width;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 1px solid @color-primary;
  background: @bg-paper;
  z-index: 40;
}

/* 品牌 Logo — 撑满 */
.sidebar-brand {
  width: 100%;
  border-bottom: 1px solid @color-border;
}

.brand-link {
  display: block;
  width: 100%;
  transition: opacity @transition-fast ease;
  text-decoration: none;

  &:hover { opacity: 0.8; }
}

.brand-logo {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}

/* 导航 — 竖排 */
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: @spacing-sm 0;
  gap: 0;
  width: 100%;
}

.nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: @spacing-md 4px;
  width: 100%;
  font-size: 0.75rem;
  font-weight: 500;
  color: @text-muted;
  transition: all @transition-fast ease;
  text-decoration: none;
  border-left: 2px solid transparent;
  border-right: 2px solid transparent;

  &:hover {
    background: @color-primary-light;
    color: @color-primary;
  }

  &.active {
    background: @color-primary;
    color: @color-primary-foreground;
  }
}

.nav-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
}

.nav-label {
  writing-mode: vertical-rl;
  letter-spacing: 0.15em;
  line-height: 1;
}

/* 底部外链 */
.sidebar-bottom {
  padding: @spacing-sm 0;
  border-top: 1px solid @color-border;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.bottom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: @spacing-sm @spacing-sm;
  margin: 1px @spacing-sm;
  border-radius: @radius-md;
  color: @text-muted;
  transition: all @transition-fast ease;

  &:hover {
    background: @color-primary-light;
    color: @color-primary;
  }
}

.bottom-icon-img {
  width: 18px;
  height: 18px;
  border-radius: 2px;
  object-fit: contain;
}

.bottom-icon-svg {
  width: 18px;
  height: 18px;
}

/* ========== 右侧内容区 — 撑满 ========== */
.main-content {
  flex: 1;
  margin-left: @sidebar-width;
  min-height: 100vh;
  padding: @spacing-2xl @spacing-2xl @spacing-2xl @spacing-2xl;
}
</style>
