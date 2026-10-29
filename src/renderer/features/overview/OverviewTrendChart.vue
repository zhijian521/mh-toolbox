<script setup lang="ts">
import type { TrendPoint } from './overview-shared';

/**
 * 零轴居中的柱状图：正数向上（金），负数向下（红）。
 *
 * 两种高度算法：大图按百分比（`share`，50% 是满格），账号页那两张小图按像素
 * （`pixel`，比例很小时至少 2px，否则那一根等于没画）。两处共用一套 DOM 与配色，
 * 免得「同一个图在两个地方长得不一样」。
 */
const props = defineProps<{
    points: TrendPoint[];
    /** 读屏用的整图描述。 */
    label: string;
    /** `share`：柱高 = 比例 × 50%；`pixel`：柱高 = max(2, 比例 × 30) px。 */
    size?: 'share' | 'pixel';
    slim?: boolean;
    /** 金额格式：人民币用 `fmtAmount`，梦幻币用 `fmtMoney`。 */
    format: (value: number) => string;
    /** 给了就把「起 / 止 + 图例」画在图底下（大图有，小图没有）。 */
    span?: { from: string; to: string };
}>();

function barHeight(point: TrendPoint) {
    if (props.size === 'pixel') {
        return Math.max(2, Math.round(Math.abs(point.ratio) * 30)) + 'px';
    }
    return Math.abs(point.ratio) * 50 + '%';
}
function tip(point: TrendPoint) {
    return (
        point.date + ' · ' + (point.value >= 0 ? '+' : '−') + props.format(Math.abs(point.value))
    );
}
</script>

<template>
    <div class="chart" :class="{ slim }" role="img" :aria-label="label">
        <div v-for="point in points" :key="point.date" class="chart-col" :title="tip(point)">
            <div class="chart-track">
                <i
                    v-if="point.value"
                    class="chart-bar"
                    :class="point.value > 0 ? 'up' : 'down'"
                    :style="{ height: barHeight(point) }"
                ></i>
            </div>
        </div>
    </div>
    <footer v-if="span" class="chart-foot">
        <span>{{ span.from.slice(5) }}</span>
        <span class="chart-legend">
            <i class="dot up" aria-hidden="true"></i>
            盈利
            <i class="dot down" aria-hidden="true"></i>
            亏损
        </span>
        <span>{{ span.to.slice(5) }}</span>
    </footer>
</template>

<style scoped>
/* ---------- 趋势图：零轴居中，正上负下 ---------- */
.chart {
    display: flex;
    align-items: stretch;
    gap: 3px;
    height: 96px;
    padding: 0 2px;
}
.chart.slim {
    height: 72px;
    margin-top: 2px;
}
.chart-col {
    flex: 1;
    min-width: 0;
}
.chart-track {
    position: relative;
    height: 100%;
}
.chart-track::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    border-top: 1px solid var(--line);
}
.chart-bar {
    position: absolute;
    left: 8%;
    right: 8%;
    /* 比例很小时至少留一截，否则那一根等于没画。 */
    min-height: 2px;
    border-radius: 2px;
    transition: height 140ms ease;
}
/*
 * 柱子的渐变用「令牌色 + 令牌色混纸色」而不是两个写死的十六进制：
 * 亮色下顶端仍是原来那档提亮，暗色下则自动落成偏暗的金 / 红，不会在深底上刺眼。
 */
.chart-bar.up {
    bottom: 50%;
    background: linear-gradient(
        to top,
        var(--gold),
        color-mix(in srgb, var(--gold) 72%, var(--paper))
    );
}
.chart-bar.down {
    top: 50%;
    background: linear-gradient(
        to bottom,
        var(--red),
        color-mix(in srgb, var(--red) 72%, var(--paper))
    );
}
.chart-col:hover .chart-bar {
    filter: brightness(1.08);
}
.chart-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}
.chart-legend {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.chart-legend .dot {
    width: 6px;
    height: 6px;
    border-radius: 1px;
}
.chart-legend .dot.up {
    background: var(--gold);
}
.chart-legend .dot.down {
    margin-left: 6px;
    background: var(--red);
}
</style>
