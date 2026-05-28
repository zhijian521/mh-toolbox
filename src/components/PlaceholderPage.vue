<template>
  <div class="placeholder-page">
    <div class="placeholder-content">
      <div class="placeholder-icon">
        <AppIcon name="edit-pen" :size="48" />
      </div>
      <h2 class="placeholder-title">{{ title }}</h2>
      <p class="placeholder-desc">功能开发中，敬请期待</p>
      <div class="placeholder-line"></div>
    </div>
  </div>
</template>

<script setup>
import AppIcon from './AppIcon.vue'

defineProps({
  title: {
    type: String,
    default: '功能开发中'
  }
})
</script>

<style lang="less" scoped>
@import '../styles/variables.less';
@import '../styles/mixins.less';

.placeholder-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: @spacing-2xl;
}

.placeholder-content {
  text-align: center;
  max-width: 320px;
}

.placeholder-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border: 1px solid @color-primary;
  margin-bottom: @spacing-2xl;
  color: @color-primary;
}

.placeholder-title {
  .serif-title();
  font-size: 1.75rem;
  margin: 0 0 @spacing-md 0;
}

.placeholder-desc {
  .copy-text();
  margin: 0 0 @spacing-2xl 0;
}

.placeholder-line {
  width: 40px;
  height: 1px;
  background: @color-primary;
  margin: 0 auto;
  opacity: 0.3;
}
</style>
