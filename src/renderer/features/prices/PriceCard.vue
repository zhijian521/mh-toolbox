<script setup lang="ts">
import { computed } from 'vue';
import type { PriceChange, PriceItem, PriceLog } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
import { useApplication } from '../../stores/application';
import { priceTone } from './tone';

/**
 * 一张物价卡片。
 *
 * 四段：`名称 →分类` / 虚线 / `价格 涨跌 走势` / `日期 … 三个小工具 ＋记价`。
 * 分类并进名称行、元信息并进操作行，都是为了让 210px 宽的卡从 151px 压到 102px——
 * 一屏从 4 行变 6 行。名称在前吃掉剩余宽度，分类靠右、到 46% 才截断，宁可截分类不截名字。
 * 底行只留「最后一次记价的日期」：记录条数在这个宽度里挤到看不见，而它本来也数不出来
 * 什么——要看几条就点历史。
 *
 * 三个物品级工具（编辑 / 删除 / 历史）**常驻但压到 0.45**，鼠标指上去或键盘进到卡内
 * 才淡到不透明。以前是默认全透明、只在 hover 现身——那时底行要塞下「日期 · 条数」，
 * 现在条数删了、宽度富裕，藏起来的入口反而不该藏：触屏与新手根本不知道有这三个按钮。
 * 历史弹窗里也保留编辑与删除，卡片上找不到时仍改得动。
 *
 * 卡片只负责展示与派发操作：当前价、涨跌与显示口径全部来自领域层
 * （`priceCurrent` / `priceChange` / `priceLabel`），卡片里不重算一遍，
 * 否则卡片与历史弹窗迟早给出两个价。
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

/**
 * 涨跌幅：10% 以下保留一位小数，再往上取整。
 * 一律取整会把 2.5% 写成 3%、7.1% 写成 7%——物价刚好在那几个点上有差别，磨掉就没意义了；
 * 而 10% 以上的整数位已经够用，多一位反而让徽章变宽。
 */
function percentText(pct: number) {
    return (pct < 10 ? Number(pct.toFixed(1)) : Math.round(pct)) + '%';
}

/** 涨跌徽章只放百分比，具体金额与基准日期挂在 title 上，省一行的宽度。 */
const badge = computed(() => {
    const change = props.change;
    if (!change) return null;
    /*
     * 两条记录都在同一天时，基准日期就是今天，写「较 10-28」容易被读成「跟昨天比」。
     * 这时改成「同日上一条」，才说得清是今天内的变动。
     */
    const since = change.since === props.current?.date ? '同日上一条' : change.since;
    const amount = rules.priceLabel(Math.abs(change.delta));
    // 不到一万时单位是空的，直接拼会留一个尾随空格（「涨 80 」）。
    const money = amount.unit ? amount.value + ' ' + amount.unit : amount.value;
    if (change.delta === 0) {
        return { dir: 'flat', text: '持平', title: '与 ' + since + ' 同价' };
    }
    const up = change.delta > 0;
    const pct = change.pct === null ? null : Math.abs(change.pct * 100);
    return {
        dir: up ? 'up' : 'down',
        arrow: up ? '▲' : '▼',
        text: pct === null ? money : percentText(pct),
        title: '较 ' + since + (up ? ' 涨 ' : ' 跌 ') + money,
    };
});

/**
 * 分类色的色调：一级固定，自定义一级按名称散列。取值在 `tone.ts`，与左侧目录共用。
 */
