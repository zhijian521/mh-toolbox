<script setup lang="ts">
import { computed } from 'vue';
import type { PriceChange, PriceItem, PriceLog } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
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
 * 否则卡片与历史弹窗迟早给出两个价。
 *
 * 编辑与删除物品在卡片底部左侧有两个小图标（默认半透明，不抢眼），历史弹窗里
 * 也保留同一对入口——只在弹窗里给，卡片上就找不到地方改删了。记价与历史靠右，
 * 记价落在右下角，是最顺手的点击位置。
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
    edit: [];
    remove: [];
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
            <span class="card-tools">
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="编辑物品"
                    title="编辑物品"
                    @click="emit('edit')"
                >
                    <AppIcon name="edit" :size="13" />
                </button>
                <button
                    class="icon-button danger"
                    :disabled="busy"
                    aria-label="删除物品"
                    title="删除物品"
                    @click="emit('remove')"
                >
                    <AppIcon name="trash" :size="13" />
                </button>
            </span>
            <button
                class="text-button act quiet"
                :disabled="busy"
                aria-label="历史"
                @click="emit('history')"
            >
                历史
            </button>
            <button class="text-button act" :disabled="busy" aria-label="记价" @click="emit('log')">
                ＋ 记价
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
    border: 1px solid color-mix(in srgb, var(--tone) 22%, var(--line));
    border-radius: 5px;
    /* 卡片底色是分类色的极淡版本：同一类的卡片一眼认得出，又不至于盖过价格。 */
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--tone) 9%, var(--paper)) 0%,
        var(--paper) 58%
    );
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
    opacity: 0.85;
}
.price-card:hover {
    border-color: color-mix(in srgb, var(--tone) 42%, var(--line-2));
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--tone) 14%, var(--paper)) 0%,
        var(--paper) 62%
    );
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
    font-size: 15px;
    line-height: 1.5;
    letter-spacing: 0.2px;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.card-price {
    display: flex;
    align-items: baseline;
    gap: 3px;
    margin-top: 3px;
    padding: 1px 0 2px;
    border-radius: 3px;
    /* 价格后面一道分类色的光，从左向右淡出，右侧留给走势线。 */
    background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--tone) 14%, transparent) 0%,
        color-mix(in srgb, var(--tone) 4%, transparent) 58%,
        transparent 88%
    );
    min-width: 0;
}
.card-price b {
    font-size: 26px;
    line-height: 1.2;
    font-weight: 400;
    letter-spacing: -0.4px;
    font-variant-numeric: tabular-nums;
    /*
     * 价格用「分类色压暗」而不是纯墨色：既压得住浅色底，又和卡片色系连成一体。
     * 只混 28%：再高会接近涨跌用的红绿，让人误以为价格本身带了方向。
     */
    color: color-mix(in srgb, var(--tone) 28%, var(--ink));
}
.card-price small {
    font-size: 12px;
    color: color-mix(in srgb, var(--tone) 55%, var(--muted));
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
/*
 * 物品级操作（编辑 / 删除）靠左，默认半透明：平时不抢镜，指上去或键盘聚焦才变清楚。
 * 记价与历史被推到右侧，记价落在卡片的右下角——鼠标从右下过来就是这个最常用的动作。
 */
.card-tools {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-right: auto;
    opacity: 0.68;
    transition: opacity 120ms ease;
}
.price-card:hover .card-tools,
.price-card:focus-within .card-tools {
    opacity: 1;
}
.card-tools .icon-button {
    width: 22px;
    height: 22px;
}
/*
 * 「记价」是每张卡上最常用的动作，纯文字时一屏十二张都像一行灰注释。
 * 给它一块淡色底 + 同色描边做成小 chip：一眼看得出是可点的，但用分类色而不是
 * 主色金，不至于让整页变成一墙金按钮。
 */
.act {
    padding: 2px 10px;
    border: 1px solid color-mix(in srgb, var(--tone) 52%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--tone) 24%, var(--paper));
    font-size: 12px;
    line-height: 17px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: color-mix(in srgb, var(--tone) 85%, var(--ink));
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
}
/* 全局 .text-button:hover 会画下划线并转金色，chip 上不需要。 */
.act:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--tone) 78%, transparent);
    background: color-mix(in srgb, var(--tone) 36%, var(--paper));
    color: var(--ink);
    text-decoration: none;
}
/* 「历史」保持文字形态，与 chip 拉开层级。 */
.act.quiet {
    padding: 2px 2px;
    border-color: transparent;
    background: none;
    font-weight: 400;
    color: var(--muted);
}
.act.quiet:hover:not(:disabled) {
    border-color: transparent;
    background: none;
    color: var(--ink);
    text-decoration: none;
}
.act:disabled {
    opacity: 0.55;
}
</style>
