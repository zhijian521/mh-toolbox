<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
defineOptions({ inheritAttrs: false });
const props = withDefaults(
    defineProps<{
        modelValue?: number | string | null;
        min?: number;
        max?: number;
    }>(),
    { modelValue: '', min: 0, max: Number.MAX_SAFE_INTEGER },
);
const emit = defineEmits<{ 'update:modelValue': [value: number | ''] }>();
const text = ref(props.modelValue == null ? '' : String(props.modelValue));
watch(
    () => props.modelValue,
    (value) => {
        const current = value == null ? '' : String(value);
        if (current === text.value) return;
        if (current !== '' && Number(current) === Number(text.value) && text.value !== '') return;
        text.value = current;
    },
);
function numeric() {
    if (text.value === '') return null;
    const value = Number(text.value);
    return Number.isFinite(value) ? value : null;
}
function onInput(event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    text.value = raw;
    if (raw === '') {
        emit('update:modelValue', '');
        return;
    }
    const value = Number(raw);
    emit('update:modelValue', Number.isFinite(value) ? value : '');
}
function step(offset: number) {
    const value = numeric();
    if (value === null && offset < 0) return;
    const next = Math.min(props.max, Math.max(props.min, (value ?? props.min) + offset));
    text.value = String(next);
    emit('update:modelValue', next);
}
const low = computed(() => {
    const value = numeric();
    return value === null || value <= props.min;
});
const high = computed(() => {
    const value = numeric();
    return value !== null && value >= props.max;
});
</script>
<template>
    <div class="number-field">
        <input
            v-bind="$attrs"
            type="number"
            :value="text"
            :min="min"
            :max="max"
            step="1"
            @input="onInput"
        />
        <span class="number-steps">
            <button
                type="button"
                class="number-step"
                tabindex="-1"
                aria-label="增加 1"
                :disabled="high"
                @click="step(1)"
            >
                <AppIcon name="chevron-up" :size="11" />
            </button>
            <button
                type="button"
                class="number-step"
                tabindex="-1"
                aria-label="减少 1"
                :disabled="low"
                @click="step(-1)"
            >
                <AppIcon name="chevron-down" :size="11" />
            </button>
        </span>
    </div>
</template>

<style scoped>
.number-field {
    position: relative;
    min-width: 0;
}
.number-field > input {
    padding-right: 24px;
}
.number-steps {
    position: absolute;
    top: 2px;
    right: 2px;
    bottom: 2px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 19px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 110ms ease;
}
.number-field:hover .number-steps,
.number-field:focus-within .number-steps {
    pointer-events: auto;
    opacity: 1;
}
.number-step {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: none;
    color: var(--muted);
    line-height: 1;
    transition:
        background 120ms ease,
        color 120ms ease;
}
.number-step:hover:not(:disabled) {
    background: var(--panel-3);
    color: var(--gold);
}
.number-step:disabled {
    opacity: 0.35;
    cursor: default;
}
.number-step:focus-visible {
    outline: 1px dashed var(--gold);
    outline-offset: -2px;
}
</style>
