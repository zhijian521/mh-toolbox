<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';

/**
 * 账号的全部记录。
 *
 * 筛选只影响展示与汇总口径（汇总跟着筛选走，和列表里看到的笔数一致），
 * 删除确认做成列表内的确认条而不是再开一层弹窗——两层 BaseModal 都会在
 * document 捕获阶段抢 Escape，叠在一起时外层先响应，确认框反而留在原地。
 */
const emit = defineEmits<{ close: []; edit: [tx: Transaction]; add: [] }>();
const app = useApplication();
const rules = app.rules();
const PER_PAGE = 20;
const filters = reactive({ kind: '', currency: '', category: '', from: '', to: '', keyword: '' });
const page = ref(1);
const pendingDelete = ref<Transaction | null>(null);
const deleteError = ref('');

const all = computed<Transaction[]>(() => {
    void app.data;
    return rules
        .accounts()
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
});
const categoryOptions = computed(() => {
    const used = new Set(all.value.map((tx) => tx.category));
    const options = new Set([...rules.accountCats, ...used]);
    return [
        { value: '', label: '全部分类' },
        ...[...options].map((item) => ({ value: item, label: item })),
    ];
});
const kindOptions = [
    { value: '', label: '全部收支' },
    { value: 'income', label: '收入 / 卖出' },
    { value: 'expense', label: '支出 / 买入' },
];
const currencyOptions = [
    { value: '', label: '全部币种' },
    { value: 'rmb', label: '人民币' },
    { value: 'cash', label: '梦幻币' },
];
const list = computed(() => {
    const keyword = filters.keyword.trim().toLocaleLowerCase();
    return all.value.filter((tx) => {
        if (filters.kind && tx.kind !== filters.kind) return false;
        // 选「梦幻币」时把旧储备金记录一起算进来，与 accountStats 的归并口径一致。
        if (filters.currency === 'cash' && !['cash', 'reserve'].includes(tx.currency)) return false;
        if (filters.currency === 'rmb' && tx.currency !== 'rmb') return false;
        if (filters.category && tx.category !== filters.category) return false;
        if (filters.from && tx.date < filters.from) return false;
        if (filters.to && tx.date > filters.to) return false;
        if (!keyword) return true;
        return [tx.note, tx.category, rules.charName(tx.characterId), tx.channel]
            .join(' ')
            .toLocaleLowerCase()
            .includes(keyword);
    });
});
const pages = computed(() => Math.max(1, Math.ceil(list.value.length / PER_PAGE)));
const visible = computed(() =>
    list.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE),
);
const stats = computed(() => ({
    rmb: rules.accountStats(list.value, 'rmb'),
    cash: rules.accountStats(list.value, 'cash'),
}));
const filtered = computed(
    () =>
        !!filters.keyword.trim() ||
        !!filters.kind ||
        !!filters.currency ||
        !!filters.category ||
        !!filters.from ||
        !!filters.to,
);
watch(pages, (value) => {
    if (page.value > value) page.value = value;
});
watch(
    () => [filters.kind, filters.currency, filters.category, filters.from, filters.to],
    () => {
        page.value = 1;
        pendingDelete.value = null;
    },
);
watch(
    () => filters.keyword,
    () => {
        page.value = 1;
        pendingDelete.value = null;
    },
);

