<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DateRangeValue, Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import PageHeader from '../../components/PageHeader.vue';
import RangeFilter from '../../components/RangeFilter.vue';

/**
 * 总览：把收益、账号、目标三处的结论并排放一次。
 *
 * 这里**不重算任何口径**——所有数字来自领域已有的 `earningsStats` / `accountStats` /
 * `goalSummary`，页面只负责选区间、排版和画图。理由很实际：概览一旦自己算一遍，
 * 就会和明细页慢慢对不上，而用户只会认为「总览坏了」。
 *
 * 两个账本的区间是分开的：日常收益按「本日」看（当天打了多少），账号账本按「本月」看
 * （买卖是低频大额）。共用角色筛选，换角色三块一起变。
 *
 * 物品只取收益页的口径（按速记时标价算价值，`itemValue`）。「持有物品估值」是库存口径，
 * 同一个词两种数会让人以为哪边算错了，所以总览里不出现。
 *
 * 趋势图固定看「截至区间结束的 14 天」，与统计卡的区间起点无关：选「本日」时统计卡只有
 * 今天一天，图却仍然需要一段时间轴才有意义，所以图自己标「近 14 天」把话说明白。
 */
const app = useApplication();
const rules = app.rules();
const character = ref('all');
/** 日常收益按天看，账号账本按月看——两种事儿的时间尺度本来就不一样。 */
const earningsRange = ref<DateRangeValue>({ preset: 'today', ...U.rangeFor('today') });
const accountRange = ref<DateRangeValue>({ preset: 'month', ...U.rangeFor('month') });

const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((item) => ({ value: item.id, label: item.name })),
]);
const blank = computed(() => !app.characters.length && !(app.data?.transactions?.length ?? 0));
const charId = computed(() => character.value);

const earningsTx = computed<Transaction[]>(() => {
    void app.data;
    return rules.txIn(charId.value, earningsRange.value.from, earningsRange.value.to);
});
const earnings = computed(() => {
    void app.data;
    const { from, to } = earningsRange.value;
    return rules.earningsStats(charId.value, from, to, true);
});
const accountTx = computed<Transaction[]>(() => {
    void app.data;
    const { from, to } = accountRange.value;
    return rules.txIn(charId.value, from, to, 'account');
});
const accounts = computed(() => ({
    rmb: rules.accountStats(accountTx.value, 'rmb'),
    cash: rules.accountStats(accountTx.value, 'cash'),
}));
const rangeText = (value: DateRangeValue) => {
    if (!value.from && !value.to) return '全部时间';
    return value.to ? value.from + ' 至 ' + value.to : value.from + ' 起';
};

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
            note: s.count + ' 笔记录',
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
            note: s.itemQty + ' 件 · 按速记标价',
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

/** 趋势窗口：截至区间结束日的 14 天。结束日晚于今天时按今天算。 */
const trendDays = computed(() => {
    const today = U.today();
    const end =
        accountRange.value.to && accountRange.value.to < today ? accountRange.value.to : today;
    const days: string[] = [];
    for (let index = 13; index >= 0; index--) days.push(U.addDays(end, -index));
    return days;
});
const trendSpan = computed(() => ({
    from: trendDays.value[0],
    to: trendDays.value[trendDays.value.length - 1],
}));
const round2 = (value: number) => Math.round(value * 100) / 100;
/**
 * 按天累加净额。
 *
 * 一次遍历分桶再对齐日期，避免「14 天 × 全表过滤」那种平方级的写法；窗口外的流水
 * 直接跳过，几千条流水也只有一遍。
 */
