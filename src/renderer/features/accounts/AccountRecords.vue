<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { DateRangeValue, Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { desktop } from '../../services/desktop';
import { U } from '../../domain/util.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import RangeFilter from '../../components/RangeFilter.vue';
import { currencyText, signedAmount } from './format';

/**
 * 账号的全部记录。
 *
 * 打开时继承页面的时间范围与角色：页脚写着「共 N 笔」，点进来的第一屏就该是这 N 笔，
 * 想看全量点「重置」。筛选只影响展示与汇总口径（汇总跟着筛选走，和列表里的笔数一致）。
 *
 * 删除走第二层弹窗：`modal-layer` 会让 Escape 与 Tab 只由最上层响应、背景 inert
 * 只由最外层负责，所以确认框可以安全地叠在列表之上，不必退化成内联确认条。
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
    return rules.accounts().slice().sort(U.byDateDesc);
});
const categoryOptions = computed(() => {
    const used = new Set(all.value.map((tx) => tx.category));
    const options = new Set([...rules.accountCats, ...used]);
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
        if (filters.character && tx.characterId !== filters.character) return false;
        if (filters.range.from && tx.date < filters.range.from) return false;
        if (filters.range.to && tx.date > filters.range.to) return false;
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
/** 导出当前筛选结果：导的是眼前这套，不是全部。 */
async function exportCsv() {
    if (!list.value.length) return;
    try {
        const stamp =
            filters.range.from && filters.range.to
                ? filters.range.from + '_' + filters.range.to
                : U.today();
        const saved = await desktop().saveTextFile(rules.recordsCsv(list.value), {
            title: '导出账号记录',
            defaultName: '账号记录-' + stamp + '.csv',
            filterName: 'CSV 表格',
            ext: 'csv',
        });
        if (saved.canceled) return;
        if (!saved.ok) {
            app.notify(saved.error || '导出失败', true);
            return;
        }
        app.notify('已导出 ' + list.value.length + ' 笔到 ' + saved.filePath);
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
/** 手续费不占列宽，挪进悬停提示：金额列已经是扣费后的实收 / 加费后的实付。 */
function feeNote(tx: Transaction) {
    const fee = Number(tx.fee) || 0;
    if (!fee) return '';
    return (
        '含手续费 ' +
        U.fmtAmount(fee, tx.currency) +
        (tx.kind === 'income' ? '，金额为扣费后实收' : '，金额为加费后实付')
    );
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
        // 被删的那行连同它的按钮一起消失，弹窗原来的焦点目标已断开；
        // 落到列表首项，列表因此变空时退回「关闭」。
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
    <BaseModal title="账号记录" wide :busy="app.busy" @close="emit('close')">
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
            <ul ref="listEl" class="record-list">
                <li v-for="tx in visible" :key="tx.id" class="record-row">
                    <span class="cell-date">
                        {{ tx.date }}
                        <small>· {{ rules.charName(tx.characterId) }}</small>
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
                    <span class="cell-amount" :class="tx.kind" :title="feeNote(tx)">
                        {{ signedAmount(tx) }}
                        <small>{{ currencyText(tx.currency) }}</small>
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
            <button class="btn compact" :disabled="!list.length" @click="exportCsv">
                导出 CSV
            </button>
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
            <!-- 危险操作默认焦点落在「取消」，回车不会误删。 -->
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
        110px 118px minmax(90px, 1fr) 64px
        160px auto;
    align-items: center;
    gap: 10px;
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
/* 一行摆完：日期 + 角色、金额 + 币种都在同一行，行高一致，扫读不跳。 */
.cell-date {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.cell-date small,
.cell-type small,
.cell-amount small {
    color: var(--muted);
    font-size: 11.5px;
}
.cell-date small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
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
    border-color: color-mix(in srgb, var(--green) 45%, transparent);
}
.badge.expense {
    color: var(--red);
    border-color: color-mix(in srgb, var(--red) 40%, transparent);
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
    align-items: baseline;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
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
    flex: none;
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
