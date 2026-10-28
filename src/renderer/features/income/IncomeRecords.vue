<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { DateRangeValue, Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import RangeFilter from '../../components/RangeFilter.vue';

/**
 * 收益的全部记录。
 *
 * 打开时继承页面的时间范围与角色，点「重置」回到全部时间。
 *
 * 物品记录与物品成交记录只读：它们的编辑属于物品模块（分次出售、剩余数量、
 * 库存状态都要一起校验），在这里改一个金额会绕过 `syncItem` 的约束，所以不提供入口。
 */
const props = defineProps<{ range?: DateRangeValue; character?: string }>();
const emit = defineEmits<{ close: []; edit: [tx: Transaction]; add: [] }>();
const app = useApplication();
const rules = app.rules();
const PER_PAGE = 20;
const filters = reactive<{
    kind: string;
    currency: string;
    category: string;
    character: string;
    range: DateRangeValue;
    keyword: string;
}>({
    kind: '',
    currency: '',
    category: '',
    character: props.character && props.character !== 'all' ? props.character : '',
    range: props.range ? { ...props.range } : { preset: 'all', from: '', to: '' },
    keyword: '',
});
const page = ref(1);
const pendingDelete = ref<Transaction | null>(null);
const deleteError = ref('');
const listEl = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();

const all = computed<Transaction[]>(() => {
    void app.data;
    return rules
        .txIn('all', '', '')
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
});
const categoryOptions = computed(() => {
    const used = new Set(all.value.map((tx) => tx.category).filter(Boolean));
    const options = new Set([...rules.incomeCats, ...rules.expenseCats, ...used]);
    return [
        { value: '', label: '全部分类' },
        ...[...options].map((item) => ({ value: item, label: item })),
    ];
});
const characterOptions = computed(() => [
    { value: '', label: '全部角色' },
    ...app.characters.map((item) => ({ value: item.id, label: item.name })),
]);
const kindOptions = [
    { value: '', label: '全部收支' },
    { value: 'income', label: '收入' },
    { value: 'expense', label: '支出' },
];
const currencyOptions = [
    { value: '', label: '全部币种' },
    { value: 'cash', label: '梦幻币' },
    { value: 'reserve', label: '储备金' },
];
const list = computed(() => {
    const keyword = filters.keyword.trim().toLocaleLowerCase();
    return all.value.filter((tx) => {
        if (filters.kind && tx.kind !== filters.kind) return false;
        if (filters.currency && tx.currency !== filters.currency) return false;
        if (filters.category && tx.category !== filters.category) return false;
        if (filters.character && tx.characterId !== filters.character) return false;
        if (filters.range.from && tx.date < filters.range.from) return false;
        if (filters.range.to && tx.date > filters.range.to) return false;
        if (!keyword) return true;
        return [tx.note, tx.category, tx.itemName, rules.charName(tx.characterId)]
            .join(' ')
            .toLocaleLowerCase()
            .includes(keyword);
    });
});
const pages = computed(() => Math.max(1, Math.ceil(list.value.length / PER_PAGE)));
const visible = computed(() =>
    list.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE),
);
const stats = computed(() => rules.stats(list.value));
const filtered = computed(
    () =>
        !!filters.keyword.trim() ||
        !!filters.kind ||
        !!filters.currency ||
        !!filters.category ||
        !!filters.character ||
        !!filters.range.from ||
        !!filters.range.to,
);
watch(pages, (value) => {
    if (page.value > value) page.value = value;
});
watch(
    () => [
        filters.kind,
        filters.currency,
        filters.category,
        filters.character,
        filters.range.from,
        filters.range.to,
        filters.keyword,
    ],
    () => {
        page.value = 1;
        pendingDelete.value = null;
        deleteError.value = '';
    },
);