function dailySeries(
    list: Transaction[],
    net: (tx: Transaction) => number,
    days = trendDays.value,
) {
    const window = new Set(days);
    const bucket = new Map<string, number>();
    list.forEach((tx) => {
        if (!window.has(tx.date)) return;
        bucket.set(tx.date, (bucket.get(tx.date) || 0) + net(tx));
    });
    const values = days.map((date) => round2(bucket.get(date) || 0));
    const peak = Math.max(1, ...values.map((value) => Math.abs(value)));
    return days.map((date, index) => ({ date, value: values[index], ratio: values[index] / peak }));
}
/** 日常收益只看现金：物品是「打了多少东西」，不是当天到手的币。 */
const earningsTrend = computed(() => {
    void app.data;
    const list = rules.txIn(charId.value, trendSpan.value.from, trendSpan.value.to);
    return dailySeries(list, (tx) =>
        tx.recordType === 'item'
            ? 0
            : tx.kind === 'income'
              ? Number(tx.amount) || 0
              : -(Number(tx.amount) || 0),
    );
});
/** 账号两本账各自一条趋势，与 `accountStats` 同口径（收入扣费、支出加费）。 */
const accountTrend = computed(() => {
    void app.data;
    const list = rules.txIn(charId.value, trendSpan.value.from, trendSpan.value.to, 'account');
    const net = (tx: Transaction) => {
        const fee = Number(tx.fee) || 0;
        return tx.kind === 'income'
            ? (Number(tx.amount) || 0) - fee
            : -((Number(tx.amount) || 0) + fee);
    };
    return {
        rmb: dailySeries(
            list.filter((tx) => tx.currency === 'rmb'),
            net,
        ),
        cash: dailySeries(
            list.filter((tx) => tx.currency !== 'rmb'),
            net,
        ),
    };
});
const trendTotal = (series: Array<{ value: number }>) =>
    round2(series.reduce((sum, point) => sum + point.value, 0));

const recentEarnings = computed(() =>
    earningsTx.value
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 6),
);
const recentAccounts = computed(() =>
    accountTx.value
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 6),
);

/** 进行中的目标，最多四张——总览是提醒「还有什么事」，不是目标列表。 */
const goals = computed(() => {
    void app.data;
    return rules
        .orderedGoals(rules.goalsFor())
        .map((goal) => ({ goal, summary: rules.goalSummary(goal) }))
        .filter((entry) => entry.summary.status === 'active')
        .slice(0, 4);
});
function goalText(entry: {
    goal: { tracking?: unknown; target?: number; unit?: string };
    summary: { achieved?: number; members?: unknown[]; current?: number };
}) {
    const { goal, summary } = entry;
    if (goal.tracking)
        return (
            (summary.achieved ?? 0) +
            ' / ' +
            (summary.members ? summary.members.length : 0) +
            ' 个角色达标'
        );
    return (
        U.fmtNumber(summary.current ?? 0) +
        ' / ' +
        U.fmtNumber(goal.target ?? 0) +
        ' ' +
        (goal.unit || '万')
    );
}

