<script setup lang="ts">
import { computed } from 'vue';
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
} from './overview-shared';

/**
 * 账号账本：人民币与梦幻币两本账并排，各带一条近 14 天的收支差额，下面是最近记录。
 *
 * 两本账不折算合计——汇率随时在变，把「¥」和「万梦幻币」加在一起得到的数没有含义。
 * 汇总口径来自 `accountStats`，这里只负责排版与画图。
 */
const props = defineProps<{ character: string }>();

const app = useApplication();
const rules = app.rules();
const range = useDateRange('month');

const tx = computed<Transaction[]>(() => {
    void app.data;
    const { from, to } = range.value;
    return rules.txIn(props.character, from, to, 'account');
});
const accounts = computed(() => ({
    rmb: rules.accountStats(tx.value, 'rmb'),
    cash: rules.accountStats(tx.value, 'cash'),
}));

const days = computed(() => trendDaysOf(range.value));
/** 账号两本账各自一条趋势，与 `accountStats` 同口径（收入扣费、支出加费）。 */
const trend = computed(() => {
    void app.data;
    const list = rules.txIn(
        props.character,
        days.value[0],
        days.value[days.value.length - 1],
        'account',
    );
    const net = (item: Transaction) => {
        const fee = Number(item.fee) || 0;
        return item.kind === 'income'
            ? (Number(item.amount) || 0) - fee
            : -((Number(item.amount) || 0) + fee);
    };
    return {
        rmb: dailySeries(
            list.filter((item) => item.currency === 'rmb'),
            net,
            days.value,
        ),
        cash: dailySeries(
            list.filter((item) => item.currency !== 'rmb'),
            net,
            days.value,
        ),
    };
});

/** 人民币那张图的提示语要带币种符号，和上面的数字块保持一致。 */
const formatRmb = (value: number) => U.fmtAmount(value, 'rmb');

const recent = computed(() => tx.value.slice().sort(U.byDateDesc).slice(0, 6));
const currencyText = (item: Transaction) =>
    item.currency === 'rmb' ? '人民币' : item.currency === 'reserve' ? '储备金' : '梦幻币';
const rows = computed(() =>
    recent.value.map((item) => {
        const name = rules.charName(item.characterId);
        return {
            id: item.id,
            date: item.date.slice(5),
            title: rowTitle(item),
            sub: name + ' · ' + currencyText(item),
            amount: amountText(item, rules),
            tone: rowTone(item),
            tip: rowTitle(item) + ' · ' + name,
        };
    }),
);
</script>

<template>
    <OverviewBoard title="账号账本" description="人民币与梦幻币分开记，不折算合计">
        <template #tools>
            <RangeFilter v-model="range" label="账号统计时间" />
            <RouterLink class="btn compact" to="/accounts">进入账号</RouterLink>
        </template>
        <!-- `account-panel` 没有对应样式，是端到端取两个币种标题的钩子，别删。 -->
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
                <OverviewTrendChart
                    :points="trend.rmb"
                    :label="'近 14 天人民币收支差额'"
                    size="pixel"
                    slim
                    :format="formatRmb"
                />
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
                <OverviewTrendChart
                    :points="trend.cash"
                    :label="'近 14 天梦幻币收支差额'"
                    size="pixel"
                    slim
                    :format="U.fmtMoney"
                />
            </section>
        </div>
        <section class="panel panel-wide">
            <header class="panel-head">
                <h3>最近账号记录</h3>
                <span class="panel-sub">{{ rangeText(range) }}</span>
            </header>
            <OverviewMiniList :rows="rows" empty="这个区间还没有账号记录。" />
        </section>
    </OverviewBoard>
</template>

<style scoped>
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
.trend-label {
    margin: 2px 0 -4px;
    color: var(--muted);
    font-size: 11px;
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
</style>
