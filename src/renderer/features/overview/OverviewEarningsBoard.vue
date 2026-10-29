<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import RangeFilter from '../../components/RangeFilter.vue';
import { useDateRange } from '../../components/use-date-range';
import OverviewBoard from './OverviewBoard.vue';
import OverviewTrendChart from './OverviewTrendChart.vue';
import OverviewMiniList from './OverviewMiniList.vue';
import {
    amountText,
    dailySeries,
    rangeText,
    rowTitle,
    rowTone,
    trendDaysOf,
    trendTotal,
} from './overview-shared';

/**
 * 日常收益：五张统计卡 + 每日净收益柱状图 + 最近收益。
 *
 * 这里**不重算任何口径**——数字全部来自 `earningsStats`，图按天分桶只是把已有流水
 * 按日期摆开（`dailySeries`）。自己再算一遍，概览就会和收益页慢慢对不上，而用户只
 * 会认为「总览坏了」。
 *
 * 区间是这一块自己的：日常收益按天看（当天打了多少），与账号账本按月看互不影响。
 * 趋势图固定看「截至区间结束的 14 天」，与统计卡的起点无关——选「本日」时统计卡只有
 * 今天一天，图却仍然需要一段时间轴才有意义，所以图自己标「近 14 天」把话说明白。
 */
const props = defineProps<{ character: string }>();

const app = useApplication();
const rules = app.rules();
const range = useDateRange('today');
/**
 * 计时中时长与点卡在涨，而总览没有明细页那种每秒节拍。半分钟对一次表就够——
 * 这个页面是「扫一眼」，不是秒表；只在真的在计时时才重算，平时一个周期都不跑。
 */
const tick = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    clock = setInterval(() => {
        if (rules.runningSessions().length) tick.value = Date.now();
    }, 30000);
});
onBeforeUnmount(() => {
    if (clock) clearInterval(clock);
});

const tx = computed<Transaction[]>(() => {
    void app.data;
    return rules.txIn(props.character, range.value.from, range.value.to);
});
const earnings = computed(() => {
    void app.data;
    void tick.value;
    const { from, to } = range.value;
    return rules.earningsStats(props.character, from, to, true);
});
/** 只算「现金收入」的笔数：物品与点卡也是记录，混进来会让这个数字对不上金额。 */
const incomeCount = computed(
    () => tx.value.filter((item) => item.recordType !== 'item' && item.kind === 'income').length,
);
/** 五张卡：净收益领头，后面是构成它的三块与一个效率指标。 */
const statCards = computed(() => {
    const s = earnings.value;
    return [
        {
            key: 'net',
            label: '净收益',
            value: U.fmtMoney(s.net),
            note: '收入 ' + U.fmtMoney(s.income) + ' − 支出 ' + U.fmtMoney(s.expense),
            tone: s.net > 0 ? 'in' : s.net < 0 ? 'out' : '',
        },
        {
            key: 'income',
            label: '游戏币收入',
            value: U.fmtMoney(s.income),
            note: incomeCount.value + ' 笔收入',
            tone: '',
        },
        {
            key: 'cost',
            label: '点卡消耗',
            value: U.fmtMoney(s.cardCost),
            note: '在线 ' + U.fmtMinutes(s.onlineMinutes),
            tone: 'out',
        },
        {
            key: 'item',
            label: '物品估值',
            value: U.fmtMoney(s.itemValue),
            note: s.itemQty + ' 件 · 按当前物价',
            tone: '',
        },
        {
            key: 'hourly',
            label: '在线净时薪',
            value: s.hourly == null ? '—' : U.fmtMoney(s.hourly),
            note: '净收益 ÷ 已记录在线时长',
            tone: (s.hourly ?? 0) < 0 ? 'out' : '',
        },
    ];
});

const days = computed(() => trendDaysOf(range.value));
const span = computed(() => ({ from: days.value[0], to: days.value[days.value.length - 1] }));
/** 日常收益只看现金：物品是「打了多少东西」，不是当天到手的币。 */
const trend = computed(() => {
    void app.data;
    void tick.value;
    const list = rules.txIn(props.character, span.value.from, span.value.to);
    return dailySeries(
        list,
        (item) =>
            item.recordType === 'item'
                ? 0
                : item.kind === 'income'
                  ? Number(item.amount) || 0
                  : -(Number(item.amount) || 0),
        days.value,
    );
});

