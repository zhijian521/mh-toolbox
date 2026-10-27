<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { DateRangeValue, Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import RangeFilter from '../../components/RangeFilter.vue';
import PageHeader from '../../components/PageHeader.vue';
import AccountEditor from './AccountEditor.vue';
import AccountRecords from './AccountRecords.vue';

/**
 * 账号账本。
 *
 * 人民币与梦幻币是两本独立的账：同一笔记录只属于一个币种，汇总也分开算，
 * 点卡、藏宝阁这些走人民币，游戏内买卖走梦幻币。所以页面上并排两张汇总卡，
 * 而不是合成一个「总收支」——把元和新台币式的万混加在一起没有意义。
 *
 * 金额口径（收入扣手续费、支出加手续费）全部来自领域 `accountStats`，
 * 页面不重算：卡片、最近记录、全部记录三处必须对得上。
 */
const app = useApplication();
const rules = app.rules();
const content = ref<HTMLElement>();
const addButton = ref<HTMLButtonElement>();
const character = ref('all');
/** 快捷按钮与日期区间共用一份状态，默认落在本月。 */
const range = ref<DateRangeValue>({ preset: 'month', ...U.rangeFor('month') });
const editing = ref<{ tx?: Transaction; preset?: Record<string, unknown> } | null>(null);
const recordsOpen = ref(false);

const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((item) => ({ value: item.id, label: item.name })),
]);
const records = computed<Transaction[]>(() => {
    void app.data;
    return rules
        .txIn(character.value, range.value.from, range.value.to, 'account')
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
});
const stats = computed(() => ({
    rmb: rules.accountStats(records.value, 'rmb'),
    cash: rules.accountStats(records.value, 'cash'),
}));
const recent = computed(() => records.value.slice(0, 8));
/** 最近记录的小标题：带上当前范围，避免和「全部记录」混淆。 */
const rangeText = computed(() => {
    const { from: start, to: end } = range.value;
    if (!start && !end) return '全部时间';
    return end ? start + ' 至 ' + end : start + ' 起';
});

/** 快捷入口只做预填，真正的校验仍在领域层；与 V1 的九宫格一致。 */
const shortcuts: Array<{
    id: string;
    title: string;
    icon: string;
    hint: string;
    preset: Record<string, unknown>;
}> = [
    {
        id: 'gear-buy',
        title: '买入装备',
        icon: 'sword',
        hint: '藏宝阁 · 人民币',
        preset: { category: '装备交易', kind: 'expense', currency: 'rmb', channel: '藏宝阁' },
    },
    {
        id: 'gear-sell',
        title: '卖出装备',
        icon: 'sword',
        hint: '藏宝阁 · 人民币',
        preset: { category: '装备交易', kind: 'income', currency: 'rmb', channel: '藏宝阁' },
    },
    {
        id: 'pet-buy',
        title: '买入召唤兽',
        icon: 'pet',
        hint: '藏宝阁 · 人民币',
        preset: { category: '召唤兽交易', kind: 'expense', currency: 'rmb', channel: '藏宝阁' },
    },
    {
        id: 'pet-sell',
        title: '卖出召唤兽',
        icon: 'pet',
        hint: '藏宝阁 · 人民币',
        preset: { category: '召唤兽交易', kind: 'income', currency: 'rmb', channel: '藏宝阁' },
    },
    {
        id: 'topup',
        title: '点卡充值',
        icon: 'card',
        hint: '官方充值 · 人民币',
        preset: { category: '点卡充值', kind: 'expense', currency: 'rmb', channel: '官方充值' },
    },
    {
        // 游戏内用梦幻币买点卡：同样记在「点卡充值」分类下，但走另一本账。
        id: 'topup-cash',
        title: '购买点卡',
        icon: 'card',
        hint: '游戏内 · 梦幻币',
        preset: { category: '点卡充值', kind: 'expense', currency: 'cash', channel: '游戏内' },
    },
    {
        id: 'coin-buy',
        title: '买入游戏币',
        icon: 'coin',
        hint: '游戏内 · 人民币',
        preset: { category: '游戏币买入', kind: 'expense', currency: 'rmb', channel: '游戏内' },
    },
    {
        id: 'coin-sell',
        title: '卖出游戏币',
        icon: 'coin',
        hint: '游戏内 · 人民币',
        preset: { category: '游戏币卖出', kind: 'income', currency: 'rmb', channel: '游戏内' },
    },
    {
        id: 'progress',
        title: '养成投入',
        icon: 'target',
        hint: '游戏内 · 梦幻币',
        preset: { category: '养成投入', kind: 'expense', currency: 'cash', channel: '游戏内' },
    },
    {
        id: 'other',
        title: '其他收支',
        icon: 'book',
        hint: '自选方向与币种',
        preset: { category: '其他收支', kind: 'expense', currency: 'rmb', channel: '其他' },
    },
];

