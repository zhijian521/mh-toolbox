<template>
  <div class="setting-popover">
    <div class="setting-header">
      <AppIcon :name="icon" :size="18" class="setting-header-icon" />
      <span class="setting-title">{{ title }}</span>
    </div>
    <div class="setting-body">
      <div class="stepper">
        <button class="stepper-btn" @click="stepDown" :disabled="disabledDown">−</button>
        <input
          v-model.number="localValue"
          type="number"
          class="stepper-input"
          @change="emitValue"
        />
        <button class="stepper-btn" @click="stepUp" :disabled="disabledUp">+</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  title: { type: String, required: true },
  icon: { type: String, required: true },
  modelValue: { type: Number, required: true },
  inputProps: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['update:modelValue'])

const localValue = ref(props.modelValue)
const { min = 1, max = Infinity, step = 1 } = props.inputProps

watch(() => props.modelValue, (v) => { localValue.value = v })

const disabledDown = computed(() => localValue.value <= min)
const disabledUp = computed(() => localValue.value >= max)

const emitValue = () => {
  let v = localValue.value
  if (v < min) v = min
  if (v > max) v = max
  localValue.value = v
  emit('update:modelValue', v)
}

const stepDown = () => { localValue.value -= step; emitValue() }
const stepUp = () => { localValue.value += step; emitValue() }
</script>

<style lang="less" scoped>
@import '../styles/variables.less';

.setting-popover {
  display: flex;
  flex-direction: column;
}

.setting-header {
  display: flex;
  align-items: center;
  gap: @spacing-md;
  padding: @spacing-md @spacing-lg;
  border-bottom: 1px solid @color-border;
}

.setting-header-icon { color: @color-primary; flex-shrink: 0; }

.setting-title {
  font-size: 0.875rem;
  font-weight: 400;
  color: @text-primary;
}

.setting-body {
  padding: @spacing-xl;
  display: flex;
  justify-content: center;
}

.stepper {
  display: flex;
  align-items: center;
  border: 1px solid @color-input;
  background: @bg-paper;
}

.stepper-btn {
  width: 32px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: @text-muted;
  font-size: 1.125rem;
  cursor: pointer;
  transition: all @transition-fast ease;

  &:hover:not(:disabled) { color: @color-primary; }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
}

.stepper-input {
  width: 80px;
  height: 34px;
  border: none;
  border-left: 1px solid @color-input;
  border-right: 1px solid @color-input;
  background: @bg-paper;
  text-align: center;
  font-size: 0.9375rem;
  font-weight: 400;
  color: @text-primary;
  outline: none;

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  -moz-appearance: textfield;
}
</style>
