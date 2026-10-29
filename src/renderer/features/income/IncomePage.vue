<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { QuickCatalogItem, QuickTargetOption, Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import { POINTS_PER_HOUR } from '../../domain/online.js';
import { QUICK_MONEY_ITEM } from '../../game-data/quick-items.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import RangeFilter from '../../components/RangeFilter.vue';
import { useDateRange } from '../../components/use-date-range';
import PageHeader from '../../components/PageHeader.vue';
import IncomeLiveBar from './IncomeLiveBar.vue';
import IncomeStatGrid from './IncomeStatGrid.vue';
import IncomeQuickPanel from './IncomeQuickPanel.vue';
import IncomeLootPanel from './IncomeLootPanel.vue';
import IncomeEditor from './IncomeEditor.vue';
import IncomeRecords from './IncomeRecords.vue';
import IncomeDeleteDialog from './IncomeDeleteDialog.vue';
import ItemPriceDialog from './ItemPriceDialog.vue';
import OnlineDialog from './OnlineDialog.vue';
import QuickSettings from './QuickSettings.vue';
import { useLiveSessions } from './use-live-sessions';

/**
 * 收益账本。
 *
 * 与账号页是同一张 transactions 表的另一半（`ledger: 'earnings'`）：那边记人民币与
 * 梦幻币的进出，这边记游戏内的日常收益、点卡成本与在线时长。
 *
 * 主体是**物品速记**：点一下物品图标就记一条当天收益，汇总一律来自领域
 * `earningsStats`，页面不重算。物品分两组：
 *
 * - 固定价格：常见掉落有稳定参考价，记一条就按它入库，右键可改价。
 * - 不固定价格：价格随等级、品类浮动（书、铁、兽决…），每次点击现填一次单价，
 *   只用于那一条记录，不写回单价表。
 *
 * 物品记录不计入收支——每件按**当前参考单价**算出价值，不区分卖没卖（不记库存），
 * 卖出时才由成交记录产生梦幻币收入。改价之后历史记录的估值跟着变，这是有意的：
 * 物品那张卡回答的是「这些货按今天的行情值多少」，不是「当时按什么价记的」。
 * 顶部几张卡因此是平行的口径：物品值多少、梦幻币净赚多少，互不相加。
 *
 * **账号那条「游戏收益」是实时同步的**：速记、删记录、补/删在线时长之后，当天每角色的
 * 「速记金币 + 物品估值 − 点卡」会立刻改写账号账本里那条记录（同一天只留一条）。
 * 所以不需要等结束游戏再结算，账号里的余额随时是准的。
 *
 * 这一层只做接线：谁在计时、记给谁、点完之后同步哪几天。四块界面各自成文件
 * （`IncomeLiveBar` / `IncomeStatGrid` / `IncomeQuickPanel` / `IncomeLootPanel`），
 * 计时那套时钟状态在 `use-live-sessions.ts`。之所以把「同步哪几天」留在这里，是因为
 * 速记、删记录、补在线时长三条路径都要落到同一句 `syncAccount`。
 */
const app = useApplication();
const rules = app.rules();
const character = ref('all');
/** 默认看今天：收益是当天打完一局就记的，默认「本月」会把还没发生的月末也算进区间。 */
const range = useDateRange('today');
const editing = ref<Transaction | null>(null);
const recordsOpen = ref(false);
const priceTarget = ref<{ item: QuickCatalogItem; thenAdd: boolean; once: boolean } | null>(null);
const settingsOpen = ref(false);
const removing = ref<Transaction | null>(null);
/** 打开弹窗的那个按钮：保存后把焦点还回去。 */
const opener = ref<HTMLElement | null>(null);

const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((item) => ({ value: item.id, label: item.name })),
]);
const records = computed<Transaction[]>(() => {
    void app.data;
    return rules.txIn(character.value, range.value.from, range.value.to).slice().sort(U.byDateDesc);
});
const {
    statTick,
    liveList,
    onlineMode,
    adjustingId,
    startGame,
    openAdjust,
    stopOne,
    stopAll,
    onlineSaved,
} = useLiveSessions({ app, rules, syncAccount, remember, restore });

