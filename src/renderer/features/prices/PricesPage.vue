<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import type { PriceItem, PriceLog } from '../../app/types';
import { quickCatalog } from '../../game-data/quick-items.js';
import { plain } from '../../services/desktop';
import { useApplication } from '../../stores/application';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import PageHeader from '../../components/PageHeader.vue';
import PriceCard from './PriceCard.vue';
import PriceHistory from './PriceHistory.vue';
import PriceItemEditor from './PriceItemEditor.vue';
import PriceLogEditor from './PriceLogEditor.vue';

/**
 * 物价。
 *
 * 一个独立功能：只读写 `state.prices`，不参与角色筛选、不进账本、也不影响速记单价。
 * 卡片顺序、当前价、涨跌口径全部来自领域层，页面只做筛选、排序与弹窗编排——
 * 排序放在页面里，是因为「按价格排」属于看数据的临时视角，不该写进档案。
 */
const app = useApplication();
const rules = app.rules();
const content = ref<HTMLElement>();
const addButton = ref<HTMLButtonElement>();
const filters = reactive({ category: '', keyword: '', sort: 'updated' });
const editing = ref<{ item?: PriceItem } | null>(null);
const logging = ref<{ item: PriceItem; log?: PriceLog } | null>(null);
const history = ref<PriceItem | null>(null);
const deleting = ref<PriceItem | null>(null);
const deleteError = ref('');

/** 快照变化后重算；领域实例持有唯一可写状态，这里只读。 */
const items = computed<PriceItem[]>(() => {
    void app.data;
    return rules.orderedPrices(rules.state.prices) as PriceItem[];
});
const categoryOptions = computed(() => {
    const used = items.value.map((item) => item.category).filter(Boolean);
    return [
        { value: '', label: `全部类型 ${items.value.length}` },
        ...[...new Set([...rules.priceCategories, ...used])].map((name) => ({
            value: name,
            label: name,
        })),
    ];
});
const sortOptions = [
    { value: 'updated', label: '最近更新' },
    { value: 'price-desc', label: '价格从高到低' },
    { value: 'price-asc', label: '价格从低到高' },
    { value: 'delta', label: '涨幅优先' },
    { value: 'name', label: '按名称' },
];

