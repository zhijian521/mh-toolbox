<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from './AppIcon.vue';
import { usePopover } from './popover';
import { U } from '../domain/util.js';

const props = withDefaults(
    defineProps<{
        modelValue: string;
        label?: string;
        placeholder?: string;
        min?: string;
        max?: string;
        align?: 'left' | 'right';
        disabled?: boolean;
    }>(),
    {
        label: '',
        placeholder: '选择日期',
        min: '',
        max: '',
        align: 'left',
        disabled: false,
    },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const trigger = ref<HTMLButtonElement>(),
    popup = ref<HTMLElement>();
const { open, show, close } = usePopover({
    trigger,
    popup,
    align: () => props.align,
    width: () => 250,
});
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const cursor = ref(cursorOf(props.modelValue || U.today()));

function cursorOf(date: string) {
    const parsed = U.parseDate(date);
    return { year: parsed.getFullYear(), month: parsed.getMonth() };
}
const title = computed(() => cursor.value.year + ' 年 ' + (cursor.value.month + 1) + ' 月');
const cells = computed(() => {
    const { year, month } = cursor.value;
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const start = new Date(year, month, 1 - lead);
    return Array.from({ length: 42 }, (_unused, index) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
        const value = U.fmtDate(date);
        return {
            value,
            day: date.getDate(),
            outside: date.getMonth() !== month,
            today: value === U.today(),
            selected: value === props.modelValue,
            disabled: (!!props.min && value < props.min) || (!!props.max && value > props.max),
        };
    });
});
function shift(step: number) {
    const date = new Date(cursor.value.year, cursor.value.month + step, 1);
    cursor.value = { year: date.getFullYear(), month: date.getMonth() };
}
async function expand() {
    if (props.disabled) return;
    cursor.value = cursorOf(props.modelValue || U.today());
    await show('.xday.on:not(:disabled), .xday.today:not(:disabled), .xday:not(:disabled)');
}
function pick(value: string) {
    emit('update:modelValue', value);
    close(true);
}
function clear() {
    emit('update:modelValue', '');
    close(true);
}
function moveFocus(offset: number) {
    const elements = [
        ...(popup.value?.querySelectorAll<HTMLElement>('.xday:not(:disabled)') || []),
    ];
    if (!elements.length) return;
    const index = elements.indexOf(document.activeElement as HTMLElement);
    const target = elements[Math.min(elements.length - 1, Math.max(0, index + offset))];
    target?.focus();
}
function onKeydown(event: KeyboardEvent) {
    const steps: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
    };
    if (steps[event.key]) {
        event.preventDefault();
        moveFocus(steps[event.key]);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault();
        shift(event.key === 'PageUp' ? -1 : 1);
    }
}
</script>
<template>
    <div class="date-field">
        <button
            ref="trigger"
            type="button"
            class="date-trigger"
            :class="{ placeholder: !modelValue }"
            :aria-label="label || undefined"
            aria-haspopup="dialog"
            :aria-expanded="open"
            :disabled="disabled"
            @click="open ? close(true) : expand()"
        >
            <span class="date-value">{{ modelValue || placeholder }}</span>
            <AppIcon name="calendar" :size="13" />
        </button>
        <Teleport to="body">
            <div
                v-if="open"
                ref="popup"
                class="popover date-popover"
                role="dialog"
                :aria-label="label || '选择日期'"
            >
                <div class="xcal-head">
                    <button type="button" class="xcal-nav" aria-label="上个月" @click="shift(-1)">
                        <AppIcon name="chevron-left" :size="14" />
                    </button>
                    <span class="xcal-title">{{ title }}</span>
                    <button type="button" class="xcal-nav" aria-label="下个月" @click="shift(1)">
                        <AppIcon name="chevron-right" :size="14" />
                    </button>
                </div>
                <div class="xcal-week">
                    <span v-for="day in weekdays" :key="day">{{ day }}</span>
                </div>
                <div class="xcal-grid" @keydown="onKeydown">
                    <button
                        v-for="cell in cells"
                        :key="cell.value"
                        type="button"
                        class="xday"
                        :class="{
                            dim: cell.outside,
                            today: cell.today,
                            on: cell.selected,
                        }"
                        :disabled="cell.disabled"
                        :aria-current="cell.selected ? 'date' : undefined"
                        :aria-label="cell.value"
                        @click="pick(cell.value)"
                    >
                        {{ cell.day }}
                    </button>
                </div>
                <div class="xcal-quick">
                    <button
                        type="button"
                        class="btn compact"
                        :disabled="(!!max && U.today() > max) || (!!min && U.today() < min)"
                        @click="pick(U.today())"
                    >
                        今天
                    </button>
                    <button
                        type="button"
                        class="btn compact"
                        :disabled="!modelValue"
                        @click="clear"
                    >
                        清空
                    </button>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.date-field {
    display: block;
    min-width: 0;
}
.date-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 7px 9px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    background: var(--paper);
    color: var(--ink);
    font-size: 13.5px;
    font-family: inherit;
    text-align: left;
    transition: border-color 120ms ease;
}
.date-trigger:hover:not(:disabled) {
    border-color: var(--gold);
}
.date-trigger[aria-expanded='true'] {
    border-color: var(--gold);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gold) 20%, transparent);
}
.date-trigger:focus-visible {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--gold) 25%, transparent);
}
.date-trigger:disabled {
    opacity: 0.65;
}
.date-trigger svg {
    flex: none;
    color: var(--muted);
}
.date-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.date-trigger.placeholder .date-value {
    color: color-mix(in srgb, var(--muted) 78%, var(--paper));
}
.date-popover {
    width: 246px;
    padding: 10px;
}
.xcal-head {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 8px;
}
.xcal-title {
    flex: 1;
    text-align: center;
    color: var(--ink);
    font-size: 13.5px;
    letter-spacing: 1px;
}
.xcal-nav {
    display: flex;
    padding: 3px 6px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--muted);
    font-family: inherit;
}
.xcal-nav:hover {
    background: var(--paper-2);
    color: var(--ink);
}
.xcal-week,
.xcal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
}
.xcal-week span {
    padding: 3px 0;
    text-align: center;
    font-size: 11.5px;
    color: var(--muted);
}
.xday {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--ink);
    font-family: inherit;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
}
.xday:hover:not(:disabled) {
    background: var(--paper-2);
}
.xday.dim {
    color: color-mix(in srgb, var(--muted) 78%, var(--paper));
    opacity: 0.55;
}
.xday:disabled {
    opacity: 0.35;
    cursor: default;
}
.xday.today::after {
    content: '';
    position: absolute;
    bottom: 3px;
    left: 50%;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--gold);
    transform: translateX(-50%);
}
.xday.on {
    background: var(--red);
    color: var(--on-accent);
    font-weight: 700;
}
.xday.on:hover:not(:disabled) {
    background: color-mix(in srgb, var(--red) 85%, var(--ink));
}
.xday.on.today::after {
    background: var(--on-accent);
}
.xcal-quick {
    display: flex;
    gap: 6px;
    margin-top: 8px;
}
</style>
