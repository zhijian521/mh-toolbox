<script setup lang="ts">
import { computed } from 'vue';
import type { PriceChange, PriceItem, PriceLog } from '../../app/types';
import { useApplication } from '../../stores/application';

/**
 * 一张物价卡片。
 *
 * 版面按「价签」组织而不是表格行：分类与涨跌徽章在最上，名称与价格是唯一焦点，
 * 底部一行极淡的元信息，走势线铺在卡片下沿当背景——一眼扫过去看到的是价格和方向，
 * 而不是七个字号差不多的行。
 *
 * 卡片只负责展示与派发操作：当前价、涨跌与显示口径全部来自领域层
 * （`priceCurrent` / `priceChange` / `priceLabel`），卡片里不重算一遍，
 * 否则卡片与历史弹窗迟早给出两个价。物品的编辑与删除在历史弹窗里。
 */
const props = defineProps<{
    item: PriceItem;
    /** 最新一条价格记录，没有时为 null。 */
    current: PriceLog | null;
    /** 与上一条不同日期的记录比出的涨跌，不足两条时为 null。 */
    change: PriceChange | null;
    /** 近几次价格，时间正序，用于折线。 */
    trend: number[];
    busy: boolean;
}>();
const emit = defineEmits<{
    log: [];
    history: [];
}>();
const rules = useApplication().rules();

const label = computed(() => rules.priceLabel(props.current ? props.current.price : null));
const updateText = computed(() => (props.current ? props.current.date.slice(5) : '未记录'));
const logCount = computed(() => props.item.logs.length);

/** 涨跌徽章只放百分比，具体金额与基准日期挂在 title 上，省一行的宽度。 */
const badge = computed(() => {
    const change = props.change;
    if (!change) return null;
    const amount = rules.priceLabel(Math.abs(change.delta));
    const money = amount.value + ' ' + amount.unit;
    if (change.delta === 0) {
        return { dir: 'flat', text: '持平', title: '与 ' + change.since + ' 同价' };
    }
    const up = change.delta > 0;
    const pct = change.pct === null ? null : Math.abs(change.pct * 100);
    return {
        dir: up ? 'up' : 'down',
        arrow: up ? '▲' : '▼',
        text: pct === null ? money : pct.toFixed(pct < 1 ? 1 : 0) + '%',
        title: '较 ' + change.since + (up ? ' 涨 ' : ' 跌 ') + money,
    };
});

/** 分类竖条的颜色：常见分类固定，自定义分类按名称散列到同一组颜色里，保证每次打开一致。 */
const tone = computed(() => {
    const fixed: Record<string, string> = {
        兽决: 'var(--gold)',
        内丹: 'var(--blue)',
        宝石: 'var(--red)',
        五宝: '#8a5a2b',
        环装: '#6b7b52',
        材料: '#7a6a53',
        符石: '#3d5a6c',
        药品: 'var(--green)',
        召唤兽: '#8a6a8a',
        其他: 'var(--muted)',
    };
    const name = props.item.category || '其他';
    if (fixed[name]) return fixed[name];
    const pool = ['var(--gold)', 'var(--blue)', 'var(--red)', 'var(--green)', '#8a5a2b', '#8a6a8a'];
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 997;
    return pool[hash % pool.length];
});

/**
 * 走势线跟着价格走：viewBox 固定，线宽由 `non-scaling-stroke` 兜住，
 * 放在价格右侧而不是铺成底纹——底纹会穿过底部那行元信息与操作按钮。
 */
const sparkPoints = computed(() => {
    const values = props.trend;
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 60;
    const height = 18;
    const pad = 1.5;
    return values
        .map((value, index) => {
            const x = pad + (index * (width - pad * 2)) / (values.length - 1);
            const y = height - pad - ((value - min) / span) * (height - pad * 2);
            return x.toFixed(1) + ',' + y.toFixed(1);
        })
        .join(' ');
});
</script>