const stats = computed(() => {
    void app.data;
    // 计时中时长与点卡都在累加，十秒重算一次就够；每秒跑一遍纯属浪费。
    void statTick.value;
    return rules.earningsStats(character.value, range.value.from, range.value.to, true);
});
/** 收益记录只看速记产生的收入；点卡流水走「全部记录」，不混进来。 */
const loot = computed(() =>
    records.value.filter((tx) => tx.source === 'quick' && tx.kind === 'income'),
);
/** 面板只放最近 12 条：一天记几十条时，右侧窄栏不该被撑成一整屏。 */
const LOOT_LIMIT = 12;
const lootShown = computed(() => loot.value.slice(0, LOOT_LIMIT));
/**
 * 面板底部的两个合计，金币与物品分开报。
 *
 * 两者单位都是「万」，但量纲不同（一个是到手的币，一个是按标价折算的货值），
 * 加在一起得出的数没有任何含义——之前那个「合计」就是两个数硬加，看着像净收益其实不是。
 */
const lootMoney = computed(() =>
    loot.value
        .filter((tx) => tx.recordType !== 'item')
        .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
);
const lootItem = computed(() =>
    loot.value
        .filter((tx) => tx.recordType === 'item')
        .reduce((sum, tx) => sum + rules.itemValue(tx), 0),
);
const rangeText = computed(() => {
    const { from: start, to: end } = range.value;
    // 只设了结束日期时也要说清楚：`RangeFilter` 允许清空开始日期，留空意味着「从最早」。
    if (!start && !end) return '全部时间';
    if (!start) return '截至 ' + end;
    if (!end) return start + ' 起';
    return start + ' 至 ' + end;
});
const quick = computed(() => {
    void app.data;
    return rules.state.quickSettings || { cardPrice: 15000 };
});
/**
 * 这笔记给谁。
 *
 * 以前是一套隐式规则（计时中 → 当前筛选 → 第一个角色），界面只写一行「记给 归岚（未计时）」：
 * 用户既看不出这个归属是怎么来的，也没法改。开两个号做师门、收益仍记在第一个号头上的
 * 错位，就是这么来的。
 *
 * 现在归属是一排常驻按钮，一次点击就换，不藏在弹层里：
 *
 * - `auto`（默认）：跟着计时走，记给正在计时的号；没在计时就记给全部。
 * - `all`：全部角色，金币均分、物品只记一条（数量拆不开，归第一位）。
 * - 角色 id：这笔记给它一个人。
 *
 * 角色多到一行放不下时换行，仍然不用展开任何东西。整排挂在「物品速记」标题行右端，
 * 不再单独占一行；挤不下就整体掉到第二行，照样靠右。
 */
