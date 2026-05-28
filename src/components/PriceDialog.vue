<template>
  <AppDialog v-model="visible" title="设置物品价格" width="360px" @close="handleClose">
    <div class="price-content" v-if="item">
      <div class="item-preview-img">
        <img v-if="item.image" :src="item.image" :alt="item.name" />
        <AppIcon v-else name="box" :size="28" />
      </div>
      <div class="price-inputs">
        <input
          v-if="isCustom"
          v-model="customName"
          type="text"
          class="name-input"
          placeholder="物品名称"
          maxlength="10"
        />
        <div class="price-row">
          <input
            ref="inputEl"
            v-model.number="price"
            type="number"
            min="0"
            step="0.1"
            class="price-input"
            placeholder="输入价格"
            @keyup.enter="handleConfirm"
          />
          <span class="price-suffix">W</span>
        </div>
      </div>
    </div>
    <template #footer>
      <button class="btn-cancel" @click="handleClose">取消</button>
      <button class="btn-confirm" @click="handleConfirm">确定</button>
    </template>
  </AppDialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import AppDialog from './AppDialog.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  item: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isCustom = computed(() => props.item?.id === 200)

const price = ref(0)
const customName = ref('其他')
const inputEl = ref(null)

watch(() => props.item, (item) => {
  if (item) {
    // 存储值 → 万（显示用）
    price.value = item.price ? item.price / 10000 : 0
    customName.value = item.name || '其他'
  }
}, { immediate: true })

watch(visible, async (v) => {
  if (v) await nextTick(); inputEl.value?.focus()
})

const handleConfirm = () => {
  // 万 → 存储值
  emit('confirm', { price: Math.round(price.value * 10000), name: isCustom.value ? customName.value : props.item?.name })
  visible.value = false
}

const handleClose = () => {
  visible.value = false
  emit('cancel')
}
</script>

<style lang="less" scoped>
@import '../styles/variables.less';

.price-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: @spacing-md;
}

.item-preview-img {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid @color-border;
  background: @bg-paper;
  padding: @spacing-xs;
  color: @text-muted;
  flex-shrink: 0;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.price-inputs {
  display: flex;
  flex-direction: column;
  gap: @spacing-sm;
}

.name-input {
  width: 160px;
  padding: 4px 10px;
  border: 1px solid @color-input;
  background: @bg-paper;
  font-size: 0.8125rem;
  color: @text-primary;
  outline: none;
  transition: border-color @transition-fast ease;

  &:focus { border-color: @color-primary; }
}

.price-row {
  display: flex;
  align-items: center;
  gap: @spacing-sm;
}

.price-suffix {
  font-size: 0.8125rem;
  font-weight: 500;
  color: @text-muted;
  flex-shrink: 0;
}

.price-input {
  width: 140px;
  padding: 6px 10px;
  border: 1px solid @color-input;
  background: @bg-paper;
  font-size: 0.9375rem;
  font-weight: 400;
  color: @text-primary;
  outline: none;
  transition: border-color @transition-fast ease;

  &:focus { border-color: @color-primary; }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  -moz-appearance: textfield;
}

.btn-cancel, .btn-confirm {
  padding: 6px 20px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all @transition-fast ease;
  font-family: inherit;
}

.btn-cancel {
  border: 1px solid @color-border;
  background: @bg-paper;
  color: @text-primary;
  &:hover { border-color: @color-primary; color: @color-primary; }
}

.btn-confirm {
  border: 1px solid @color-primary;
  background: @color-primary;
  color: @color-primary-foreground;
  &:hover { background: @color-primary-hover; }
}
</style>
