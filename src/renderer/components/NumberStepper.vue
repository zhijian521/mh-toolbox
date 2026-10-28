<script setup lang="ts">
import { computed, ref, watch } from 'vue';

/**
 * 大号数字步进器：`−  [数值]  ＋`，单位作为输入框内的后缀。
 *
 * 与角色页「快捷编辑」是同一套尺寸与留白，凡是「一次只调一个数」的弹窗都用它，
 * 免得每个弹窗各写一份 28px 输入框。
 *
 * `decimal` 打开时输入框用 `step="any"`：原生 step 校验对小数很挑，一旦不匹配
 * `requestSubmit` 根本不派发 submit，表单看起来「点了没反应」。
 */
const props = withDefaults(
    defineProps<{
        modelValue?: number | string | null;
        name?: string;
        unit?: string;
        /** 两侧按钮每次加减多少；输入框本身不按它校验（小数走 `decimal`）。 */
        step?: number;
        min?: number;
        max?: number;
        placeholder?: string;
        decimal?: boolean;
        autofocus?: boolean;
    }>(),
    {
        modelValue: '',
        name: '',
        unit: '',
        step: 1,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        placeholder: '',
        decimal: false,
        autofocus: false,
    },
);
const emit = defineEmits<{ 'update:modelValue': [value: number | '']; invalid: [event: Event] }>();
const text = ref(props.modelValue == null ? '' : String(props.modelValue));
watch(
    () => props.modelValue,
    (value) => {
        const current = value == null ? '' : String(value);
        if (current === text.value) return;
        // 用户正在输入 8.50 这类中间态时不要被改写成 8.5，否则光标会跳。
        if (current !== '' && Number(current) === Number(text.value) && text.value !== '') return;
        text.value = current;
    },
);
const parsed = computed(() => {
    if (text.value === '') return null;
    const value = Number(text.value);
    return Number.isFinite(value) ? value : null;
});
const low = computed(() => parsed.value === null || parsed.value <= props.min);
const high = computed(() => parsed.value !== null && parsed.value >= props.max);
function nudge(offset: number) {
    const next = Math.min(props.max, Math.max(props.min, (parsed.value ?? props.min) + offset));
    // 0.1 这类步长会累积浮点误差（0.1 + 0.2 = 0.30000000000000004），按位数收一次。
    const value = Number(next.toFixed(6));
    text.value = String(value);
    emit('update:modelValue', value);
}
function onInput(event: Event) {
    const input = event.target as HTMLInputElement;
    text.value = input.value;
    // 非数字内容在 number 输入框里取不到 value，脏标记要靠 badInput 才成立。
    if (input.validity.badInput) emit('invalid', event);
    emit('update:modelValue', input.value === '' ? '' : Number(input.value));
}
</script>
<template>
    <div class="stepper">
        <button
            type="button"
            class="btn"
            :aria-label="'减少 ' + step"
            :disabled="low"
            @click="nudge(-step)"
        >
            −
        </button>
        <div class="stepper-input">
            <input
                :name="name || undefined"
                type="number"
                :value="text"
                :min="min"
                :max="max"
                :step="decimal ? 'any' : step"
                :placeholder="placeholder"
                :autofocus="autofocus"
                @input="onInput"
            />
            <span v-if="unit" class="stepper-unit" aria-hidden="true">{{ unit }}</span>
        </div>
        <button
            type="button"
            class="btn"
            :aria-label="'增加 ' + step"
            :disabled="high"
            @click="nudge(step)"
        >
            ＋
        </button>
    </div>
</template>

<style scoped>
.stepper {
    display: grid;
    grid-template-columns: 44px minmax(0, 160px) 44px;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin: 8px 0;
}
.stepper-input {
    position: relative;
    min-width: 0;
}
.stepper-input input {
    width: 100%;
    padding: 7px 30px 7px 12px;
    font-size: 28px;
    text-align: center;
}
.stepper-unit {
    position: absolute;
    top: 50%;
    right: 11px;
    color: var(--muted);
    font-size: 12px;
    transform: translateY(-50%);
    pointer-events: none;
}
.stepper .btn {
    height: 44px;
    width: 44px;
    max-width: 44px;
    flex: none;
    font-size: 22px;
}
</style>