function currencyText(currency: string) {
    return currency === 'rmb' ? '人民币' : currency === 'reserve' ? '储备金' : '梦幻币';
}
/** 实收 / 实付：收入扣手续费，支出加手续费，与 `accountStats` 同一口径。 */
function netAmount(tx: Transaction) {
    const fee = Number(tx.fee) || 0;
    return tx.kind === 'income' ? tx.amount - fee : tx.amount + fee;
}
function signedAmount(tx: Transaction) {
    return (tx.kind === 'income' ? '+' : '−') + U.fmtAmount(netAmount(tx), tx.currency);
}
function openEditor(presetValues?: Record<string, unknown>) {
    editing.value = { preset: presetValues };
}
function openRecord(tx: Transaction) {
    editing.value = { tx: plain(tx) as Transaction };
}
/** 记录弹窗里点编辑时先收起列表，两层弹窗都会抢 Escape 与焦点循环。 */
function editFromList(tx: Transaction) {
    recordsOpen.value = false;
    editing.value = { tx: plain(tx) as Transaction };
}
async function saved() {
    editing.value = null;
    await nextTick();
    addButton.value?.focus({ preventScroll: true });
}
</script>
<template>
    <PageHeader title="账号" description="人民币与梦幻币分账记录 · 快捷入口按类型预设收支">
        <template #actions>
            <button ref="addButton" class="btn primary" :disabled="app.busy" @click="openEditor()">
                ＋ 记一笔
            </button>
        </template>
    </PageHeader>
    <div ref="content" class="page-content">
        <div v-if="!app.characters.length" class="empty">
            <AppIcon name="book" :size="38" />
            <h2>先创建角色</h2>
            <p>账号收支挂在角色上，有了角色才能开始记账。</p>
            <RouterLink class="btn" to="/characters">去角色页</RouterLink>
        </div>
        <template v-else>
            <div class="account-filters">
                <RangeFilter v-model="range" label="账号统计时间" />
                <div class="filter-character">
                    <BaseSelect
                        v-model="character"
                        label="账号角色筛选"
                        :options="characterOptions"
                    />
                </div>
            </div>
            <div class="account-totals">
                <article class="card total-card">
                    <header class="card-title">
                        人民币收支
                        <small>含手续费 · {{ stats.rmb.count }} 笔</small>
                    </header>
                    <div class="account-metrics">
                        <span>
                            收入
                            <b class="money-in">{{ U.fmtAmount(stats.rmb.income, 'rmb') }}</b>
                        </span>
                        <span>
                            支出
                            <b class="money-out">{{ U.fmtAmount(stats.rmb.expense, 'rmb') }}</b>
                        </span>
                        <span>
                            差额
                            <b :class="stats.rmb.net >= 0 ? 'money-in' : 'money-out'">
                                {{ U.fmtAmount(stats.rmb.net, 'rmb') }}
                            </b>
                        </span>
                    </div>
                </article>
                <article class="card total-card">
                    <header class="card-title">
                        梦幻币收支
                        <small>含手续费 · {{ stats.cash.count }} 笔</small>
                    </header>
                    <div class="account-metrics">
                        <span>
                            收入
                            <b class="money-in">{{ U.fmtAmount(stats.cash.income, 'cash') }}</b>
                        </span>
                        <span>
                            支出
                            <b class="money-out">{{ U.fmtAmount(stats.cash.expense, 'cash') }}</b>
                        </span>
                        <span>
                            差额
                            <b :class="stats.cash.net >= 0 ? 'money-in' : 'money-out'">
                                {{ U.fmtAmount(stats.cash.net, 'cash') }}
                            </b>
                        </span>
                    </div>
                </article>
            </div>
            <section class="card section-card">
                <header class="card-title">
                    快捷记账
                    <small>选择类型后填写金额</small>
                </header>
                <div class="shortcut-grid">
                    <button
                        v-for="item in shortcuts"
                        :key="item.id"
                        type="button"
                        class="shortcut"
                        :data-shortcut="item.id"
                        :disabled="app.busy"
                        @click="openEditor(item.preset)"
                    >
                        <span class="shortcut-head">
                            <AppIcon :name="item.icon" :size="20" />
                            <span
                                class="badge"
                                :class="item.preset.kind === 'income' ? 'in' : 'out'"
                            >
                                {{ item.preset.kind === 'income' ? '收入' : '支出' }}
                            </span>
                        </span>
                        <b>{{ item.title }}</b>
                        <span class="shortcut-hint">{{ item.hint }}</span>
                    </button>
                </div>
            </section>
            <section class="card section-card">
                <header class="card-title">
                    最近记录
                    <small>{{ rangeText }} · 点击编辑</small>
                </header>
                <ul v-if="recent.length" class="recent-list">
                    <li v-for="tx in recent" :key="tx.id">
                        <button
                            type="button"
                            class="recent-row"
                            :data-record="tx.id"
                            @click="openRecord(tx)"
                        >
                            <span class="recent-kind">
                                <span class="badge" :class="tx.kind === 'income' ? 'in' : 'out'">
                                    {{ tx.kind === 'income' ? '收入' : '支出' }}
                                </span>
                                <span class="recent-category">{{ tx.category }}</span>
                                <span class="recent-note" :title="tx.note">{{ tx.note }}</span>
                            </span>
                            <span class="recent-meta">
                                {{ tx.date }} · {{ rules.charName(tx.characterId) }}
                            </span>
                            <span class="recent-meta">
                                {{ tx.channel }} · {{ currencyText(tx.currency) }}
                            </span>
                            <span class="recent-amount" :class="tx.kind">
                                {{ signedAmount(tx) }}
                                <small v-if="tx.fee">
                                    手续费 {{ U.fmtAmount(tx.fee, tx.currency) }}
                                </small>
                            </span>
                        </button>
                    </li>
                </ul>
                <p v-else class="empty-line">
                    这个范围还没有记录，点上面的快捷入口记第一笔账号收支。
                </p>
                <footer class="recent-footer">
                    <span>
                        共
                        <b>{{ records.length }}</b>
                        笔账号记录
                    </span>
                    <button class="btn compact" :disabled="app.busy" @click="recordsOpen = true">
                        查看全部记录
                    </button>
                </footer>
            </section>
        </template>
    </div>
    <AccountEditor
        v-if="editing"
        :tx="editing.tx"
        :preset="editing.preset"
        @close="editing = null"
        @saved="saved"
    />
    <AccountRecords
        v-if="recordsOpen"
        @close="recordsOpen = false"
        @edit="editFromList"
        @add="
            recordsOpen = false;
            editing = {};
        "
    />
