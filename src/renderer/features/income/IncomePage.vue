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
import IncomeEditor from './IncomeEditor.vue';
import IncomeRecords from './IncomeRecords.vue';

/**
 * 收益账本。
 *
 * 与账号页是同一张 transactions 表的另一半（`ledger: 'earnings'`）：那边记人民币与
 * 梦幻币的进出，这边记游戏内的日常收益、点卡成本与在线时长。
 *
 * 汇总一律来自领域 `earningsStats`：收支、在线时长、点卡成本、时薪、库存估值都是
 * 同一套口径算出来的，页面不重算。物品记录不计入收支——持有中的物品只算库存估值，
 * 卖出时才由成交记录产生收入，所以列表里物品行与金额行要分开看。
 */
const app = useApplication();
const rules = app.rules();
const addButton = ref<HTMLButtonElement>();
const character = ref('all');
const range = ref<DateRangeValue>({ preset: 'month', ...U.rangeFor('month') });
const editing = ref<{ tx?: Transaction } | null>(null);
const recordsOpen = ref(false);
/** 打开弹窗的那个按钮：保存后把焦点还回去。 */
const opener = ref<HTMLElement | null>(null);

const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((item) => ({ value: item.id, label: item.name })),
]);
const records = computed<Transaction[]>(() => {
    void app.data;
    return rules
        .txIn(character.value, range.value.from, range.value.to)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
});
const stats = computed(() => {
    void app.data;
    return rules.earningsStats(character.value, range.value.from, range.value.to);
});
const recent = computed(() => records.value.slice(0, 8));
const rangeText = computed(() => {
    const { from: start, to: end } = range.value;
    if (!start && !end) return '全部时间';
    return end ? start + ' 至 ' + end : start + ' 起';
});

/** 收支方向与物品状态共用一套措辞，列表与弹窗口径一致。 */
function kindText(tx: Transaction) {
    // 物品只是库存，不是当期收益：标成「收入」会让人以为它已经计入收支。
    if (isItem(tx)) return '物品';
    return tx.kind === 'income' ? '收入' : '支出';
}
function signedAmount(tx: Transaction) {
    return (tx.kind === 'income' ? '+' : '−') + U.fmtMoney(tx.amount);
}
function isItem(tx: Transaction) {
    return tx.recordType === 'item';
}
/** 物品行：名称 + 剩余/获得；金额列显示的是估值，不是收入。 */
function itemSummary(tx: Transaction) {
    const remaining = rules.itemRemaining(tx);
    return tx.itemName + ' · 剩 ' + remaining + '/' + (tx.quantity ?? 0);
}
function currencyText(tx: Transaction) {
    return tx.currency === 'reserve' ? '储备金' : '梦幻币';
}
/** 成交记录挂在物品上，列表里要能看出它是哪件物品卖出去的。 */
function saleText(tx: Transaction) {
    const quantity = tx.saleQuantity ?? 0;
    return '成交 ×' + quantity;
}