const entries = computed<PriceItem[]>(() => {
    const keyword = filters.keyword.trim().toLocaleLowerCase();
    const list = items.value.filter((item) => {
        if (filters.category && item.category !== filters.category) return false;
        if (!keyword) return true;
        return [item.name, item.category, item.unit, item.note]
            .join(' ')
            .toLocaleLowerCase()
            .includes(keyword);
    });
    const priceOf = (item: PriceItem) => rules.priceCurrent(item)?.price ?? -1;
    const changeOf = (item: PriceItem) => rules.priceChange(item)?.pct ?? null;
    return list.sort((a, b) => {
        if (filters.sort === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN');
        if (filters.sort === 'price-desc') return priceOf(b) - priceOf(a);
        if (filters.sort === 'price-asc') {
            const left = priceOf(a);
            const right = priceOf(b);
            // 未记录的排最后，而不是当成 0 顶到最前。
            if (left < 0 || right < 0) return Number(right >= 0) - Number(left >= 0);
            return left - right;
        }
        if (filters.sort === 'delta') {
            const left = changeOf(a);
            const right = changeOf(b);
            if (left === null || right === null)
                return Number(right !== null) - Number(left !== null);
            return right - left;
        }
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
});
const logTotal = computed(() =>
    items.value.reduce((sum, item) => sum + (Array.isArray(item.logs) ? item.logs.length : 0), 0),
);
const description = computed(() => {
    if (!items.value.length) return '记录各服务器物品行情 · 只保存在本机';
    return `共 ${items.value.length} 件物品 · ${logTotal.value} 条价格记录`;
});
const filtered = computed(
    () => !!filters.keyword.trim() || !!filters.category || filters.sort !== 'updated',
);
/** 常见物品名称只作为输入建议，不预置任何价格。 */
const suggestions = computed(() => [...new Set(quickCatalog.map((item) => item.name))]);
/** 编辑时传一份去代理的副本：弹窗里改的是草稿，不碰快照。 */
function editItem(item: PriceItem) {
    editing.value = { item: plain(item) as PriceItem };
}
/** 折线用的近 8 次价格，时间正序。 */
function trendOf(item: PriceItem) {
    return rules
        .priceLogsSorted(item)
        .slice(0, 8)
        .reverse()
        .map((log: PriceLog) => log.price);
}
function currentOf(item: PriceItem) {
    return rules.priceCurrent(item);
}
function changeOf(item: PriceItem) {
    return rules.priceChange(item);
}
function resetFilters() {
    Object.assign(filters, { category: '', keyword: '', sort: 'updated' });
}
/** 保存后把焦点交给卡片上的对应按钮；卡片被筛掉时退回新建按钮，别让焦点掉回 body。 */
async function focusCard(id: string, action = '编辑物品') {
    await nextTick();
    const target =
        content.value?.querySelector<HTMLButtonElement>(
            `[data-price-id="${CSS.escape(id)}"] button[aria-label="${action}"]`,
        ) ?? addButton.value;
    target?.focus({ preventScroll: true });
}
async function savedItem(id: string) {
    editing.value = null;
    // 新建的卡片可能落在当前筛选之外，先清掉筛选，否则用户看不到刚建的那张。
    if (filtered.value) resetFilters();
    app.notify('物价卡片已保存');
    await focusCard(id);
}
async function savedLog() {
    const id = logging.value?.item.id;
    logging.value = null;
    app.notify('价格已记下');
    if (id) await focusCard(id, '记价');
}
function editLog(log: PriceLog) {
    const item = history.value;
    if (!item) return;
    // 两层弹窗都监听 Escape 与焦点循环，先收起记录弹窗再开编辑弹窗。
    history.value = null;
    logging.value = { item, log };
}
function addFromHistory() {
    const item = history.value;
    if (!item) return;
    history.value = null;
    logging.value = { item };
}
async function remove() {
    const item = deleting.value;
    if (!item || app.busy) return;
    try {
        await app.execute((domain) => domain.removePriceItem(item.id));
        deleting.value = null;
        app.notify('物价卡片已删除');
        await nextTick();
        addButton.value?.focus();
    } catch (failure) {
        deleteError.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <PageHeader title="物价" :description="description">
        <template #actions>
            <button ref="addButton" class="btn primary" :disabled="app.busy" @click="editing = {}">
                ＋ 新建卡片
            </button>
        </template>
    </PageHeader>
    <div ref="content" class="page-content">
        <div v-if="items.length" class="price-filters">
            <label class="filter-field filter-category">
                类型
                <BaseSelect
                    v-model="filters.category"
                    label="按类型筛选"
                    :options="categoryOptions"
                />
            </label>
            <label class="filter-field filter-keyword">
                关键字
                <input
                    v-model="filters.keyword"
                    type="search"
                    aria-label="搜索物品、分类或备注"
                    placeholder="物品、分类或备注"
                />
            </label>
            <label class="filter-field filter-sort">
                排序
                <BaseSelect v-model="filters.sort" label="排序方式" :options="sortOptions" />
            </label>
            <button v-if="filtered" class="text-button reset" @click="resetFilters">
                清除筛选
            </button>
        </div>

        <div v-if="!items.length" class="empty">
            <AppIcon name="coin" :size="38" />
            <h2>记下第一个价</h2>
            <p>按物品建一张卡，之后每次看到新行情就记一条，涨跌和走势会自己算出来。</p>
            <button class="btn" :disabled="app.busy" @click="editing = {}">新建物价卡片</button>
        </div>
        <div v-else-if="!entries.length" class="empty">
            <AppIcon name="coin" :size="38" />
            <h2>没有符合条件的物品</h2>
            <p>换个类型或关键字试试。</p>
            <button class="btn" @click="resetFilters">清除筛选</button>
        </div>
        <div v-else class="price-grid">
            <PriceCard
                v-for="item in entries"
                :key="item.id"
                :item="item"
                :current="currentOf(item)"
                :change="changeOf(item)"
                :trend="trendOf(item)"
                :busy="app.busy"
                @log="logging = { item }"
                @history="history = item"
                @edit="editItem(item)"
                @remove="
                    deleting = item;
                    deleteError = '';
                "
            />
        </div>
    </div>

    <PriceItemEditor
        v-if="editing"
        :item="editing.item"
        :suggestions="suggestions"
        @close="editing = null"
        @saved="savedItem"
    />
    <PriceLogEditor
        v-if="logging"
        :item="logging.item"
        :log="logging.log"
        @close="logging = null"
        @saved="savedLog"
    />
    <PriceHistory
        v-if="history"
        :item="history"
        @close="history = null"
        @add="addFromHistory"
        @edit="editLog"
    />
    <BaseModal v-if="deleting" title="删除物价卡片" :busy="app.busy" @close="deleting = null">
        <p>确定删除「{{ deleting.name }}」吗？</p>
        <p>这张卡下的 {{ deleting.logs.length }} 条价格记录会一并删除，其他模块的数据不受影响。</p>
        <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn danger" :disabled="app.busy" @click="remove">
                {{ app.busy ? '删除中…' : '确认删除' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.price-filters {
    display: flex;
    align-items: end;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.filter-field {
    flex: none;
    gap: 4px;
    font-size: 12px;
}
.filter-category {
    width: 132px;
}
.filter-sort {
    width: 148px;
}
.filter-keyword {
    flex: 1;
    min-width: 170px;
    max-width: 280px;
}
.filter-keyword input {
    min-height: 34px;
}
.reset {
    align-self: center;
    margin-top: 18px;
    font-size: 12.5px;
    color: var(--muted);
}
.price-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
    gap: 14px;
    align-items: stretch;
}
@media (max-width: 750px) {
    .price-grid {
        grid-template-columns: minmax(0, 1fr);
    }
    .filter-keyword {
        max-width: none;
    }
}
</style>
