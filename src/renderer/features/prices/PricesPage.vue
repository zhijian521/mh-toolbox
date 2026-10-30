<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import type { PriceItem, PriceLog } from '../../app/types';
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
import { priceTone } from './tone';

/**
 * 物价。
 *
 * 一个独立功能：只读写 `state.prices`，不参与角色筛选、不进账本、也不影响速记单价。
 * 卡片顺序、当前价、涨跌口径全部来自领域层，页面只做筛选、排序与弹窗编排——
 * 排序放在页面里，是因为「按价格排」属于看数据的临时视角，不该写进档案。
 *
 * 分类是两级：左侧竖排一级（装备灵饰、召唤兽、兽决内丹……），选中之后右侧顶上出一排
 * 二级 chips。一级常驻可见，是因为它回答的是「我在看哪一块行情」；二级只在选了一级
 * 之后出现，三十多个子类全铺在页面上会把卡片挤到看不见。
 */
const app = useApplication();
const rules = app.rules();
const content = ref<HTMLElement>();
const addButton = ref<HTMLButtonElement>();
const filters = reactive({ group: '', sub: '', keyword: '', sort: 'updated' });
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
/** 一级目录，顺序固定；条数为 0 的也列出来，免得用户以为这一块不能记。 */
const groups = computed(() =>
    rules.priceGroups.map((group) => ({
        name: group.name,
        subs: group.subs,
        count: items.value.filter((item) => item.category === group.name).length,
    })),
);
/**
 * 当前一级下能选的二级：目录里的 + 这张档里出现过的自建子类。
 *
 * 自建的也要列出来，否则用户自己写过的子类只能靠搜索找到，筛选里永远看不见。
 */