</template>

<style scoped>
.account-filters {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.filter-character {
    width: 132px;
}
.account-totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
    margin-bottom: 14px;
}
.card {
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
}
.card-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    font-size: 15px;
    font-weight: 600;
}
.card-title small {
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 400;
}
.account-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
    margin-top: 12px;
    font-size: 12.5px;
    color: var(--muted);
}
.account-metrics span {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
}
.account-metrics b {
    font-size: 15px;
    font-variant-numeric: tabular-nums;
}
.money-in {
    color: var(--green);
}
.money-out {
    color: var(--red);
}
.section-card {
    margin-bottom: 14px;
}
/* 十个入口固定五列，正好两整行；auto-fill 在宽窗口下会排成 6+4，末行缺角很难看。 */
.shortcut-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
}
.shortcut {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    padding: 12px 13px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper-2);
    color: var(--ink);
    font-family: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
    transition:
        border-color 120ms ease,
        background 120ms ease;
}
.shortcut:hover:not(:disabled) {
    border-color: var(--gold);
    background: #eee3cb;
}
.shortcut:disabled {
    opacity: 0.6;
    cursor: default;
}
.shortcut-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    color: var(--gold);
}
.shortcut b {
    font-size: 13.5px;
}
.shortcut-hint {
    color: var(--muted);
    font-size: 11.5px;
}
.badge {
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    font-size: 11px;
}
.badge.in {
    color: var(--green);
    border-color: #4a7c5973;
}
.badge.out {
    color: var(--red);
    border-color: #b33a3a66;
}
.recent-list {
    padding: 0;
    margin: 10px 0 0;
    list-style: none;
}
/*
 * 最近记录横排：分类、备注、日期与角色、渠道与币种、金额各占一列。
 * 早先做成「左内容 + 右金额」两栏，一行只有几十个字，中间大片空白；
 * 铺满整行之后八条记录的信息量接近全部记录弹窗，又不用点进去才能看清。
 */
.recent-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 156px 132px 122px;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 10px 8px;
    border: none;
    border-bottom: 1px solid var(--line);
    border-radius: 4px;
    background: none;
    color: inherit;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
}
.recent-row:hover {
    background: var(--paper-2);
}
.recent-kind {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.recent-category {
    flex: none;
    font-size: 13.5px;
}
/* 备注紧跟分类，占用剩余宽度并在过长时截断——单独占一列时，没有备注就会留出大片空白。 */
.recent-note {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 12.5px;
}
.recent-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 12px;
}
.recent-amount {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    justify-self: end;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
}
.recent-amount small {
    color: var(--muted);
    font-size: 11px;
}
.recent-amount.income {
    color: var(--green);
}
.recent-amount.expense {
    color: var(--red);
}
.empty-line {
    margin: 14px 0;
    color: var(--muted);
    font-size: 12.5px;
}
.recent-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12.5px;
}
@media (max-width: 980px) {
    .shortcut-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}
@media (max-width: 750px) {
    .shortcut-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .filter-character {
        width: 100%;
    }
    .recent-row {
        grid-template-columns: 1fr auto;
        gap: 4px 12px;
        padding: 11px 8px;
    }
    .recent-meta {
        display: none;
    }
    .recent-note {
        grid-column: 1 / -1;
    }
}
</style>
