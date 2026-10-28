<script setup lang="ts">
import { computed } from 'vue';
import type { DateRangeValue } from '../app/types';
import { U } from '../domain/util.js';
import BaseDate from './BaseDate.vue';

/**
 * 时间范围筛选：一排快捷按钮 + 常驻的开始 / 结束日期。
 *
 * 快捷按钮只负责把区间算好填进两个日期框，用户仍可以直接改日期（此时切成
 * `custom`）。与「下拉选预设、再按需展开日期」相比，这套始终显示当前区间的
 * 真实起止日，用户不用猜「本月」到底算到哪一天。
 */
const props = withDefaults(
    defineProps<{ modelValue: DateRangeValue; label?: string; disabled?: boolean }>(),
    { label: '时间范围', disabled: false },
);
const emit = defineEmits<{ 'update:modelValue': [value: DateRangeValue] }>();
const presets = [
    { value: 'today', label: '本日' },
    { value: 'week', label: '本周' },
    { value: 'month', label: '本月' },
    { value: 'year', label: '本年' },
    { value: 'all', label: '全部' },
];
const current = computed(() => props.modelValue);
/**
 * 开始日期的上限：不晚于结束日期，也不晚于今天。
 *
 * 「本月」「本周」算出来的结束日是月末 / 周日，本身就是未来日期；直接拿它当
 * `max` 会在日历里放开未来几天，用户能选到一个还没发生的开始日期。
 */
const fromMax = computed(() => {
    const today = U.today();
    const end = current.value.to;
    return end && end < today ? end : today;
});
function choose(preset: string) {
    const range = U.rangeFor(preset);
    emit('update:modelValue', { preset, from: range.from || '', to: range.to || '' });
}
/**
 * 手改日期即离开预设。
 *
 * 不合法时直接忽略、不写回：日期框是受控的，父级的值没变，浏览器会把输入退回
 * 原值，不会出现「开始晚于结束」这种中间态。
 */
function change(key: 'from' | 'to', value: string) {
    const next = { ...props.modelValue, preset: 'custom', [key]: value };
    if (next.from && next.to && next.from > next.to) return;
    emit('update:modelValue', next);
}
</script>
<template>
    <div class="range-filter" role="group" :aria-label="label">
        <div class="seg" role="group" aria-label="快捷时间">
            <button
                v-for="item in presets"
                :key="item.value"
                type="button"
                class="seg-btn"
                :class="{ on: modelValue.preset === item.value }"
                :aria-pressed="modelValue.preset === item.value"
                :disabled="disabled"
                @click="choose(item.value)"
            >
                {{ item.label }}
            </button>
        </div>
        <span class="range-dates">
            <span class="range-date">
                <BaseDate
                    :model-value="current.from"
                    label="开始日期"
                    :max="fromMax"
                    :disabled="disabled"
                    @update:model-value="change('from', $event)"
                />
            </span>
            <span class="range-sep">至</span>
            <span class="range-date">
                <BaseDate
                    :model-value="current.to"
                    label="结束日期"
                    :min="current.from"
                    :max="U.today()"
                    :disabled="disabled"
                    @update:model-value="change('to', $event)"
                />
            </span>
        </span>
    </div>
</template>

<style scoped>
.range-filter {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
.seg {
    display: inline-flex;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    overflow: hidden;
    background: var(--paper);
}
.seg-btn {
    padding: 7px 10px;
    border: none;
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: 12.5px;
    cursor: pointer;
    transition: background 120ms ease;
}
.seg-btn + .seg-btn {
    border-left: 1px solid var(--line);
}
.seg-btn:hover:not(:disabled):not(.on) {
    background: var(--paper-2);
}
.seg-btn.on {
    background: #f2e6d5;
    color: var(--red);
    font-weight: 600;
}
.seg-btn:disabled {
    opacity: 0.6;
    cursor: default;
}
.range-dates {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}
.range-date {
    width: 140px;
}
.range-sep {
    color: var(--muted);
    font-size: 12px;
}
@media (max-width: 750px) {
    .range-dates {
        width: 100%;
    }
    .range-date {
        flex: 1;
        width: auto;
    }
}
</style>