const target = ref<'auto' | 'all' | string>('auto');
/** 正在计时的号：既是 auto 的依据，也是角色按钮上的「计时中」标记。 */
const onlineIds = computed(() => {
    void app.data;
    return rules.onlineRoster();
});
/** 落到具体角色 id 上。选了又被删掉的号退回全部，不报「请先创建角色」这种莫名其妙的错。 */
const quickRoster = computed(() => {
    void app.data;
    const allIds = app.characters.map((item) => item.id);
    if (target.value === 'all') return allIds;
    if (target.value !== 'auto') return allIds.includes(target.value) ? [target.value] : allIds;
    return onlineIds.value.length ? onlineIds.value : allIds;
});
/** 一排按钮：跟计时、全部，然后是逐个角色（在计时的加一颗绿点）。 */
const targetOptions = computed<QuickTargetOption[]>(() => [
    {
        value: 'auto',
        label: '跟计时',
        title: onlineIds.value.length
            ? '跟随计时：记给正在计时的 ' + onlineIds.value.length + ' 个角色'
            : '跟随计时：现在没在计时，记给全部角色',
        live: false,
        sep: false,
    },
    {
        value: 'all',
        label: '全部',
        title: '金币在全部角色间均分；物品只记一条，归第一位',
        live: false,
        sep: false,
    },
    ...app.characters.map((item, index) => ({
        value: item.id,
        label: item.name,
        title:
            [item.level ? item.level + ' 级' : '', item.school].filter(Boolean).join(' · ') +
            (onlineIds.value.includes(item.id) ? ' · 计时中' : ''),
        live: onlineIds.value.includes(item.id),
        // 前两颗是「归属规则」，后面才是具体角色，用一个间距把两类分开。
        sep: index === 0,
    })),
]);
/** 四张统计卡：时长与点卡在前，物品与梦幻币在后，口径都来自 `earningsStats`。 */
const statCards = computed(() => {
    const s = stats.value;
    return [
        {
            key: 'online',
            label: '在线时长',
            value: U.fmtMinutes(s.onlineMinutes),
            note: '所选范围 · 含正在计时',
            tone: '',
        },
        {
            key: 'card',
            label: '点卡消耗',
            value: U.fmtMoney(s.cardCost),
            note: '每号每小时 ' + POINTS_PER_HOUR + ' 点 · 按实际在线号计',
            tone: 'out',
        },
        {
            key: 'item',
            label: '物品估值',
            value: U.fmtMoney(s.itemValue),
            note: s.itemQty + ' 件 · 按当前物价计',
            tone: '',
        },
        {
            key: 'net',
            label: '梦幻币净收益',
            value: U.fmtMoney(s.net),
            note: '收入 ' + U.fmtMoney(s.income) + ' − 支出 ' + U.fmtMoney(s.expense),
            tone: s.net >= 0 ? 'in' : 'out',
        },
    ];
});
/** 账号账本里本范围的「游戏收益」：同步后就在这儿，看得见比说一句「已同步」有用。 */
const accountSettled = computed(() => {
    void app.data;
    const { from, to } = range.value;
    const txs = rules.state.transactions.filter(
        (tx) =>
            tx.ledger === 'account' &&
            tx.category === '游戏收益' &&
            (character.value === 'all' || tx.characterId === character.value) &&
            (!from || tx.date >= from) &&
            (!to || tx.date <= to),
    );
    const net = txs.reduce(
        (sum, tx) =>
            sum + (tx.kind === 'income' ? Number(tx.amount) || 0 : -(Number(tx.amount) || 0)),
        0,
    );
    return { count: txs.length, net: U.round2(net) };
});

/**
 * 把这几天的日常产出同步成账号里的「游戏收益」。
 *
 * 同步失败不当作记账失败：速记本身已经落盘，硬要抛出只会让用户以为没记上，
 * 所以单独提示一句，账本照旧。真正要重试时按下一次速记就会再同步一遍。
 */
async function syncAccount(dates: string[]) {
    const list = [...new Set(dates.filter(Boolean))];
    if (!list.length) return;
    try {
        await app.execute((domain) => domain.syncAccountEarnings(list));
    } catch (failure) {
        app.notify(
            '收益已记录，但同步到账号失败：' +
                (failure instanceof Error ? failure.message : String(failure)),
            true,
        );
    }
}
function remember() {
    const focused = document.activeElement;
    opener.value = focused instanceof HTMLElement && focused !== document.body ? focused : null;
}
function restore() {
    // 「记一笔」删掉后页面没有那个固定入口了，回落到速记网格的第一张卡片：
    // 关掉单价弹窗、移除一条收益之后，焦点本来就该还在这块区域。
    const target = opener.value?.isConnected
        ? opener.value
        : document.querySelector<HTMLElement>('.item-grid .item-card');
    target?.focus({ preventScroll: true });
    opener.value = null;
}
/** 「补在线时长」只是打开弹窗，不涉及结算，所以不碰计时状态。 */
function openBackfill() {
    if (app.busy) return;
    onlineMode.value = 'backfill';
}