function currencyText(currency: string) {
    return currency === 'rmb' ? '人民币' : currency === 'reserve' ? '储备金' : '梦幻币';
}
function netAmount(tx: Transaction) {
    const fee = Number(tx.fee) || 0;
    return tx.kind === 'income' ? tx.amount - fee : tx.amount + fee;
}
function signedAmount(tx: Transaction) {
    return (tx.kind === 'income' ? '+' : '−') + U.fmtAmount(netAmount(tx), tx.currency);
}
function resetFilters() {
    Object.assign(filters, { kind: '', currency: '', category: '', from: '', to: '', keyword: '' });
}
async function remove() {
    const tx = pendingDelete.value;
    if (!tx || app.busy) return;
    deleteError.value = '';
    try {
        // removeTransaction 只改内存（收益页要把它包进 commitOnline 之类的事务），
        // 这里必须自己套一层 commit，否则列表刷新了但磁盘没变。
        await app.execute((domain) => domain.commit(() => domain.removeTransaction(tx.id)));
        pendingDelete.value = null;
        app.notify('记录已删除');
    } catch (failure) {
        deleteError.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal title="账号记录" wide :busy="app.busy" @close="emit('close')">
        <div class="record-filters">
            <label class="filter-field filter-kind">
                收支
                <BaseSelect v-model="filters.kind" label="收支方向筛选" :options="kindOptions" />
            </label>
            <label class="filter-field filter-currency">
                币种
                <BaseSelect
                    v-model="filters.currency"
                    label="币种筛选"
                    :options="currencyOptions"
                />
            </label>
            <label class="filter-field filter-category">
                分类
                <BaseSelect
                    v-model="filters.category"
                    label="分类筛选"
                    :options="categoryOptions"
                />
            </label>
            <label class="filter-field filter-keyword">
                搜索
                <input
                    v-model="filters.keyword"
                    type="search"
                    aria-label="搜索记录内容、分类或角色"
                    placeholder="内容、分类或角色"
                />
            </label>
            <span class="filter-break" aria-hidden="true"></span>
            <label class="filter-field filter-date">
                开始
                <BaseDate v-model="filters.from" label="开始日期" :max="filters.to || U.today()" />
            </label>
            <label class="filter-field filter-date">
                结束
                <BaseDate
                    v-model="filters.to"
                    label="结束日期"
                    :min="filters.from"
                    :max="U.today()"
                />
            </label>
            <button v-if="filtered" class="btn compact" @click="resetFilters">重置</button>
        </div>
        <div class="record-summary">
            <span>
                人民币
                <b class="money-in">{{ U.fmtAmount(stats.rmb.income, 'rmb') }}</b>
                <span class="summary-sep">/</span>
                <b class="money-out">{{ U.fmtAmount(stats.rmb.expense, 'rmb') }}</b>
                <span class="hint">收入 / 支出 · {{ stats.rmb.count }} 笔</span>
            </span>
            <span>
                梦幻币
                <b class="money-in">{{ U.fmtAmount(stats.cash.income, 'cash') }}</b>
                <span class="summary-sep">/</span>
                <b class="money-out">{{ U.fmtAmount(stats.cash.expense, 'cash') }}</b>
                <span class="hint">收入 / 支出 · {{ stats.cash.count }} 笔</span>
            </span>
        </div>
        <section v-if="pendingDelete" class="delete-confirm" role="alert">
            <span>
                删除 {{ pendingDelete.date }} 的
                <b>{{ pendingDelete.note || pendingDelete.category }}</b>
                （{{ signedAmount(pendingDelete) }}）？删除后汇总会重新计算。
            </span>
            <div class="actions">
                <button class="btn compact" :disabled="app.busy" @click="pendingDelete = null">
                    取消
                </button>
                <button class="btn compact danger" :disabled="app.busy" @click="remove">
                    {{ app.busy ? '删除中…' : '确认删除' }}
                </button>
            </div>
        </section>
        <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
        <div v-if="!list.length" class="empty compact-empty">
            <AppIcon name="book" :size="32" />
            <p v-if="filtered">没有符合筛选条件的记录。</p>
            <p v-else>还没有账号记录，点下方的「记一笔」开始。</p>
            <button v-if="filtered" class="btn compact" @click="resetFilters">清除筛选</button>
        </div>
        <template v-else>
            <div class="record-head" aria-hidden="true">
                <span>日期 / 角色</span>
                <span>类型 / 分类</span>
                <span>记录内容</span>
                <span>渠道</span>
                <span class="num">实收 / 实付</span>
                <span class="ops"></span>
            </div>
            <ul class="record-list">
                <li v-for="tx in visible" :key="tx.id" class="record-row">
                    <span class="cell-date">
                        {{ tx.date }}
                        <small>{{ rules.charName(tx.characterId) }}</small>
                    </span>
                    <span class="cell-type">
                        <span class="badge" :class="tx.kind">
                            {{ tx.kind === 'income' ? '收入' : '支出' }}
                        </span>
                        <small>{{ tx.category }}</small>
                    </span>
                    <span class="cell-note" :title="tx.note || tx.category">
                        {{ tx.note || '—' }}
                    </span>
                    <span class="cell-channel">{{ tx.channel }}</span>
                    <span class="cell-amount" :class="tx.kind">
                        {{ signedAmount(tx) }}
                        <small>
                            {{ currencyText(tx.currency) }}
                            <template v-if="tx.fee">
                                · 手续费 {{ U.fmtAmount(tx.fee, tx.currency) }}
                            </template>
                        </small>
                    </span>
                    <span class="cell-ops">
                        <button class="btn compact" :disabled="app.busy" @click="emit('edit', tx)">
                            编辑
                        </button>
                        <button
                            class="btn compact danger"
                            :disabled="app.busy"
                            @click="pendingDelete = tx"
                        >
                            删除
                        </button>
                    </span>
                </li>
            </ul>
        </template>
        <template #footer="{ close }">
            <span class="hint footer-hint">
                共 {{ list.length }} 笔
                <template v-if="pages > 1">· 第 {{ page }} / {{ pages }} 页</template>
            </span>
            <div v-if="pages > 1" class="pager">
                <button class="btn compact" :disabled="page === 1" @click="page--">上一页</button>
                <button class="btn compact" :disabled="page === pages" @click="page++">
                    下一页
                </button>
            </div>
            <button class="btn" @click="emit('add')">＋ 记一笔</button>
            <button class="btn" @click="close">关闭</button>
        </template>
    </BaseModal>
</template>

<style scoped>
.record-filters {
    display: flex;
    align-items: end;
    gap: 10px;
    flex-wrap: wrap;
}
.filter-field {
    flex: none;
    gap: 4px;
    font-size: 12px;
}
.filter-kind {
    width: 118px;
}
.filter-currency {
    width: 110px;
}
.filter-category {
    width: 124px;
}
.filter-date {
    width: 148px;
}
/*
 * 筛选分两行：收支 / 币种 / 分类 / 搜索在第一行，日期与重置在第二行。
 * 六个控件挤一行时搜索会被压到只露出半个占位符；靠 flex-basis: 100% 的空节点
 * 强制换行，比依赖窗口宽度自然折行稳定。
 */
.filter-keyword {
    flex: 1 1 200px;
    min-width: 170px;
}
.filter-break {
    flex-basis: 100%;
    height: 0;
}
.filter-keyword input {
    min-height: 34px;
}
.record-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
    margin: 14px 0 4px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
    font-size: 12.5px;
    color: var(--muted);
}
.record-summary b {
    font-variant-numeric: tabular-nums;
}
.summary-sep {
    margin: 0 3px;
    color: var(--line-2);
}
.delete-confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
    padding: 9px 11px;
    border: 1px solid #b33a3a40;
    border-radius: 4px;
    background: #b33a3a0a;
    font-size: 12.5px;
}
.compact-empty {
    min-height: 160px;
    padding: 26px;
}
.record-head,
.record-row {
    display: grid;
    grid-template-columns:
        88px 132px minmax(120px, 1fr) 78px
        140px auto;
    align-items: center;
    gap: 12px;
}
.record-head {
    margin-top: 10px;
    padding: 0 0 7px;
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-size: 11.5px;
}
.record-head .num {
    text-align: right;
}
.record-list {
    padding: 0;
    margin: 0;
    list-style: none;
}
.record-row {
    padding: 9px 0;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
}
.cell-date {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.cell-date small,
.cell-type small,
.cell-amount small {
    color: var(--muted);
    font-size: 11.5px;
}
.cell-type {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
}
.cell-type small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
.cell-note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cell-channel {
    color: var(--muted);
    font-size: 12.5px;
}
.cell-amount {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.cell-amount.income {
    color: var(--green);
}
.cell-amount.expense {
    color: var(--red);
}
.cell-amount small {
    color: var(--muted);
}
.cell-ops {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
}
.pager {
    display: flex;
    gap: 6px;
}
@media (max-width: 750px) {
    .record-head {
        display: none;
    }
    .record-row {
        grid-template-columns: 1fr auto;
        gap: 5px 12px;
        padding: 11px 0;
    }
    .cell-date,
    .cell-type,
    .cell-note,
    .cell-channel {
        grid-column: 1;
    }
    .cell-amount,
    .cell-ops {
        grid-column: 2;
        justify-self: end;
    }
    .filter-keyword {
        max-width: none;
    }
}
</style>
