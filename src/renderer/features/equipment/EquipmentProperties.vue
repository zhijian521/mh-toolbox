<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem } from '../../app/types';
import { useApplication } from '../../stores/application';
import { propertyRows } from './properties';

const props = withDefaults(
    defineProps<{
        eq: EquipmentItem;
        /** 详情里用「标签列 + 值列」的两列网格，标签右对齐，值从同一条线开始。 */
        aligned?: boolean;
    }>(),
    { aligned: false },
);
const app = useApplication();
const rules = app.rules();
const rows = computed(() => propertyRows(rules, props.eq));
</script>

<template>
    <div class="eq-props" :class="{ aligned }">
        <p v-for="(row, index) in rows" :key="index" class="eq-prop" :class="'kind-' + row.kind">
            <span class="eq-prop-label">{{ row.label }}</span>
            <span class="eq-prop-value">{{ row.value }}</span>
        </p>
        <p v-if="!rows.length" class="eq-prop kind-legacy">未录入属性</p>
    </div>
</template>

<style scoped>
.eq-props {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}
/*
 * 对齐版只用在详情：标签长短不一（「伤害」到「钟灵石」），逐行 flex 会让值参差，
 * 像一张没排过的表。用 `subgrid` 而不是 `display: contents`：空标签的行（主要属性合并成一行那种）里，
 * span 若脱离网格会被当成独立的块，值就贴到最左边，与有标签的行错开一整列。
 */
.eq-props.aligned {
    display: grid;
    grid-template-columns: 4.4em minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 3px;
}
.eq-props.aligned .eq-prop {
    display: grid;
    grid-template-columns: subgrid;
    grid-column: 1 / -1;
}
.eq-props.aligned .eq-prop-label {
    text-align: right;
}
.eq-prop {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin: 0;
    font-size: 12px;
    line-height: 1.62;
    color: var(--ink);
}
.eq-prop-label {
    flex: none;
    color: var(--muted);
    font-size: 11.5px;
}
.eq-prop-value {
    min-width: 0;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
}
.kind-gem .eq-prop-value,
.kind-gem {
    color: var(--blue);
}
.kind-special .eq-prop-value,
.kind-special {
    color: var(--gold);
}
.kind-upgrade .eq-prop-value,
.kind-upgrade {
    color: var(--green);
}
.kind-legacy,
.kind-legacy .eq-prop-value {
    color: var(--muted);
}
</style>
