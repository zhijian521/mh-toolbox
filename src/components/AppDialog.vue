<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="close">
        <div class="dialog-box" :style="{ maxWidth: width }">
          <!-- 头部 -->
          <header class="dialog-header" v-if="$slots.header || title">
            <slot name="header">
              <h3 class="dialog-title">{{ title }}</h3>
            </slot>
            <button class="dialog-close" @click="close" title="关闭">
              <AppIcon name="close" :size="18" />
            </button>
          </header>

          <!-- 主体 -->
          <div class="dialog-body">
            <slot />
          </div>

          <!-- 底部 -->
          <footer class="dialog-footer" v-if="$slots.footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '480px' },
  closeOnOverlay: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'close'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const close = () => {
  visible.value = false
  emit('close')
}

const onKeydown = (e) => {
  if (e.key === 'Escape' && visible.value) close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<style lang="less" scoped>
@import '../styles/variables.less';

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.15);
}

.dialog-box {
  width: calc(100% - 48px);
  border: 1px solid @color-primary;
  background: @bg-paper;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 80px);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: @spacing-lg @spacing-2xl;
  border-bottom: 1px solid @color-border;
  background: @color-muted;
  flex-shrink: 0;
}

.dialog-title {
  margin: 0;
  font-family: @font-serif;
  font-weight: 600;
  font-size: 1.125rem;
  color: @text-primary;
}

.dialog-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  background: transparent;
  color: @text-muted;
  cursor: pointer;
  transition: all @transition-fast ease;

  &:hover {
    border-color: @color-primary;
    color: @color-primary;
  }
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: @spacing-2xl;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: @spacing-md;
  padding: @spacing-lg @spacing-2xl;
  border-top: 1px solid @color-border;
  flex-shrink: 0;
}

/* 过渡动画 */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;

  .dialog-box {
    transition: transform 0.2s ease, opacity 0.2s ease;
  }
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;

  .dialog-box {
    transform: scale(0.96);
    opacity: 0;
  }
}
</style>