function amountText(tx: Transaction) {
    if (tx.recordType === 'item')
        return '估值 ' + U.fmtMoney((Number(tx.quantity) || 0) * (Number(tx.unitPrice) || 0));
    const fee = Number(tx.fee) || 0;
    const value =
        tx.kind === 'income' ? (Number(tx.amount) || 0) - fee : (Number(tx.amount) || 0) + fee;
    return (tx.kind === 'income' ? '+' : '−') + U.fmtAmount(value, tx.currency);
}
function rowTitle(tx: Transaction) {
    return tx.recordType === 'item'
        ? (tx.itemName || '物品') + ' ×' + (tx.quantity ?? 0)
        : tx.note || tx.category;
}
function rowTone(tx: Transaction) {
    if (tx.recordType === 'item') return 'item';
    return tx.kind;
}
</script>
<template>
    <PageHeader title="总览" description="今天的收益、这个月的账，以及还没达成的目标">
        <template #actions>
            <div class="overview-character">
                <BaseSelect v-model="character" label="总览角色筛选" :options="characterOptions" />
            </div>
        </template>
    </PageHeader>
    <div class="page-content overview">
        <div v-if="blank" class="empty">
            <AppIcon name="chart" :size="38" />
            <h2>还没有数据</h2>
            <p>先建一个角色，随后记的每一笔收益与账号收支都会汇总到这里。</p>
            <RouterLink class="btn primary" to="/characters">创建角色</RouterLink>
        </div>
        <template v-else>
            <!-- 日常收益 -->
            <section class="board" aria-label="日常收益">
                <header class="board-head">
                    <div class="board-title">
                        <h2>日常收益</h2>
                        <p>游戏币收入、点卡成本与物品，按速记口径汇总</p>
                    </div>
                    <div class="board-tools">
                        <RangeFilter v-model="earningsRange" label="收益统计时间" />
                        <RouterLink class="btn compact" to="/income">进入收益</RouterLink>
                    </div>
                </header>
                <div class="stat-strip">
                    <article
                        v-for="item in statCards"
                        :key="item.key"
                        class="stat"
                        :class="item.tone"
                    >
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
                                <b :class="trendTotal(earningsTrend) >= 0 ? 'in' : 'out'">
                                    {{ U.fmtMoney(trendTotal(earningsTrend)) }}
                                </b>
                            </span>
                        </header>
                        <div class="chart" role="img" aria-label="近 14 天每日净收益柱状图">
                            <div
                                v-for="point in earningsTrend"
                                :key="point.date"
                                class="chart-col"
                                :title="
                                    point.date +
                                    ' · ' +
                                    (point.value >= 0 ? '+' : '−') +
                                    U.fmtMoney(Math.abs(point.value))
                                "
                            >
                                <div class="chart-track">
                                    <i
                                        v-if="point.value"
                                        class="chart-bar"
                                        :class="point.value > 0 ? 'up' : 'down'"
                                        :style="{
                                            height:
                                                Math.max(
                                                    2,
                                                    Math.round(Math.abs(point.ratio) * 42),
                                                ) + 'px',
                                        }"
                                    ></i>
                                </div>
                            </div>
                        </div>
                        <footer class="chart-foot">
                            <span>{{ trendSpan.from.slice(5) }}</span>
                            <span class="chart-legend">
                                <i class="dot up"></i>
                                盈利
                                <i class="dot down"></i>
                                亏损
                            </span>
                            <span>{{ trendSpan.to.slice(5) }}</span>
                        </footer>
                    </section>
                    <section class="panel">
                        <header class="panel-head">
                            <h3>最近收益</h3>
                            <span class="panel-sub">{{ rangeText(earningsRange) }}</span>
                        </header>
                        <ul v-if="recentEarnings.length" class="mini-list">
                            <li v-for="tx in recentEarnings" :key="tx.id">
                                <span class="mini-date">{{ tx.date.slice(5) }}</span>
                                <span
                                    class="mini-name"
                                    :title="rowTitle(tx) + ' · ' + rules.charName(tx.characterId)"
                                >
                                    {{ rowTitle(tx) }}
                                    <small>{{ rules.charName(tx.characterId) }}</small>
                                </span>
                                <span class="mini-amount" :class="rowTone(tx)">
                                    {{ amountText(tx) }}
                                </span>
                            </li>
                        </ul>
                        <p v-else class="panel-empty">这个区间还没有收益记录。</p>
                    </section>
                </div>
            </section>

            <!-- 账号账本 -->
            <section class="board" aria-label="账号账本">
                <header class="board-head">
                    <div class="board-title">
                        <h2>账号账本</h2>
                        <p>人民币与梦幻币分开记，不折算合计</p>
                    </div>
                    <div class="board-tools">
                        <RangeFilter v-model="accountRange" label="账号统计时间" />
                        <RouterLink class="btn compact" to="/accounts">进入账号</RouterLink>
                    </div>
                </header>
                <div class="board-grid account-grid">
                    <section class="panel account-panel">
                        <header class="panel-head">
                            <h3>人民币</h3>
                            <span class="panel-sub">{{ accounts.rmb.count }} 笔 · 含手续费</span>
                        </header>
                        <dl class="account-figures">
                            <div>
                                <dt>总回款</dt>
                                <dd class="in">{{ U.fmtAmount(accounts.rmb.income, 'rmb') }}</dd>
                            </div>
                            <div>
                                <dt>总投入</dt>
                                <dd class="out">{{ U.fmtAmount(accounts.rmb.expense, 'rmb') }}</dd>
                            </div>
                            <div>
                                <dt>{{ accounts.rmb.net >= 0 ? '净回款' : '净支出' }}</dt>
                                <dd :class="accounts.rmb.net >= 0 ? 'in' : 'out'">
                                    {{ U.fmtAmount(Math.abs(accounts.rmb.net), 'rmb') }}
                                </dd>
                            </div>
                        </dl>
                        <p class="trend-label">近 14 天收支差额</p>
                        <div class="chart slim" role="img" aria-label="近 14 天人民币收支差额">
                            <div
                                v-for="point in accountTrend.rmb"
                                :key="point.date"
                                class="chart-col"
                                :title="
                                    point.date +
                                    ' · ' +
                                    (point.value >= 0 ? '+' : '−') +
                                    U.fmtAmount(Math.abs(point.value), 'rmb')
                                "
                            >
                                <div class="chart-track">
                                    <i
                                        v-if="point.value"
                                        class="chart-bar"
                                        :class="point.value > 0 ? 'up' : 'down'"
                                        :style="{
                                            height:
                                                Math.max(
                                                    2,
                                                    Math.round(Math.abs(point.ratio) * 30),
                                                ) + 'px',
                                        }"
                                    ></i>
                                </div>
                            </div>
                        </div>
                    </section>
                    <section class="panel account-panel">
                        <header class="panel-head">
                            <h3>梦幻币</h3>
                            <span class="panel-sub">{{ accounts.cash.count }} 笔 · 含手续费</span>
                        </header>
                        <dl class="account-figures">
                            <div>
                                <dt>交易收入</dt>
                                <dd class="in">{{ U.fmtMoney(accounts.cash.income) }}</dd>
                            </div>
                            <div>
                                <dt>交易支出</dt>
                                <dd class="out">{{ U.fmtMoney(accounts.cash.expense) }}</dd>
                            </div>
                            <div>
                                <dt>收支差额</dt>
                                <dd :class="accounts.cash.net >= 0 ? 'in' : 'out'">
                                    {{ U.fmtMoney(accounts.cash.net) }}
                                </dd>
                            </div>
                        </dl>
                        <p class="trend-label">近 14 天收支差额</p>
                        <div class="chart slim" role="img" aria-label="近 14 天梦幻币收支差额">
                            <div
                                v-for="point in accountTrend.cash"
                                :key="point.date"
                                class="chart-col"
                                :title="
                                    point.date +
                                    ' · ' +
                                    (point.value >= 0 ? '+' : '−') +
                                    U.fmtMoney(Math.abs(point.value))
                                "
                            >
                                <div class="chart-track">
                                    <i
                                        v-if="point.value"
                                        class="chart-bar"
                                        :class="point.value > 0 ? 'up' : 'down'"
                                        :style="{
                                            height:
                                                Math.max(
                                                    2,
                                                    Math.round(Math.abs(point.ratio) * 30),
                                                ) + 'px',
                                        }"
                                    ></i>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
                <section class="panel panel-wide">
                    <header class="panel-head">
                        <h3>最近账号记录</h3>
                        <span class="panel-sub">{{ rangeText(accountRange) }}</span>
                    </header>
                    <ul v-if="recentAccounts.length" class="mini-list">
                        <li v-for="tx in recentAccounts" :key="tx.id">
                            <span class="mini-date">{{ tx.date.slice(5) }}</span>
                            <span
                                class="mini-name"
                                :title="rowTitle(tx) + ' · ' + rules.charName(tx.characterId)"
                            >
                                {{ rowTitle(tx) }}
                                <small>
                                    {{ rules.charName(tx.characterId) }} ·
                                    {{
                                        tx.currency === 'rmb'
                                            ? '人民币'
                                            : tx.currency === 'reserve'
                                              ? '储备金'
                                              : '梦幻币'
                                    }}
                                </small>
                            </span>
                            <span class="mini-amount" :class="rowTone(tx)">
                                {{ amountText(tx) }}
                            </span>
                        </li>
                    </ul>
                    <p v-else class="panel-empty">这个区间还没有账号记录。</p>
                </section>
            </section>

            <!-- 进行中的目标 -->
            <section class="board" aria-label="进行中的目标">
                <header class="board-head">
                    <div class="board-title">
                        <h2>进行中的目标</h2>
                        <p>还差多少</p>
                    </div>
                    <div class="board-tools">
                        <RouterLink class="btn compact" to="/goals">查看目标</RouterLink>
                    </div>
                </header>
                <div v-if="goals.length" class="goal-grid">
                    <article v-for="entry in goals" :key="entry.goal.id" class="goal-mini">
                        <header>
                            <h3 :title="entry.goal.title">{{ entry.goal.title }}</h3>
                            <b>{{ entry.summary.pct }}%</b>
                        </header>
                        <div class="goal-bar">
                            <i
                                :style="{
                                    width: Math.max(0, Math.min(100, entry.summary.pct)) + '%',
                                }"
                            ></i>
                        </div>
                        <p>{{ goalText(entry) }}</p>
                    </article>
                </div>
                <p v-else class="panel-empty no-goal">
                    还没有进行中的目标。
                    <RouterLink class="text-button" to="/goals">去定一个</RouterLink>
                </p>
            </section>
        </template>
    </div>