<template>
    <article
        class="price-card"
        :data-price-id="item.id"
        :aria-label="item.name + ' 的物价'"
        :style="{ '--tone': tone }"
    >
        <header class="card-top">
            <span class="card-category">{{ item.category }}</span>
            <span v-if="badge" class="card-badge" :class="badge.dir" :title="badge.title">
                {{ badge.arrow }} {{ badge.text }}
            </span>
        </header>

        <h2 class="card-name" :title="item.name">{{ item.name }}</h2>

        <div class="card-price">
            <b>{{ label.value }}</b>
            <small v-if="label.unit">{{ label.unit }}</small>
            <svg
                v-if="sparkPoints"
                class="price-spark"
                viewBox="0 0 60 18"
                :class="badge ? badge.dir : 'flat'"
                aria-hidden="true"
            >
                <polyline :points="sparkPoints" vector-effect="non-scaling-stroke" />
            </svg>
        </div>

        <p class="card-foot">
            <span>{{ updateText }}</span>
            <template v-if="logCount">
                <i>·</i>
                <span>{{ logCount }} 条</span>
            </template>
            <template v-if="item.note">
                <i>·</i>
                <span class="foot-note" :title="item.note">{{ item.note }}</span>
            </template>
        </p>

        <div class="card-actions">
            <button class="text-button act" :disabled="busy" aria-label="记价" @click="emit('log')">
                ＋ 记价
            </button>
            <button
                class="text-button act quiet"
                :disabled="busy"
                aria-label="历史"
                @click="emit('history')"
            >
                历史
            </button>
        </div>
    </article>
</template>

<style scoped>
.price-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 9px 12px 8px 14px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
    min-width: 0;
    overflow: hidden;
    transition:
        border-color 120ms ease,
        background-color 120ms ease;
}
/* 分类竖条：比整块色底克制，也不至于让一屏卡片变成调色盘。 */
.price-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--tone);
    opacity: 0.8;
}
.price-card:hover {
    border-color: var(--line-2);
    background: #fffdf6;
}
/* 走势线贴着价格右侧，作为一行内容而不是底纹：底纹会穿过元信息与操作按钮。 */
.price-spark {
    width: 60px;
    height: 18px;
    margin-left: auto;
    align-self: center;
    flex: none;
    fill: none;
    stroke-width: 1.3;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.7;
}
.price-spark.up {
    stroke: var(--red);
}
.price-spark.down {
    stroke: var(--green);
}
.price-spark.flat {
    stroke: var(--muted);
}
.card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 16px;
}
.card-category {
    font-size: 11px;
    letter-spacing: 1px;
    color: var(--tone);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.card-badge {
    flex: none;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 10.5px;
    line-height: 15px;
    letter-spacing: 0.2px;
    font-variant-numeric: tabular-nums;
}
.card-badge.up {
    color: var(--red);
    background: #b33a3a12;
}
.card-badge.down {
    color: var(--green);
    background: #4a7c5912;
}
.card-badge.flat {
    color: var(--muted);
    background: #7b705f12;
}
.card-name {
    margin-top: 3px;
    font-size: 13.5px;
    line-height: 1.45;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.card-price {
    display: flex;
    align-items: baseline;
    gap: 3px;
    margin-top: 2px;
    min-width: 0;
}
.card-price b {
    font-size: 24px;
    line-height: 1.2;
    font-weight: 400;
    letter-spacing: -0.4px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
}
.card-price small {
    font-size: 11.5px;
    color: var(--gold);
}
.card-foot {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-top: 1px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    white-space: nowrap;
}
.card-foot i {
    font-style: normal;
    opacity: 0.6;
}
.foot-note {
    overflow: hidden;
    text-overflow: ellipsis;
}
.card-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: auto;
    padding-top: 7px;
    position: relative;
}
.act {
    padding: 3px 2px;
    font-size: 12px;
    color: var(--gold);
    border-radius: 2px;
}
.act.quiet {
    color: var(--muted);
}
.act:disabled {
    opacity: 0.55;
}
</style>
