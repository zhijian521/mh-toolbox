<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import AppIcon from './AppIcon.vue';
import { usePopover } from './popover';

export interface SelectOption {
    value: string;
    label: string;
}
const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: SelectOption[];
        label?: string;
        placeholder?: string;
        searchable?: boolean;
        align?: 'left' | 'right';
        disabled?: boolean;
    }>(),
    {
        label: '',
        placeholder: '请选择',
        searchable: false,
        align: 'left',
        disabled: false,
    },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const trigger = ref<HTMLButtonElement>(),
    popup = ref<HTMLElement>(),
    search = ref<HTMLInputElement>(),
    term = ref(''),
    active = ref(0);
const { open, show, close } = usePopover({
    trigger,
    popup,
    align: () => props.align,
    width: () => Math.max(200, Math.min(320, trigger.value?.offsetWidth ?? 200)),
});
const current = computed(() => props.options.find((option) => option.value === props.modelValue));
const visible = computed(() => {
    const keyword = term.value.trim().toLowerCase();
    if (!keyword) return props.options;
    return props.options.filter((option) => option.label.toLowerCase().includes(keyword));
});
watch(visible, () => {
    active.value = Math.max(
        0,
        visible.value.findIndex((option) => option.value === props.modelValue),
    );
});
const itemElements = () => [...(popup.value?.querySelectorAll<HTMLElement>('.xitem') || [])];
function focusItem(index: number) {
    const items = itemElements();
    if (!items.length) return;
    active.value = (index + items.length) % items.length;
    items[active.value].focus();
    items[active.value].scrollIntoView({ block: 'nearest' });
}
async function expand() {
    if (props.disabled) return;
    term.value = '';
    active.value = Math.max(
        0,
        props.options.findIndex((option) => option.value === props.modelValue),
    );
    await show(props.searchable ? '.xmenu-search' : '.xitem.active');
}
function choose(option: SelectOption) {
    emit('update:modelValue', option.value);
    close(true);
}
function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        void expand();
    }
}
function onListKeydown(event: KeyboardEvent) {
    if (
        event.target === search.value &&
        !['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(event.key)
    )
        return;
    if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusItem(active.value + 1);
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusItem(active.value - 1);
    } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        focusItem(event.key === 'Home' ? 0 : visible.value.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const option = visible.value[active.value];
        if (option) choose(option);
    }
}
async function onSearch() {
    active.value = 0;
    await nextTick();
    if (visible.value.length) focusItem(0);
}
</script>
<template>
    <div class="select-field">
        <button
            ref="trigger"
            type="button"
            class="select-trigger"
            role="combobox"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :aria-label="label || undefined"
            :disabled="disabled"
            @click="open ? close(true) : expand()"
            @keydown="onTriggerKeydown"
        >
            <span class="select-value" :class="{ placeholder: !current }">
                {{ current ? current.label : placeholder }}
            </span>
            <AppIcon name="chevron-down" :size="13" />
        </button>
        <Teleport to="body">
            <div v-if="open" ref="popup" class="popover select-popover" @keydown="onListKeydown">
                <input
                    v-if="searchable"
                    ref="search"
                    v-model="term"
                    class="xmenu-search"
                    type="search"
                    aria-label="搜索选项"
                    placeholder="输入名称搜索"
                    @input="onSearch"
                />
                <ul class="select-list" role="listbox" :aria-label="label || placeholder">
                    <li
                        v-for="(option, index) in visible"
                        :key="option.value"
                        class="xitem"
                        :class="{ active: option.value === modelValue }"
                        role="option"
                        :aria-selected="option.value === modelValue"
                        tabindex="-1"
                        @click="choose(option)"
                        @mousemove="active = index"
                    >
                        <span class="xitem-label">{{ option.label }}</span>
                        <AppIcon v-if="option.value === modelValue" name="check" :size="13" />
                    </li>
                    <li v-if="!visible.length" class="xitem empty-item" tabindex="-1">
                        没有匹配的选项
                    </li>
                </ul>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.select-field {
    display: block;
    min-width: 0;
}
.select-trigger {
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
.select-trigger:hover:not(:disabled) {
    border-color: var(--gold);
}
.select-trigger[aria-expanded='true'] {
    border-color: var(--gold);
    box-shadow: inset 0 0 0 1px #a67c2e33;
}
.select-trigger:focus-visible {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 0 1px #a67c2e40;
}
.select-trigger:disabled {
    opacity: 0.65;
}
.select-trigger svg {
    flex: none;
    color: var(--muted);
}
.select-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.select-value.placeholder {
    color: #9a917e;
}
/* 弹层通过 Teleport 挂到 body，作用域属性仍随组件节点保留。 */
.select-popover {
    padding: 4px;
}
.xmenu-search {
    width: 100%;
    margin-bottom: 4px;
    padding: 6px 8px;
    font-size: 13px;
}
.select-list {
    max-height: 244px;
    overflow-y: auto;
    padding: 0;
    margin: 0;
    list-style: none;
}
.select-list::-webkit-scrollbar {
    width: 8px;
}
.select-list::-webkit-scrollbar-thumb {
    background: var(--line-2);
    border-radius: 4px;
}
.xitem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 13.5px;
    color: var(--ink);
    outline: none;
}
.xitem:hover,
.xitem:focus-visible {
    background: var(--paper-2);
}
.xitem.active {
    color: var(--gold);
}
.xitem svg {
    flex: none;
    color: var(--gold);
}
.xitem-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.xitem.empty-item {
    color: var(--muted);
    cursor: default;
}
.xitem.empty-item:hover {
    background: none;
}
</style>