const subChips = computed(() => {
    const current = groups.value.find((group) => group.name === filters.group);
    if (!current) return [];
    const used = items.value
        .filter((item) => item.category === filters.group && item.sub)
        .map((item) => item.sub);
    return [...new Set([...current.subs, ...used])];
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
        if (filters.group && item.category !== filters.group) return false;
        if (filters.sub && item.sub !== filters.sub) return false;
        if (!keyword) return true;
        return [item.name, item.category, item.sub, item.unit, item.note]
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
const filtered = computed(
    () =>
        !!filters.keyword.trim() || !!filters.group || !!filters.sub || filters.sort !== 'updated',
);
/** 选中的一级一件都没有：这不是「筛选没命中」，是这一块还没开始记，文案要分开。 */
const groupVoid = computed(
    () => !!filters.group && !groups.value.some((g) => g.name === filters.group && g.count),
);
/** 切一级就清掉二级：上一组的子类名套在新组上，必然什么都不剩。 */
function pickGroup(name: string) {
    filters.group = filters.group === name ? '' : name;
    filters.sub = '';
}
function editItem(item: PriceItem) {
    editing.value = { item: plain(item) as PriceItem };
}
function removeItem(item: PriceItem) {
    deleting.value = item;
    deleteError.value = '';
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
    Object.assign(filters, { group: '', sub: '', keyword: '', sort: 'updated' });
}
/** 保存后把焦点交给卡片上的对应按钮；卡片被筛掉时退回新建按钮，别让焦点掉回 body。 */
async function focusCard(id: string, action = '记价') {
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
    // 回到卡片的编辑按钮：用户可能还要接着调分类或备注。
    await focusCard(id, '编辑物品');
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
/** 物品级的编辑与删除也能从历史弹窗进去，同样先收起它再开下一个弹窗。 */
function editItemFromHistory() {
    const item = history.value;
    if (!item) return;
    history.value = null;
    editItem(item);
}
function removeFromHistory() {
    const item = history.value;
    if (!item) return;
    history.value = null;
    removeItem(item);
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
    <!--
        小标题固定三段，与其它页面同一句式。
        原来这里按条数现算（「共 N 件物品 · M 条价格记录」）：只有这一页的小标题是数字，
        新建或删掉一张卡就跳一次，和其他页并排看不成一排。件数在卡片网格里数得出来，
        「只存本机」这句提示更该留在抬头。
    -->
    <PageHeader title="物价" description="物品行情 · 价格记录 · 仅存本机">
        <template #actions>
            <button ref="addButton" class="btn primary" :disabled="app.busy" @click="editing = {}">
                ＋ 新建卡片
            </button>
        </template>
    </PageHeader>
    <div ref="content" class="page-content">
        <div v-if="!items.length" class="empty">
            <AppIcon name="coin" :size="38" />
            <h2>记下第一个价</h2>
            <p>按物品建一张卡，之后每次看到新行情就记一条，涨跌和走势会自己算出来。</p>
            <button class="btn" :disabled="app.busy" @click="editing = {}">新建物价卡片</button>
        </div>
        <div v-else class="price-layout">
            <nav class="price-nav" aria-label="物品类型">
                <button
                    type="button"
                    class="price-nav-item price-nav-all"
                    :class="{ on: !filters.group }"
                    :aria-pressed="!filters.group"
                    style="--tone: var(--gold)"
                    @click="pickGroup('')"
                >
                    <i class="nav-dot" aria-hidden="true"></i>
                    <span>全部</span>
                    <b>{{ items.length }}</b>
                </button>
                <button
                    v-for="group in groups"
                    :key="group.name"
                    type="button"
                    class="price-nav-item"
                    :class="{ on: filters.group === group.name, void: !group.count }"
                    :aria-pressed="filters.group === group.name"
                    :style="{ '--tone': priceTone(group.name) }"
                    @click="pickGroup(group.name)"
                >
                    <i class="nav-dot" aria-hidden="true"></i>
                    <span>{{ group.name }}</span>
                    <b>{{ group.count }}</b>
                </button>
            </nav>

            <div class="price-main">
                <div class="price-filters">
                    <!--
                        二级 chips 跟随选中一级：选了「任务产出」才出现藏宝图、五宝、归墟这些。
                        「全部」那颗是「这一大块里不分小节」，与左侧的「全部」不是一回事。
                    -->
                    <div
                        v-if="subChips.length"
                        class="sub-chips"
                        role="group"
                        aria-label="按子类筛选"
                    >
                        <button
                            type="button"
                            class="bevel-pill sub-chip"
                            :class="{ on: !filters.sub }"
                            :aria-pressed="!filters.sub"
                            @click="filters.sub = ''"
                        >
                            全部
                        </button>
                        <button
                            v-for="name in subChips"
                            :key="name"
                            type="button"
                            class="bevel-pill sub-chip"
                            :class="{ on: filters.sub === name }"
                            :aria-pressed="filters.sub === name"
                            @click="filters.sub = filters.sub === name ? '' : name"
                        >
                            {{ name }}
                        </button>
                    </div>
                    <div class="filter-row">
                        <label class="filter-field filter-keyword">
                            关键字
                            <input
                                v-model="filters.keyword"
                                type="search"
                                aria-label="搜索物品、类型、子类或备注"
                                placeholder="物品、类型或备注"
                            />
                        </label>
                        <label class="filter-field filter-sort">
                            排序
                            <BaseSelect
                                v-model="filters.sort"
                                label="排序方式"
                                :options="sortOptions"
                            />
                        </label>
                        <button v-if="filtered" class="text-button reset" @click="resetFilters">
                            清除筛选
                        </button>
                    </div>
                </div>

                <div v-if="groupVoid" class="empty">
                    <AppIcon name="coin" :size="34" />
                    <h2>「{{ filters.group }}」还没有记录</h2>
                    <p>这一类里的东西可以直接建卡，建好之后会出现在这里。</p>
                    <button class="btn" :disabled="app.busy" @click="editing = {}">
                        新建物价卡片
                    </button>
                </div>
                <div v-else-if="!entries.length" class="empty">
                    <AppIcon name="coin" :size="34" />
                    <h2>没有符合条件的物品</h2>
                    <p>换个类型、子类或关键字试试。</p>
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
                        @remove="removeItem(item)"
                    />
                </div>
            </div>
        </div>
    </div>

    <PriceItemEditor
        v-if="editing"
        :item="editing.item"
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
        @edit-item="editItemFromHistory"
        @remove-item="removeFromHistory"
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
/*
 * 左侧一级目录 + 右侧卡片。目录固定 148px：中文四字一级名加两位数的条数刚好排得下，
 * 再宽就开始从卡片区里抢列数（卡片一列 210px，抢掉 148 就少一列）。
 */
.price-layout {
    display: grid;
    grid-template-columns: 148px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
}
.price-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-right: 4px;
    border-right: 1px solid var(--line);
}
/*
 * 一级目录用「一颗分类色小点 + 淡同色底」标记选中，而不是一道竖线。
 *
 * 色点的颜色与右边卡片的分类色是同一份取值（`tone.ts`）：左边点在哪、右边就是哪一片
 * 颜色的卡，两处对得上，比在九项之间找一根线快得多。选中不用灌金胶囊——那是顶部二级
 * 的语言，一级也灌金会让「导航」和「筛选」看起来是同一层东西。
 */
.price-nav-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.5;
    text-align: left;
    transition:
        color 120ms ease,
        background-color 120ms ease,
        border-color 120ms ease;
}
.nav-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--tone);
    opacity: 0.42;
    transition:
        opacity 120ms ease,
        box-shadow 120ms ease;
}
.price-nav-item > span {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.price-nav-item:hover:not(:disabled) {
    background: color-mix(in srgb, var(--paper-2) 70%, transparent);
    color: var(--ink);
}
.price-nav-item:hover .nav-dot {
    opacity: 0.75;
}
.price-nav-item.on {
    border-color: color-mix(in srgb, var(--tone) 42%, var(--line));
    background: color-mix(in srgb, var(--tone) 16%, var(--paper));
    color: var(--ink);
    font-weight: 600;
}
/* 选中时色点点亮并带一圈光晕：这一项是「活的」，其余九项是暗的。 */
.price-nav-item.on .nav-dot {
    opacity: 1;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tone) 16%, transparent);
}
/* 一件都没记的分类压暗但仍可点：点进去是「这一类还没有记录」，而不是从菜单里消失。 */
.price-nav-item.void {
    opacity: 0.55;
}
.price-nav-item b {
    flex: none;
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
.price-nav-item.on b {
    color: color-mix(in srgb, var(--tone) 78%, var(--ink));
}
/* 「全部」不是一类，用一道虚线把它和下面九个分类分开，免得被读成第十类。 */
.price-nav-all {
    position: relative;
    margin-bottom: 6px;
}
.price-nav-all::after {
    content: '';
    position: absolute;
    right: 8px;
    bottom: -4px;
    left: 8px;
    height: 0;
    border-bottom: 1px dashed var(--line);
}
.price-main {
    min-width: 0;
}
.price-filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 14px;
}
/*
 * 二级 chips 落在一条纸带上：胶囊的凹槽靠「比承载面暗一档」成立。直接摆在页面底色上时
 * 两者明度太接近（深色主题下几乎一样），槽就看不出来。用 `--paper` 而不是半透明混色——
 * 两套主题下它都比 `--well` 亮，凹永远成立。
 */
