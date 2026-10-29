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
            <span class="eq-prop-label" :class="{ tag: row.tag }">{{ row.label }}</span>
            <span class="eq-prop-value">
                <template v-if="row.segments">
                    <template v-for="(segment, segmentIndex) in row.segments" :key="segmentIndex">
                        <span class="eq-prop-segment">
                            <span v-if="segmentIndex" class="eq-prop-dot">·</span>
                            <span class="eq-prop-name">{{ segment.name }}</span>
                            {{ ' ' }}
                            <span class="eq-prop-num">{{ segment.num }}</span>
                        </span>
                        <template v-if="segmentIndex < row.segments.length - 1">
                            {{ ' ' }}
                        </template>
                    </template>
                </template>
                <template v-else>{{ row.value }}</template>
            </span>
        </p>
        <p v-if="!rows.length" class="eq-prop kind-legacy">
            <span class="eq-prop-value">未录入属性</span>
        </p>
    </div>
</template>

<style scoped>
/*
 * 两列网格而不是逐行 flex：标签长短差得多（「基础」两个字到「原有属性」四个字），
 * 逐行排会让值一行一个位置，像没对过的表。`max-content` 让每张卡按自己最宽的标签
 * 定列宽——有「原有属性」那张列宽一点，没有的仍旧紧凑。
 * 行本身用 `display: contents` 摊进网格：`.eq-prop` 只是承载 kind 类的壳，
 * 样式照样能命中里面的两个 span。
 */
.eq-props {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: baseline;
    column-gap: 5px;
    row-gap: 2px;
    min-width: 0;
}
/* 对齐版只用在详情：标签列定宽右对齐，值从同一条线开始。 */
.eq-props.aligned {
    grid-template-columns: 4.6em minmax(0, 1fr);
    column-gap: 10px;
    row-gap: 4px;
}
.eq-props.aligned .eq-prop-label {
    justify-self: end;
    text-align: right;
}
.eq-prop {
    display: contents;
    font-size: 12px;
    line-height: 1.62;
    color: var(--ink);
}
/*
 * 标签分两档：
 * - 类别签（`tag`）——基础 / 双加 / 宝石 / 锻炼 / 灵尘：带一层凹面底，颜色跟着分组走，
 *   像盖在属性前面的小印，扫一眼就知道这一行说的是哪一类。
 * - 字段签——特技、符石、原有属性这些，保持灰字，不抢类别签的注意力。
 */
.eq-prop-label {
    /* 网格列按最宽标签定宽，标签本身仍旧贴左收缩——否则类别签会被拉成一条横贯的色块。 */
    justify-self: start;
    padding: 0 3px;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.3px;
}
/*
 * 类别签用凹面底（`--well`）而不是 `currentColor` 的淡染：
 * 淡染在暗色下会把底色提亮到和字同一个亮度，字直接糊在底上。
 */
.eq-prop-label.tag {
    padding: 0 4px;
    border-radius: 3px;
    background: var(--well);
    font-size: 10px;
    letter-spacing: 0.4px;
}
.eq-prop-value {
    min-width: 0;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
}
/*
 * 一段词条：属性名与数值各自不断行，断点只留在两者之间。
 * 窄到 145px 的玉魄格里，「物理暴击等级 +18」放不下，断在名称与数值之间还能读；
 * 整段不许断就会被卡片裁掉半个字。
 * 间隔号放在段首而不是段尾：断行时它跟着下一段走到行首，不会孤零零挂在行末。
 */
.eq-prop-name,
.eq-prop-num {
    white-space: nowrap;
}
.eq-prop-dot {
    margin-right: 5px;
    color: var(--muted);
}
/* 类别签的颜色跟着分组走；普通字段签保持灰字，不去抢类别签的注意力。 */
.kind-base .eq-prop-label.tag {
    color: var(--ink-2);
}
.kind-extra .eq-prop-label.tag {
    color: var(--gold);
}
.kind-gem .eq-prop-label.tag {
    color: var(--blue);
}
.kind-upgrade .eq-prop-label.tag {
    color: var(--green);
}
.kind-gem .eq-prop-value {
    color: var(--blue);
}
.kind-upgrade .eq-prop-value {
    color: var(--green);
}
.kind-special .eq-prop-label,
.kind-special .eq-prop-value {
    color: var(--gold);
}
.kind-legacy,
.kind-legacy .eq-prop-value {
    color: var(--muted);
}
</style>
