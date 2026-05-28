<template>
  <div class="app-popover" ref="rootEl">
    <div ref="triggerEl" @click="toggle" class="app-popover__trigger">
      <slot name="reference" />
    </div>
    <Teleport to="body">
      <Transition name="popover">
        <div
          v-if="open"
          class="app-popover__float"
          :style="floatStyle"
          ref="floatEl">
          <slot />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  placement: { type: String, default: 'bottom' },
  width: { type: [Number, String], default: 220 },
})

const open = ref(false)
const rootEl = ref(null)
const triggerEl = ref(null)
const floatEl = ref(null)
const floatStyle = ref({})

const toggle = () => {
  open.value = !open.value
  if (open.value) nextTick(() => updatePosition())
}

const close = () => { open.value = false }

const updatePosition = () => {
  if (!triggerEl.value) return
  const rect = triggerEl.value.getBoundingClientRect()
  const fw = typeof props.width === 'number' ? props.width : parseInt(props.width) || 220

  let top, left
  switch (props.placement) {
    case 'bottom':
      top = rect.bottom + 6
      left = rect.left + rect.width / 2 - fw / 2
      break
    case 'right-start':
      top = rect.top
      left = rect.right + 6
      break
    default:
      top = rect.bottom + 6
      left = rect.left
  }

  // clamp to viewport
  if (left < 8) left = 8
  if (left + fw > window.innerWidth - 8) left = window.innerWidth - fw - 8
  if (top < 8) top = 8

  floatStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${fw}px`,
    zIndex: 900,
  }
}

const onClickOutside = (e) => {
  if (!open.value) return
  if (rootEl.value && rootEl.value.contains(e.target)) return
  if (floatEl.value && floatEl.value.contains(e.target)) return
  close()
}

onMounted(() => document.addEventListener('click', onClickOutside, true))
onUnmounted(() => document.removeEventListener('click', onClickOutside, true))
</script>

<style lang="less" scoped>
@import '../styles/variables.less';

.app-popover {
  display: inline-block;
}

.app-popover__trigger {
  cursor: pointer;
}

.app-popover__float {
  border: 1px solid @color-primary;
  background: @bg-paper;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.popover-enter-active,
.popover-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.popover-enter-from,
.popover-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