const tone = computed(() => priceTone(props.item.category));
/** 卡面标签取最具体的一层：有子类写子类，没有才退回一级。 */
const tag = computed(() => props.item.sub || props.item.category);
const tagTitle = computed(() =>
    props.item.sub ? props.item.category + ' · ' + props.item.sub : props.item.category,
);

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
        <header class="card-head">
            <h2 class="card-name" :title="item.name">{{ item.name }}</h2>
            <span class="card-category" :title="tagTitle">{{ tag }}</span>
        </header>

        <!-- 品名区与价格区之间一道虚线：价签上「上半写品名、下半写价钱」的那条分隔。 -->
        <span class="card-rule" aria-hidden="true"></span>

        <div class="card-price">
            <b>{{ label.value }}</b>
            <small v-if="label.unit">{{ label.unit }}</small>
            <span v-if="badge" class="card-badge" :class="badge.dir" :title="badge.title">
                {{ badge.arrow }} {{ badge.text }}
            </span>
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

        <footer class="card-foot">
            <span class="foot-meta">
                <span>{{ updateText }}</span>
                <template v-if="item.note">
                    <i>·</i>
                    <span class="foot-note" :title="item.note">{{ item.note }}</span>
                </template>
            </span>
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
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="历史"
                    title="历史"
                    @click="emit('history')"
                >
                    <AppIcon name="history" :size="13" />
                </button>
            </span>
            <button class="text-button act" :disabled="busy" aria-label="记价" @click="emit('log')">
                ＋ 记价
            </button>
        </footer>
    </article>
</template>

<style scoped>
.price-card {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 8px 12px 7px;
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
    width: 46px;
    height: 14px;
    margin-left: 6px;
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
/*
 * 首行：名称在前、分类贴右。
 *
 * 名称是这张卡的主体，先读到它；分类只是索引用的纸签，靠右对齐后不占名称的视线。
 * 分类 `flex: 0 0 auto` 不参与收缩，名称吃掉剩余宽度——要挤就挤名称自己（带省略号），
 * 分类到 46% 才截，避免「高级内丹」这类长分类把名称压成两个字。
 */
.card-head {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 16px;
}
.card-category {
    flex: 0 0 auto;
    max-width: 46%;
    margin-left: auto;
    padding: 0 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--tone) 14%, transparent);
    color: color-mix(in srgb, var(--tone) 88%, var(--ink));
    font-size: 10.5px;
    line-height: 15px;
    letter-spacing: 0.6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.card-badge {
    /* 徽章贴在价格右侧、走势线之前：先说涨跌，再看曲线形状。 */
    margin-left: auto;
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
    background: color-mix(in srgb, var(--red) 12%, transparent);
}
.card-badge.down {
    color: var(--green);
    background: color-mix(in srgb, var(--green) 12%, transparent);
}
.card-badge.flat {
    color: var(--muted);
    background: color-mix(in srgb, var(--muted) 12%, transparent);
}
.card-name {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
    letter-spacing: 0.2px;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
/*
 * 品名与价格之间的虚线：价签上「上半写品名、下半写价钱」的那条分隔。
 * 负外边距把它拉满到卡片两侧，虚线才会顶到边框，而不是缩在内边距里。
 */
.card-rule {
    height: 0;
    margin: 3px -12px 0;
    border-top: 1px dashed color-mix(in srgb, var(--tone) 32%, transparent);
}
.card-price {
    display: flex;
    align-items: baseline;
    gap: 3px;
    /* 价格带横贯卡片：左右用负外边距顶到边框，上下两条线把这一栏框住。 */
    margin: 0 -12px;
    padding: 3px 12px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--tone) 22%, transparent);
    background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--tone) 16%, transparent) 0%,
        color-mix(in srgb, var(--tone) 7%, transparent) 55%,
        color-mix(in srgb, var(--tone) 2%, transparent) 100%
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
/*
 * 底行：元信息在左、三个小工具贴着记价、记价压在最右。
 *
 * 工具组用 opacity 隐藏而不是 display: none——留着占位，hover 淡入时上面的
 * 时间块不会被突然挤短。210px 宽的卡里，这点宽度是真的会跳。
 */
.card-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.foot-meta {
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 0;
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
.card-tools {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
    /*
     * 底行只剩日期与记价之后，这里空出一大块。三个工具改成常驻淡显而不是 hover 才现身：
     * 藏起来的入口在触屏与新手那里等于没有，而 0.45 的 13px 图标在底行并不抢眼。
     */
    opacity: 0.55;
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
    flex: none;
    padding: 2px 10px;
    border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--tone) 13%, var(--paper));
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
    border-color: color-mix(in srgb, var(--tone) 66%, transparent);
    background: color-mix(in srgb, var(--tone) 24%, var(--paper));
    color: var(--ink);
    text-decoration: none;
}
.act:disabled {
    opacity: 0.55;
}
</style>