/** 固定价格：有单价就直接记；第一次没单价先设一次，保存后沿用到之后的记录。 */
async function addFixed(item: QuickCatalogItem) {
    if (app.busy) return;
    const price = rules.itemPrice(item.id);
    if (!price) {
        remember();
        priceTarget.value = { item, thenAdd: true, once: false };
        return;
    }
    await recordLoot(item, price);
}
/** 不固定价格：价格每条都不一样，所以每条都现填，且不写回单价表。 */
function addVariable(item: QuickCatalogItem) {
    if (app.busy) return;
    remember();
    priceTarget.value = { item, thenAdd: true, once: true };
}
async function recordLoot(item: QuickCatalogItem, price: number) {
    // 领域里单价存的是游戏币原值，记录金额用「万」，保留两位。
    const wan = Math.round(price / 100) / 100;
    const money = item.id === QUICK_MONEY_ITEM;
    const targets = quickRoster.value;
    if (!targets.length) {
        app.notify('请先创建角色', true);
        return;
    }
    try {
        const saved = await app.execute((domain) =>
            domain.saveQuickLoot({
                ledger: 'earnings',
                recordType: money ? 'money' : 'item',
                /* 记给谁由领域按目标角色拆：金币均分，物品整条归第一位。 */
                characterIds: targets,
                date: U.today(),
                kind: 'income',
                currency: 'cash',
                amount: wan,
                category: '物品掉落',
                channel: '游戏内',
                minutes: 0,
                note: item.name,
                source: 'quick',
                itemId: item.id,
                // 金币直接记金额；其余按单价记一件物品。
                ...(money
                    ? {}
                    : { itemName: item.name, quantity: 1, unitPrice: wan, status: 'held' }),
            }),
        );
        /*
         * 提示按「实际写了几条」说，不按「选了几个号」说。
         * 以前物品选了多号也报「A、B 均分」，实际只写了一条归第一位——提示和数据对不上，
         * 是最难察觉的那种错。金币那条金额取自写入结果，比自己算除法准（尾差在第一条）。
         */
        const first = saved[0];
        const extra =
            saved.length > 1
                ? ' · ' + saved.length + ' 个号各 ' + U.fmtMoney(Number(first && first.amount) || 0)
                : first && targets.length > 1
                  ? ' · 物品只记一条，归 ' + rules.charName(String(first.characterId || ''))
                  : '';
        app.notify('已记录 ' + item.name + ' · ' + U.fmtMoney(wan) + extra);
        await syncAccount([U.today()]);
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
function openPrice(item: QuickCatalogItem) {
    remember();
    priceTarget.value = { item, thenAdd: false, once: false };
}
/** 一次性单价不回写单价表，价格必须从弹窗带出来，不能再读 `itemPrice`。 */
async function priceSaved(price?: number) {
    const target = priceTarget.value;
    priceTarget.value = null;
    if (target?.thenAdd) {
        const raw = price ?? rules.itemPrice(target.item.id);
        if (raw > 0) await recordLoot(target.item, raw);
    }
    await nextTick();
    restore();
}
function askRemove(tx: Transaction) {
    remember();
    removing.value = tx;
}
/** 删除弹窗确认之后：关窗、提示，再把涉及的日期重新同步进账号。 */
async function removed(dates: string[]) {
    removing.value = null;
    app.notify('已删除该记录');
    await syncAccount(dates || []);
    await nextTick();
    restore();
}
/** 编辑弹窗里点「删除这条」：关掉编辑器，直接进统一的那套删除确认。 */
function removeFromEditor() {
    const tx = editing.value;
    if (!tx) return;
    editing.value = null;
    // 焦点原本在编辑器按钮上，关掉后已经断开，交给 restore 回落到速记网格。
    opener.value = null;
    removing.value = plain(tx) as Transaction;
}
/** 收益记录弹窗里的编辑入口：只有速记产生的金额记录能改，物品与点卡不在这里动。 */
function editFromList(tx: Transaction) {
    recordsOpen.value = false;
    opener.value = null;
    editing.value = plain(tx) as Transaction;
}
async function saved(dates?: string[]) {
    const tx = editing.value;
    editing.value = null;
    // 编辑器把「改前 / 改后」的日期一起抛过来：改日期时两天都要重算，只传旧日期会
    // 让新那天的「游戏收益」一直停在旧值。
    await syncAccount(dates && dates.length ? dates : [tx?.date || U.today()]);
    await nextTick();
    restore();
}
/** 「全部记录」里删掉了什么，就同步那几天——那边能删到往日的记录。 */
async function recordsChanged(dates: string[]) {
    await syncAccount(dates);
}
</script>

<template>
    <PageHeader title="收益" description="物品速记 · 在线计时 · 按天分账">
        <template #actions>
            <IncomeLiveBar
                :sessions="liveList"
                :busy="app.busy"
                @start="startGame"
                @backfill="openBackfill"
                @adjust="openAdjust"
                @stop-one="stopOne"
                @stop-all="stopAll"
            />
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
                <button class="chip" :disabled="app.busy" @click="settingsOpen = true">
                    <AppIcon name="coin" :size="13" />
                    点卡 {{ U.fmtMoney(quick.cardPrice / 10000) }}/点
                </button>
            </div>
            <IncomeStatGrid :cards="statCards" :settled="accountSettled" />
            <div class="quick-main">
                <IncomeQuickPanel
                    :target="target"
                    :options="targetOptions"
                    @update:target="target = $event"
                    @fixed="addFixed"
                    @variable="addVariable"
                    @price="openPrice"
                />
                <IncomeLootPanel
                    :list="loot"
                    :shown="lootShown"
                    :money="lootMoney"
                    :item="lootItem"
                    :limit="LOOT_LIMIT"
                    :range-text="rangeText"
                    @remove="askRemove"
                    @open-all="recordsOpen = true"
                />
            </div>
        </template>
    </div>
    <IncomeEditor
        v-if="editing"
        :tx="editing"
        @close="editing = null"
        @saved="saved"
        @remove="removeFromEditor"
    />
    <IncomeDeleteDialog
        v-if="removing"
        :tx="removing"
        @close="removing = null"
        @deleted="removed"
    />
    <IncomeRecords
        v-if="recordsOpen"
        :range="range"
        :character="character"
        @close="recordsOpen = false"
        @edit="editFromList"
        @changed="recordsChanged"
    />
    <ItemPriceDialog
        v-if="priceTarget"
        :id="priceTarget.item.id"
        :name="priceTarget.item.name"
        :then-add="priceTarget.thenAdd"
        :once="priceTarget.once"
        @close="priceTarget = null"
        @saved="priceSaved"
    />
    <OnlineDialog
        v-if="onlineMode"
        :mode="onlineMode"
        :character="character"
        :session-id="adjustingId"
        @close="onlineMode = null"
        @saved="onlineSaved"
    />
    <QuickSettings
        v-if="settingsOpen"
        @close="settingsOpen = false"
        @saved="settingsOpen = false"
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
.chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    background: var(--paper);
    color: var(--muted);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 120ms ease;
}
.chip:hover:not(:disabled) {
    border-color: var(--gold);
    color: var(--ink);
}
.chip svg {
    color: var(--gold);
}
/* 右栏固定 288px：收益记录是速记的辅助视图，不该跟着窗口一起变宽。 */
.quick-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 288px;
    gap: 14px;
    align-items: start;
}
@media (max-width: 750px) {
    .filter-character {
        width: 100%;
    }
    .quick-main {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
