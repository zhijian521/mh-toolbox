<script setup lang="ts">
import { computed } from 'vue';
import type { PriceChange, PriceItem, PriceLog } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
import { useApplication } from '../../stores/application';

/**
 * 一张物价卡片。
 *
 * 卡片只负责展示与派发操作：当前价、涨跌与显示口径全部来自领域层
 * （`priceCurrent` / `priceChange` / `priceLabel`），页面再把算好的走势点集传进来，
 * 卡片里不重算一遍，否则卡片与历史弹窗迟早给出两个价。
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
const updateText = computed(() => {
    if (props.current) return props.current.date.slice(5);
    return '未记录';
});
const logCount = computed(() => props.item.logs.length);
const unit = computed(() => props.item.unit || '个');

const delta = computed(() => {
    const change = props.change;
    if (!change) return null;
    const diff = rules.priceLabel(Math.abs(change.delta));
    const sign = change.delta > 0 ? '+' : change.delta < 0 ? '−' : '';
    return {
        dir: change.delta > 0 ? 'up' : change.delta < 0 ? 'down' : 'flat',
        arrow: change.delta > 0 ? '▲' : change.delta < 0 ? '▼' : '—',
        text: change.delta === 0 ? '持平' : sign + diff.value + ' ' + diff.unit,
        pct:
            change.pct === null || change.pct === 0
                ? ''
                : (change.pct > 0 ? '+' : '−') +
                  Math.abs(change.pct * 100).toFixed(Math.abs(change.pct) < 0.01 ? 2 : 1) +
                  '%',
        since: change.since.slice(5),
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

/** 折线点集：宽高固定，交给 viewBox 缩放，不依赖容器尺寸。 */
const sparkPoints = computed(() => {
    const values = props.trend;
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 64;
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
        <header class="card-head">
            <span class="card-category">{{ item.category }}</span>
            <div class="actions card-tools">
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="编辑物品"
                    title="编辑物品"
                    @click="emit('edit')"
                >
                    <AppIcon name="edit" :size="15" />
                </button>
                <button
                    class="icon-button danger"
                    :disabled="busy"
                    aria-label="删除物品"
                    title="删除物品"
                    @click="emit('remove')"
                >
                    <AppIcon name="trash" :size="15" />
                </button>
            </div>
        </header>

        <h2 class="card-name" :title="item.name">{{ item.name }}</h2>

        <div class="card-price">
            <span class="price-value">{{ label.value }}</span>
            <span v-if="label.unit" class="price-unit">{{ label.unit }}</span>
            <svg
                v-if="sparkPoints"
                class="price-spark"
                viewBox="0 0 64 18"
                :class="delta ? delta.dir : 'flat'"
                aria-hidden="true"
            >
                <polyline :points="sparkPoints" />
            </svg>
        </div>

        <p class="card-delta" :class="delta ? delta.dir : 'none'">
            <template v-if="delta">
                <span class="delta-text">{{ delta.arrow }} {{ delta.text }}</span>
                <span v-if="delta.pct" class="delta-pct">{{ delta.pct }}</span>
                <span class="delta-since">较 {{ delta.since }}</span>
            </template>
            <template v-else-if="current">首次记录</template>
            <template v-else>还没有价格，点「记价」补一条</template>
        </p>

        <p class="card-meta">
            <span>{{ updateText }}</span>
            <span class="meta-dot">·</span>
            <span>每{{ unit }}</span>
            <span class="meta-dot">·</span>
            <span>{{ logCount }} 条记录</span>
        </p>

        <p v-if="item.note" class="card-note" :title="item.note">{{ item.note }}</p>

        <div class="actions card-actions">
            <button
                class="btn compact primary"
                :disabled="busy"
                aria-label="记价"
                @click="emit('log')"
            >
                ＋ 记价
            </button>
            <button
                class="btn compact"
                :disabled="busy || !logCount"
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
    gap: 6px;
    padding: 14px 16px 13px 19px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper);
    min-width: 0;
    overflow: hidden;
    transition:
        border-color 120ms ease,
        transform 120ms ease,
        box-shadow 120ms ease;
}
/* 分类竖条：比整块色底更克制，也避免一屏卡片变成调色盘。 */
.price-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: var(--tone);
    opacity: 0.62;
}
.price-card:hover {
    border-color: var(--line-2);
    transform: translateY(-1px);
    box-shadow: 0 3px 10px #2f2a240f;
}
.card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 24px;
}
.card-category {
    font-size: 11.5px;
    letter-spacing: 1px;
    color: var(--tone);
}
.card-tools {
    gap: 2px;
    flex-wrap: nowrap;
    opacity: 0.7;
    transition: opacity 120ms ease;
}
.price-card:hover .card-tools,
.price-card:focus-within .card-tools {
    opacity: 1;
}
.card-tools .icon-button {
    width: 24px;
    height: 24px;
}
.card-name {
    font-size: 16px;
    line-height: 1.45;
    overflow-wrap: anywhere;
}
.card-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
}
.price-value {
    font-size: 27px;
    line-height: 1.15;
    letter-spacing: -0.5px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
}
.price-unit {
    font-size: 13px;
    color: var(--gold);
    letter-spacing: 0.5px;
}
.price-spark {
    width: 64px;
    height: 18px;
    margin-left: auto;
    align-self: center;
    flex: none;
    fill: none;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.85;
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
.card-delta {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12.5px;
    min-height: 18px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
}
.card-delta.up .delta-text,
.card-delta.up .delta-pct {
    color: var(--red);
}
.card-delta.down .delta-text,
.card-delta.down .delta-pct {
    color: var(--green);
}
.delta-text {
    font-variant-numeric: tabular-nums;
}
.delta-pct {
    font-variant-numeric: tabular-nums;
}
.delta-since {
    color: var(--muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
}
.card-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.meta-dot {
    opacity: 0.6;
}
.card-note {
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.card-actions {
    margin-top: auto;
    padding-top: 8px;
    gap: 6px;
}
</style>