function isItem(tx: Transaction) {
    return tx.recordType === 'item';
}
/** 物品与成交记录都由物品模块管理，这里只读。 */
function readonly(tx: Transaction) {
    return isItem(tx) || !!tx.itemRecordId;
}
function kindText(tx: Transaction) {
    if (isItem(tx)) return '物品';
    return tx.kind === 'income' ? '收入' : '支出';
}
function signedAmount(tx: Transaction) {
    return (tx.kind === 'income' ? '+' : '−') + U.fmtMoney(tx.amount);
}
function titleOf(tx: Transaction) {
    return isItem(tx) ? tx.itemName || '物品' : tx.category;
}
function stateOf(tx: Transaction) {
    if (isItem(tx)) {
        const state = rules.itemStatuses[tx.status ?? ''] || '持有';
        const remaining = rules.itemRemaining(tx);
        return remaining > 0 ? state + ' · 剩 ' + remaining + '/' + (tx.quantity ?? 0) : state;
    }
    if (tx.itemRecordId) return '成交 ×' + (tx.saleQuantity ?? 0);
    return tx.currency === 'reserve' ? '储备金' : '梦幻币';
}
function resetFilters() {
    Object.assign(filters, {
        kind: '',
        currency: '',
        category: '',
        character: '',
        keyword: '',
        range: { preset: 'all', from: '', to: '' },
    });
}
function cancelDelete() {
    pendingDelete.value = null;
    deleteError.value = '';
}
async function remove() {
    const tx = pendingDelete.value;
    if (!tx || app.busy) return;
    deleteError.value = '';
    try {
        // removeTransaction 只改内存，必须自己套一层 commit 才会落盘。
        await app.execute((domain) => domain.commit(() => domain.removeTransaction(tx.id)));
        pendingDelete.value = null;
        app.notify('记录已删除');
        await nextTick();
        const target =
            listEl.value?.querySelector<HTMLButtonElement>('button') ?? closeButton.value;
        target?.focus({ preventScroll: true });
    } catch (failure) {
        deleteError.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal title="收益记录" wide :busy="app.busy" @close="emit('close')">
        <div class="record-filters">
            <RangeFilter v-model="filters.range" label="记录时间范围" />
            <div class="filter-row">
                <label class="filter-field filter-kind">
                    收支
                    <BaseSelect
                        v-model="filters.kind"
                        label="收支方向筛选"
                        :options="kindOptions"
                    />
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
                <label class="filter-field filter-character">
                    角色
                    <BaseSelect
                        v-model="filters.character"
                        label="记录角色筛选"
                        :options="characterOptions"
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
                <button v-if="filtered" class="btn compact" @click="resetFilters">重置</button>
            </div>
        </div>
        <div class="record-summary">
            <span>
                净收益
                <b :class="stats.net >= 0 ? 'money-in' : 'money-out'">
                    {{ U.fmtMoney(stats.net) }}
                </b>
            </span>
            <span>
                收入
                <b class="money-in">{{ U.fmtMoney(stats.income) }}</b>
                <span class="summary-sep">/</span>
                支出
                <b class="money-out">{{ U.fmtMoney(stats.expense) }}</b>
            </span>
            <span class="hint">共 {{ stats.count }} 笔</span>
            <span v-if="stats.itemCount" class="hint">
                在仓 {{ stats.itemCount }} 件 · 估值 {{ U.fmtMoney(stats.itemEstimate) }}
            </span>
        </div>
        <div v-if="!list.length" class="empty compact-empty">
            <AppIcon name="bolt" :size="32" />
            <p v-if="filtered">没有符合筛选条件的记录。</p>
            <p v-else>还没有收益记录，点下方的「记一笔」开始。</p>
            <button v-if="filtered" class="btn compact" @click="resetFilters">清除筛选</button>
        </div>
        <template v-else>
            <div class="record-head" aria-hidden="true">
                <span>日期 / 角色</span>
                <span>类型 / 分类</span>
                <span>记录内容</span>
                <span>币种 / 状态</span>
                <span class="num">金额</span>
                <span class="ops"></span>
            </div>
            <ul ref="listEl" class="record-list">
                <li v-for="tx in visible" :key="tx.id" class="record-row">
                    <span class="cell-date">
                        {{ tx.date }}
                        <small>{{ rules.charName(tx.characterId) }}</small>
                    </span>
                    <span class="cell-type">
                        <span class="badge" :class="isItem(tx) ? 'item' : tx.kind">
                            {{ kindText(tx) }}
                        </span>
                        <small>{{ titleOf(tx) }}</small>
                    </span>
                    <span class="cell-note" :title="tx.note || titleOf(tx)">
                        {{ tx.note || '—' }}
                    </span>
                    <span class="cell-state">{{ stateOf(tx) }}</span>
                    <span class="cell-amount" :class="tx.kind">
                        {{ isItem(tx) ? U.fmtMoney(tx.amount) : signedAmount(tx) }}
                        <small>
                            {{
                                isItem(tx)
                                    ? '估值'
                                    : tx.currency === 'reserve'
                                      ? '储备金'
                                      : '梦幻币'
                            }}
                        </small>
                    </span>
                    <span class="cell-ops">
                        <template v-if="readonly(tx)">
                            <span class="hint cell-locked">物品内管理</span>
                        </template>
                        <template v-else>
                            <button
                                class="btn compact"
                                :disabled="app.busy"
                                @click="emit('edit', tx)"
                            >
                                编辑
                            </button>
                            <button
                                class="btn compact danger"
                                :disabled="app.busy"
                                @click="pendingDelete = tx"
                            >
                                删除
                            </button>
                        </template>
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
            <button ref="closeButton" class="btn" @click="close">关闭</button>
        </template>
    </BaseModal>
    <BaseModal v-if="pendingDelete" title="删除记录" :busy="app.busy" @close="cancelDelete">
        <p>
            确定删除 {{ pendingDelete.date }} 的「{{
                pendingDelete.note || pendingDelete.category
            }}」吗？
        </p>
        <p>
            金额
            <b>{{ signedAmount(pendingDelete) }}</b>
            ，删除后汇总与笔数会重新计算，且无法恢复。
        </p>
        <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
        <template #footer="{ close }">
            <button class="btn" autofocus :disabled="app.busy" @click="close">取消</button>
            <button class="btn danger" :disabled="app.busy" @click="remove">
                {{ app.busy ? '删除中…' : '确认删除' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.record-filters {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
}
.filter-row {
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
    width: 112px;
}
.filter-currency {
    width: 104px;
}
.filter-category {
    width: 120px;
}
.filter-character {
    width: 116px;
}
.filter-keyword {
    flex: 1 1 170px;
    min-width: 150px;
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
.money-in {
    color: var(--green);
}
.money-out {
    color: var(--red);
}
.summary-sep {
    margin: 0 3px;
    color: var(--line-2);
}
.compact-empty {
    min-height: 160px;
    padding: 26px;
}
.record-head,
.record-row {
    display: grid;
    grid-template-columns:
        88px 132px minmax(110px, 1fr) 96px
        132px auto;
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
/* 物品是库存不是当期收支。 */
.badge.item {
    color: var(--muted);
}
.cell-note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cell-state {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 12px;
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
.cell-locked {
    font-size: 11.5px;
    white-space: nowrap;
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
    .cell-state {
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