const recent = computed(() => tx.value.slice().sort(U.byDateDesc).slice(0, 6));
const rows = computed(() =>
    recent.value.map((item) => {
        const name = rules.charName(item.characterId);
        return {
            id: item.id,
            date: item.date.slice(5),
            title: rowTitle(item),
            sub: name,
            amount: amountText(item, rules),
            tone: rowTone(item),
            tip: rowTitle(item) + ' · ' + name,
        };
    }),
);
</script>

<template>
    <OverviewBoard title="日常收益" description="游戏币收入、点卡成本与物品，按速记口径汇总">
        <template #tools>
            <RangeFilter v-model="range" label="收益统计时间" />
            <RouterLink class="btn compact" to="/income">进入收益</RouterLink>
        </template>
        <div class="stat-strip">
            <article v-for="item in statCards" :key="item.key" class="stat" :class="item.tone">
                <span class="stat-label">{{ item.label }}</span>
                <b class="stat-value">{{ item.value }}</b>
                <small class="stat-note">{{ item.note }}</small>
            </article>
        </div>
        <div class="board-grid">
            <section class="panel">
                <header class="panel-head">
                    <h3>每日净收益</h3>
                    <span class="panel-sub">
                        近 14 天 · 合计
                        <b :class="trendTotal(trend) >= 0 ? 'in' : 'out'">
                            {{ U.fmtMoney(trendTotal(trend)) }}
                        </b>
                    </span>
                </header>
                <OverviewTrendChart
                    :points="trend"
                    :label="'近 14 天每日净收益柱状图'"
                    :format="U.fmtMoney"
                    :span="span"
                />
            </section>
            <section class="panel">
                <header class="panel-head">
                    <h3>最近收益</h3>
                    <span class="panel-sub">{{ rangeText(range) }}</span>
                </header>
                <OverviewMiniList :rows="rows" empty="这个区间还没有收益记录。" />
            </section>
        </div>
    </OverviewBoard>
</template>

<style scoped>
/* ---------- 统计条：竖线分隔的数字块，比卡片轻 ---------- */
.stat-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
    overflow: hidden;
}
.stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 11px 14px;
    min-width: 0;
    border-left: 1px solid var(--line);
}
.stat:first-child {
    border-left: 0;
    background: var(--paper-2);
}
.stat-label {
    color: var(--muted);
    font-size: 11.5px;
}
.stat-value {
    font-size: 19px;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.2px;
}
.stat-note {
    overflow: hidden;
    color: var(--muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.stat.in .stat-value {
    color: var(--green);
}
.stat.out .stat-value {
    color: var(--red);
}
/* ---------- 面板 ---------- */
.board-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 12px;
    /* 两个面板等高：一边是图、一边是列表，长短不一会显得没对齐。 */
    align-items: stretch;
}
.panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 13px 15px 14px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
    min-width: 0;
}
.panel-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
}
.panel-head h3 {
    font-size: 13.5px;
    font-weight: 600;
}
.panel-sub {
    color: var(--muted);
    font-size: 11.5px;
    white-space: nowrap;
}
.panel-sub b {
    font-variant-numeric: tabular-nums;
}
.panel-sub b.in {
    color: var(--green);
}
.panel-sub b.out {
    color: var(--red);
}
/* 窗口最小宽度是 1024（main.cjs），断点放在它上面才真的会命中。 */
@media (max-width: 1080px) {
    .stat-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /* 两列排布：行首（1/3/5）不要左边框，第二行起补上边框。 */
    .stat:nth-child(odd) {
        border-left: 0;
    }
    .stat:nth-child(n + 3) {
        border-top: 1px solid var(--line);
    }
    /* 五格挤两列时最后一行只有一格，横跨整行，别在右下留半块空白。 */
    .stat:nth-child(5) {
        grid-column: 1 / -1;
    }
}
@media (max-width: 750px) {
    .stat-strip {
        grid-template-columns: minmax(0, 1fr);
    }
    .stat {
        border-left: 0;
        border-top: 1px solid var(--line);
    }
    .stat:first-child {
        border-top: 0;
    }
}
</style>