</template>

<style scoped>
.overview {
    display: flex;
    flex-direction: column;
    gap: 26px;
}
.overview-character {
    width: 132px;
}
/* ---------- 账本段落：细线分隔，不用一层层白卡片堆起来 ---------- */
.board {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.board-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
}
.board-title {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.board-title h2 {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.3px;
}
.board-title p {
    color: var(--muted);
    font-size: 12px;
}
.board-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
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
.account-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
.panel-wide {
    margin-top: 0;
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
.panel-empty {
    margin: 0;
    padding: 16px 0;
    color: var(--muted);
    font-size: 12.5px;
}
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
.trend-label {
    margin: 2px 0 -4px;
    color: var(--muted);
    font-size: 11px;
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
    border-radius: 2px;
    transition: height 140ms ease;
}
.chart-bar.up {
    bottom: 50%;
    background: linear-gradient(to top, #a67c2e, #c39a4d);
}
.chart-bar.down {
    top: 50%;
    background: linear-gradient(to bottom, #b33a3a, #cf6a5f);
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
    background: #a67c2e;
}
.chart-legend .dot.down {
    margin-left: 6px;
    background: #b33a3a;
}
/* ---------- 账号数字 ---------- */
.account-figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 9px 11px;
    border-radius: 4px;
    background: var(--paper-2);
}
.account-figures div {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
}
.account-figures dt {
    color: var(--muted);
    font-size: 11px;
}
.account-figures dd {
    margin: 0;
    overflow: hidden;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.account-figures .in {
    color: var(--green);
}
.account-figures .out {
    color: var(--red);
}
/* ---------- 紧凑列表 ---------- */
.mini-list {
    padding: 0;
    margin: 0;
    list-style: none;
}
.mini-list li {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 9px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--line);
    font-size: 12.5px;
}
.mini-list li:last-child {
    border-bottom: 0;
}
.mini-date {
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}
.mini-name {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.mini-name small {
    flex: none;
    color: var(--muted);
    font-size: 11px;
}
.mini-amount {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.mini-amount.income {
    color: var(--green);
}
.mini-amount.expense {
    color: var(--red);
}
.mini-amount.item {
    color: var(--muted);
}
/* ---------- 目标 ---------- */
.goal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
}
.goal-mini {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
    min-width: 0;
}
.goal-mini header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.goal-mini h3 {
    overflow: hidden;
    font-size: 13.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.goal-mini b {
    flex: none;
    color: var(--gold);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
}
.goal-bar {
    height: 5px;
    border-radius: 3px;
    background: var(--panel-3);
    overflow: hidden;
}
.goal-bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(to right, #a67c2e, #c39a4d);
}
.goal-mini p {
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}
.goal-mini p:last-child {
    margin: 0;
}
.no-goal {
    display: flex;
    align-items: center;
    gap: 6px;
}
@media (max-width: 980px) {
    .stat-strip {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .stat:nth-child(3) {
        border-left: 0;
    }
    .stat:nth-child(n + 3) {
        border-top: 1px solid var(--line);
    }
    .board-grid,
    .account-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
@media (max-width: 750px) {
    .overview-character {
        width: 100%;
    }
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