function remember() {
    const active = document.activeElement;
    opener.value = active instanceof HTMLElement && active !== document.body ? active : null;
}
function openEditor() {
    remember();
    editing.value = {};
}
function openRecord(tx: Transaction) {
    if (isItem(tx)) return;
    remember();
    editing.value = { tx: plain(tx) as Transaction };
}
function editFromList(tx: Transaction) {
    recordsOpen.value = false;
    opener.value = null;
    editing.value = { tx: plain(tx) as Transaction };
}
function addFromList() {
    recordsOpen.value = false;
    opener.value = null;
    editing.value = {};
}
async function saved() {
    editing.value = null;
    await nextTick();
    const target = opener.value?.isConnected ? opener.value : addButton.value;
    target?.focus({ preventScroll: true });
    opener.value = null;
}
</script>
<template>
    <PageHeader title="收益" description="游戏内收益、点卡与在线时长 · 物品卖出后才计入收入">
        <template #actions>
            <button ref="addButton" class="btn primary" :disabled="app.busy" @click="openEditor()">
                ＋ 记一笔
            </button>
        </template>
    </PageHeader>
    <div class="page-content">
        <div v-if="!app.characters.length" class="empty">
            <AppIcon name="bolt" :size="38" />
            <h2>先创建角色</h2>
            <p>收益挂在角色上，有了角色才能开始记账。</p>
            <RouterLink class="btn" to="/characters">去角色页</RouterLink>
        </div>
        <template v-else>
            <div class="income-filters">
                <RangeFilter v-model="range" label="收益统计时间" />
                <div class="filter-character">
                    <BaseSelect
                        v-model="character"
                        label="收益角色筛选"
                        :options="characterOptions"
                    />
                </div>
            </div>
            <div class="income-totals">
                <article class="card">
                    <header class="card-title">
                        收益概览
                        <small>共 {{ stats.count }} 笔</small>
                    </header>
                    <p class="net">
                        <span>净收益</span>
                        <b :class="stats.net >= 0 ? 'money-in' : 'money-out'">
                            {{ U.fmtMoney(stats.net) }}
                        </b>
                    </p>
                    <div class="metrics">
                        <span>
                            收入
                            <b class="money-in">{{ U.fmtMoney(stats.income) }}</b>
                        </span>
                        <span>
                            支出
                            <b class="money-out">{{ U.fmtMoney(stats.expense) }}</b>
                        </span>
                    </div>
                </article>
                <article class="card">
                    <header class="card-title">
                        在线与点卡
                        <small>来自在线计时记录</small>
                    </header>
                    <p class="net">
                        <span>时薪</span>
                        <b :class="stats.hourly !== null && stats.hourly < 0 ? 'money-out' : ''">
                            {{ stats.hourly === null ? '—' : U.fmtMoney(stats.hourly) + ' / 时' }}
                        </b>
                    </p>
                    <div class="metrics">
                        <span>
                            在线
                            <b>{{ U.fmtMinutes(stats.onlineMinutes) }}</b>
                        </span>
                        <span>
                            点卡成本
                            <b class="money-out">{{ U.fmtMoney(stats.cardCost) }}</b>
                        </span>
                    </div>
                </article>
                <article class="card">
                    <header class="card-title">
                        库存估值
                        <small>{{ stats.itemCount }} 件在仓</small>
                    </header>
                    <p class="net">
                        <span>待售估值</span>
                        <b>{{ U.fmtMoney(stats.itemEstimate) }}</b>
                    </p>
                    <p class="hint stock-hint">按剩余数量 × 单价估算，卖出后转成收入。</p>
                </article>
            </div>
            <section class="card section-card">
                <header class="card-title">
                    最近记录
                    <small>{{ rangeText }} · 点击编辑</small>
                </header>
                <ul v-if="recent.length" class="recent-list">
                    <li v-for="tx in recent" :key="tx.id">
                        <!-- 物品行只读，用 div 而不是 disabled 的 button：后者会被浏览器灰化。 -->
                        <component
                            :is="isItem(tx) ? 'div' : 'button'"
                            class="recent-row"
                            :class="{ readonly: isItem(tx) }"
                            :data-record="tx.id"
                            @click="openRecord(tx)"
                        >
                            <span class="recent-kind">
                                <span class="badge" :class="isItem(tx) ? 'item' : tx.kind">
                                    {{ kindText(tx) }}
                                </span>
                                <span class="recent-category">
                                    {{ isItem(tx) ? itemSummary(tx) : tx.category }}
                                </span>
                                <span class="recent-note" :title="tx.note">{{ tx.note }}</span>
                            </span>
                            <span class="recent-meta">
                                {{ tx.date }} · {{ rules.charName(tx.characterId) }}
                            </span>
                            <span class="recent-meta">
                                {{ currencyText(tx) }}
                            </span>
                            <span class="recent-amount" :class="tx.kind">
                                {{ isItem(tx) ? U.fmtMoney(tx.amount) : signedAmount(tx) }}
                                <small v-if="isItem(tx)">估值</small>
                                <small v-else-if="tx.saleQuantity">{{ saleText(tx) }}</small>
                            </span>
                        </component>
                    </li>
                </ul>
                <p v-else class="empty-line">这个范围还没有收益记录，点上面的「记一笔」开始。</p>
                <footer class="recent-footer">
                    <span>
                        共
                        <b>{{ records.length }}</b>
                        笔收益记录
                    </span>
                    <button class="btn compact" :disabled="app.busy" @click="recordsOpen = true">
                        查看记录
                    </button>
                </footer>
            </section>
        </template>
    </div>
    <IncomeEditor v-if="editing" :tx="editing.tx" @close="editing = null" @saved="saved" />
    <IncomeRecords
        v-if="recordsOpen"
        :range="range"
        :character="character"
        @close="recordsOpen = false"
        @edit="editFromList"
        @add="addFromList"
    />
</template>

<style scoped>
.income-filters {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.filter-character {
    width: 132px;
}
.income-totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(232px, 1fr));
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
/* 净收益/时薪这类主数值单独一行放大，下面的收支做次级信息。 */
.net {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin: 12px 0 0;
    color: var(--muted);
    font-size: 12.5px;
}
.net b {
    color: var(--ink);
    font-size: 19px;
    font-variant-numeric: tabular-nums;
}
.net b.money-in {
    color: var(--green);
}
.net b.money-out {
    color: var(--red);
}
.metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 20px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 12.5px;
    color: var(--muted);
}
.metrics span {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
}
.metrics b {
    color: var(--ink);
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
}
.metrics b.money-in {
    color: var(--green);
}
.metrics b.money-out {
    color: var(--red);
}
.stock-hint {
    margin: 8px 0 0;
    font-size: 11.5px;
    line-height: 1.5;
}
.section-card {
    margin-bottom: 14px;
}
.recent-list {
    padding: 0;
    margin: 10px 0 0;
    list-style: none;
}
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
.recent-list li:last-child .recent-row {
    border-bottom: 0;
}
.recent-row:hover:not(.readonly) {
    background: var(--paper-2);
}
/* 物品记录第二刀才开编辑入口，这里先只读，不能点开一个改不了的表单。 */
.recent-row.readonly {
    cursor: default;
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
.badge {
    flex: none;
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    font-size: 11px;
}
.badge.income {
    color: var(--green);
    border-color: #4a7c5973;
}
.badge.expense {
    color: var(--red);
    border-color: #b33a3a66;
}
/* 物品是库存不是当期收支，用中性色，别和收入/支出混。 */
.badge.item {
    color: var(--muted);
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
@media (max-width: 750px) {
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
