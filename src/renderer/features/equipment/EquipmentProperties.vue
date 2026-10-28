<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem } from '../../app/types';
import { useApplication } from '../../stores/application';
import { propertyRows } from './properties';

const props = withDefaults(
    defineProps<{
        eq: EquipmentItem;
        /** 详情里才显示五行、耐久、制造者与备注。 */
        full?: boolean;
        /** 只显示前 N 行（格子用），0 表示全部。 */
        lines?: number;
        /** 详情里用「标签列 + 值列」的两列网格，标签右对齐，值从同一条线开始。 */
        aligned?: boolean;
    }>(),
    { full: false, lines: 0, aligned: false },
);
const app = useApplication();
const rules = app.rules();
const rows = computed(() => propertyRows(rules, props.eq, props.full));
/**
 * 格子与列表里只摆前几行，超出的收成一行「还有 N 条」。
 *
 * 提示行**占用**最后一个名额而不是另起一行：灵饰是「一条主要 + 三条附加 + 精炼」，
 * 属性多的装备本来就长，再加一行提示会把格子高度顶开、整排跟着错位。少显示一行
 * 属性、换一句「还有 3 条」，比让用户以为属性就这么多要诚实。
 */
const shown = computed(() =>
    props.lines > 0 && rows.value.length > props.lines
        ? rows.value.slice(0, props.lines - 1)
        : rows.value,
);
const rest = computed(() => rows.value.length - shown.value.length);
</script>

<template>
    <div
        class="eq-props"
        :class="{ clamp: lines > 0, aligned }"
        :style="lines > 0 ? { '--eq-lines': lines } : undefined"
    >
        <p v-for="(row, index) in shown" :key="index" class="eq-prop" :class="'kind-' + row.kind">
            <span class="eq-prop-label">{{ row.label }}</span>
            <span class="eq-prop-value">{{ row.value }}</span>
        </p>
        <p v-if="rest > 0" class="eq-prop kind-legacy eq-more">还有 {{ rest }} 条属性</p>
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
/* 格子里的属性只留前几行：录得多的装备不能把格子撑变形。 */
.eq-props.clamp {
    max-height: calc(var(--eq-lines) * 1.62em);
    overflow: hidden;
}
/*
 * 对齐版只用在详情：标签长短不一（「伤害」到「修理失败」），逐行 flex 会让值参差，
 * 像一张没排过的表。用 `subgrid` 而不是 `display: contents`：空标签的行（主要属性合并成一行那种）里，
span 若脱离网格会被当成独立的块，值就贴到最左边，与有标签的行错开一整列。
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
/* 溢出提示像列表末尾的「更多」，不该被当成一条属性读。 */
.eq-more {
    font-size: 11px;
    letter-spacing: 0.02em;
}
</style>