.sub-chips {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    align-self: flex-start;
    padding: 5px 7px;
    border: 1px solid color-mix(in srgb, var(--line) 62%, transparent);
    border-radius: 9px;
    background: var(--paper);
}
/*
 * 二级 chips 直接用全局 `.bevel-pill` 的凹槽 / 铜牌材质，与收益页「记给谁」同一套、
 * 同一尺寸——两级筛选的区别靠位置与数量，不靠把二级做小一号（压到 22px 时凹槽就
 * 读不出来了，只剩一圈描边）。
 */
.sub-chip {
    flex: none;
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
    /* 210px 起：1280 宽的工作区能排下 4 列，一屏看到的价格条目翻一倍。 */
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 10px;
    align-items: stretch;
}
.price-main .empty {
    min-height: 260px;
}
@media (max-width: 900px) {
    /* 窄屏没有第二列可用，一级改成横向滚动的一条，别把卡片挤成两列半。 */
    .price-layout {
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
    }
    .price-nav {
        flex-direction: row;
        gap: 4px;
        padding: 0 0 8px;
        border-right: 0;
        border-bottom: 1px solid var(--line);
        overflow-x: auto;
        scrollbar-width: none;
    }
    .price-nav::-webkit-scrollbar {
        height: 0;
    }
    .price-nav-item {
        flex: none;
        padding: 4px 10px;
    }
    /* 横向排时「全部」的分隔线跟着转成竖线，放在它右边。 */
    .price-nav-all {
        margin-right: 6px;
        margin-bottom: 0;
    }
    .price-nav-all::after {
        top: 4px;
        right: -3px;
        bottom: 4px;
        left: auto;
        width: 0;
        height: auto;
        border-right: 1px dashed var(--line);
        border-bottom: 0;
    }
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
