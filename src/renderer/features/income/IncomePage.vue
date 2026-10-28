<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DateRangeValue, Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import { POINTS_PER_HOUR } from '../../domain/online.js';
import {
    QUICK_MONEY_ITEM,
    quickItemById,
    quickItems,
    quickVariable,
} from '../../game-data/quick-items.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import RangeFilter from '../../components/RangeFilter.vue';
import PageHeader from '../../components/PageHeader.vue';
import IncomeEditor from './IncomeEditor.vue';
import IncomeRecords from './IncomeRecords.vue';
import IncomeDeleteDialog from './IncomeDeleteDialog.vue';
import ItemPriceDialog from './ItemPriceDialog.vue';
import PriceBulkDialog from './PriceBulkDialog.vue';
import OnlineDialog from './OnlineDialog.vue';
import QuickSettings from './QuickSettings.vue';

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
 */
type CatalogItem = { id: number; name: string; img: string; icon: string };
/** 刚结束的一段计时，用来在提示里报时长与点卡。 */
type StoppedSession = {
    characterId: string;
    startAt: number;
    endAt: number;
    minutes: number;
    cost: number;
};

const app = useApplication();
const rules = app.rules();
const character = ref('all');
/** 默认看今天：收益是当天打完一局就记的，默认「本月」会把还没发生的月末也算进区间。 */
const range = ref<DateRangeValue>({ preset: 'today', ...U.rangeFor('today') });
const editing = ref<Transaction | null>(null);
const recordsOpen = ref(false);
const priceTarget = ref<{ item: CatalogItem; thenAdd: boolean; once: boolean } | null>(null);
const onlineMode = ref<'start' | 'backfill' | 'adjust' | null>(null);
/** 调整开始时间时，改的是哪一段计时。 */
const adjustingId = ref('');
const settingsOpen = ref(false);
/** 批量设价弹窗：四十个固定价物品逐个右键太费事，给它一条 CSV 通道。 */
const bulkOpen = ref(false);
const removing = ref<Transaction | null>(null);
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
/** 正在计时的会话；秒表与统计分别按自己的节拍刷新。 */
const actives = computed(() => {
    void app.data;
    return rules.runningSessions();
});
/** 秒表用的时钟：只让「00:12:34」走字，不触发任何统计计算。 */
const now = ref(Date.now());
/** 统计节拍：`earningsStats` 要遍历全部流水与会话，每秒跑一遍纯属浪费，十秒一次足够。 */
const statTick = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
let statClock: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    clock = setInterval(() => {
        if (actives.value.length) now.value = Date.now();
    }, 1000);
    statClock = setInterval(() => {
        if (actives.value.length) statTick.value = Date.now();
    }, 10000);
});
onBeforeUnmount(() => {
    if (clock) clearInterval(clock);
    if (statClock) clearInterval(statClock);
});
watch(actives, () => {
    // 开始/结束计时的瞬间要立刻对一次，不能等下一个十秒。
    now.value = Date.now();
    statTick.value = Date.now();
});
const pad2 = (value: number) => String(value).padStart(2, '0');
function elapsedOf(startAt?: number) {
    const start = Number(startAt) || 0;
    if (!start) return '00:00:00';
    const diff = Math.max(0, now.value - start);
    return (
        pad2(Math.floor(diff / 3600000)) +
        ':' +
        pad2(Math.floor(diff / 60000) % 60) +
        ':' +
        pad2(Math.floor(diff / 1000) % 60)
    );
}
/**
 * 顶部那条「谁在线、各自多久」。
 *
 * 错峰计时下每个号一段，所以这里是一个列表而不是一个秒表：先起一个号、中途再加
 * 两个号、最后分两次退出，全都在这条上直接操作。
 */
const liveList = computed(() =>
    actives.value.map((session) => ({
        id: String(session.id),
        characterId: String(session.characterId || ''),
        name: rules.charName(String(session.characterId || '')),
        elapsed: elapsedOf(Number(session.startAt)),
    })),
);
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
 * 面板底部的两个合计。
 *
 * 金币与物品估值单位都是「万」，但量纲不同（一个是到手的币，一个是按标价折算的货值），
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
    if (!start && !end) return '全部时间';
    return end ? start + ' 至 ' + end : start + ' 起';
});
const quick = computed(() => {
    void app.data;
    return rules.state.quickSettings || { accounts: 5, cardPrice: 15000 };
});
/**
 * 速记记给谁：正在计时的号优先，没开计时才退回当前筛选（再退回第一个角色）。
 *
 * 之前恒定取「角色列表第一个」，于是上了第二个号做师门、收益仍记在第一个号头上，
 * 第二个号只剩一条点卡支出。归属现在由领域 `onlineRoster` 给，页面不再自己猜；
 * 多开时这几个号各记一份均分金额（物品整条归主角色）。
 */
const quickRoster = computed(() => {
    void app.data;
    const online = rules.onlineRoster();
    if (online.length) return online;
    if (character.value !== 'all') return [character.value];
    return app.characters.length ? [app.characters[0].id] : [];
});
/** 「这笔记给谁」要在界面上看得见，否则归属又变回看不见的隐式行为。 */
const quickRosterText = computed(() => {
    const names = quickRoster.value.map((id) => rules.charName(id)).filter(Boolean);
    if (!names.length) return '未选择角色';
    const text = names.join('、');
    return rules.onlineRoster().length ? text : text + '（未计时）';
});
/** 收益记录行的副标题：归属角色 + 计价方式，多开时一眼分出是哪个号的那份。 */
function lootMeta(tx: Transaction) {
    const detail =
        tx.recordType === 'item'
            ? U.fmtMoney(rules.itemUnitPrice(tx)) + ' × ' + (tx.quantity ?? 0)
            : '金额记录';
    return rules.charName(tx.characterId) + ' · ' + detail;
}
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
    return { count: txs.length, net: Math.round(net * 100) / 100 };
});

function priceText(id: number) {
    const price = rules.itemPrice(id);
    return price ? U.fmtMoney(price / 10000) : '未设价';
}
function iconOf(id?: number) {
    return quickItemById(Number(id))?.icon || '';
}
/**
 * 物品按当前单价 × 数量；「金币」这类金额记录直接取金额。
 *
 * 不读 `tx.amount`：物品记录的 amount 是记账那一刻的快照，改过物价之后它就和
 * 顶部「物品估值」对不上了。领域 `itemValue` 是唯一口径，这里只转发。
 */
function holding(tx: Transaction) {
    return tx.recordType === 'item' ? rules.itemValue(tx) : Number(tx.amount) || 0;
}
/** 一段计时覆盖的日期，跨夜时拆成多天；上限 8 天纯粹是防坏数据。 */
function dayList(from: number, to: number) {
    const list: string[] = [];
    let cursor = U.fmtDate(new Date(from || Date.now()));
    const end = U.fmtDate(new Date(to || Date.now()));
    while (cursor <= end && list.length < 8) {
        list.push(cursor);
        cursor = U.addDays(cursor, 1);
    }
    return list;
}
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
/** 开始计时：参数取「点卡参数」里的角色数与单价，结算时按每小时 6 点算成本。 */
/**
 * 开始游戏 / 加入角色：先问这次上哪几个号、点卡什么价。
 *
 * 已经有号在计时时也能打开——弹窗只列出还没在线的角色，这正是「中途加两个号」。
 * 以前这里用 `if (active) return` 直接挡掉，于是只能是「一批同起同落」。
 */
function startGame() {
    if (app.busy) return;
    remember();
    onlineMode.value = 'start';
}
/** 调整某一段的开始时间：点顶部那个号的时间，或者按钮默认调最早的一段。 */
function openAdjust(id?: string) {
    if (app.busy || !actives.value.length) return;
    remember();
    adjustingId.value = id || String(actives.value[0].id);
    onlineMode.value = 'adjust';
}
/** 结束一个号：只结算这一段，其余角色继续各自计时。 */
async function stopOne(id: string) {
    await stopSessions([id]);
}
/** 全部结束：一次结算所有在跑的段（同一批提交，失败整体回滚）。 */
async function stopAll() {
    await stopSessions(actives.value.map((session) => String(session.id)));
}
/**
 * 结算若干段计时。
 *
 * 不再一段一个请求：`stopSessions` 在领域里一次 commit，退三个号要么都成功、
 * 要么整体回滚，不会出现「退了两个、第三个失败」之后账上只剩一半。
 */
async function stopSessions(ids: string[]) {
    if (!ids.length || app.busy) return;
    try {
        const done = (await app.execute((domain) =>
            domain.stopSessions(ids),
        )) as unknown as StoppedSession[];
        const dates = new Set<string>();
        done.forEach((item) =>
            dayList(Number(item.startAt), Number(item.endAt)).forEach((date) => dates.add(date)),
        );
        await syncAccount(Array.from(dates));
        app.notify(stopText(done));
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
/** 结算提示：单段点名报时长，多段只报合计，不足 1 分钟的段单独说清楚。 */
function stopText(done: StoppedSession[]) {
    if (!done.length) return '这段不足 1 分钟，未产生点卡，计时已取消';
    const minutes = done.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
    const cost = done.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const tail = ' · 点卡 −' + U.fmtMoney(cost) + '，账号收益已更新';
    if (done.length === 1)
        return (
            rules.charName(String(done[0].characterId)) +
            ' 在线 ' +
            U.fmtMinutes(Number(done[0].minutes)) +
            tail
        );
    return done.length + ' 段已结算 · 合计在线 ' + U.fmtMinutes(minutes) + tail;
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

/** 固定价格：有单价就直接记；第一次没单价先设一次，保存后沿用到之后的记录。 */
async function addFixed(item: CatalogItem) {
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
function addVariable(item: CatalogItem) {
    if (app.busy) return;
    remember();
    priceTarget.value = { item, thenAdd: true, once: true };
}
async function recordLoot(item: CatalogItem, price: number) {
    // 领域里单价存的是游戏币原值，记录金额用「万」，保留两位。
    const wan = Math.round(price / 100) / 100;
    const money = item.id === QUICK_MONEY_ITEM;
    const targets = quickRoster.value;
    if (!targets.length) {
        app.notify('请先创建角色', true);
        return;
    }
    try {
        await app.execute((domain) =>
            domain.saveQuickLoot({
                ledger: 'earnings',
                recordType: money ? 'money' : 'item',
                /* 记给谁由领域按在线角色拆：单开一份原金额，多开均分，物品整条归主角色。 */
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
        app.notify(
            '已记录 ' +
                item.name +
                ' · ' +
                U.fmtMoney(wan) +
                (!money && targets.length > 1
                    ? ' · ' + quickRosterText.value + ' 均分'
                    : targets.length > 1
                      ? ' · ' + targets.length + ' 个角色各 ' + U.fmtMoney(wan / targets.length)
                      : ''),
        );
        await syncAccount([U.today()]);
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
function openPrice(item: CatalogItem) {
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
async function saved() {
    const tx = editing.value;
    editing.value = null;
    await syncAccount([tx?.date || U.today()]);
    await nextTick();
    restore();
}
/** 「全部记录」里删掉了什么，就同步那几天——那边能删到往日的记录。 */
async function recordsChanged(dates: string[]) {
    await syncAccount(dates);
}
/** 补记在线时长、回拨开始时间之后，涉及的那几天都要重新同步。 */
async function onlineSaved(dates: string[]) {
    const wasStart = onlineMode.value === 'start';
    onlineMode.value = null;
    if (wasStart) now.value = Date.now();
    await syncAccount(dates || []);
    await nextTick();
    restore();
}
</script>
<template>
    <PageHeader title="收益" description="物品速记 · 在线时长与点卡 · 物品卖出后才计入收入">
        <template #actions>
            <ul v-if="liveList.length" class="live-list">
                <li v-for="item in liveList" :key="item.id" class="live">
                    <span class="dot" aria-hidden="true"></span>
                    <button
                        type="button"
                        class="live-name"
                        :disabled="app.busy"
                        title="调整这个号的开始时间"
                        @click="openAdjust(item.id)"
                    >
                        {{ item.name }}
                    </button>
                    <span class="live-time">{{ item.elapsed }}</span>
                    <button
                        type="button"
                        class="live-stop"
                        :disabled="app.busy"
                        :aria-label="'结束 ' + item.name + ' 的计时'"
                        :title="'结束 ' + item.name + '，其余角色继续计时'"
                        @click="stopOne(item.id)"
                    >
                        ✕
                    </button>
                </li>
            </ul>
            <button class="btn" :disabled="app.busy" @click="onlineMode = 'backfill'">
                补在线时长
            </button>
            <button v-if="liveList.length" class="btn" :disabled="app.busy" @click="openAdjust()">
                调整开始时间
            </button>
            <button class="btn primary" :disabled="app.busy" @click="startGame">
                {{ liveList.length ? '＋ 加入角色' : '▶ 开始游戏' }}
            </button>
            <button v-if="liveList.length" class="btn danger" :disabled="app.busy" @click="stopAll">
                ■ 全部结束
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
                <button class="chip" :disabled="app.busy" @click="settingsOpen = true">
                    <AppIcon name="coin" :size="13" />
                    点卡 {{ quick.accounts }} 角色 · {{ U.fmtMoney(quick.cardPrice / 10000) }}/点
                </button>
            </div>
            <div class="stat-grid">
                <article v-for="item in statCards" :key="item.key" class="card stat">
                    <span class="stat-label">{{ item.label }}</span>
                    <b class="stat-value" :class="item.tone">{{ item.value }}</b>
                    <small class="stat-note">{{ item.note }}</small>
                </article>
            </div>
            <p
                v-if="accountSettled.count"
                class="sync-note"
                title="金额 = 速记金币 + 物品估值 − 点卡；同一天同角色只留一条，随时覆盖"
            >
                账号「游戏收益」随记录自动更新 · 本范围
                <b>{{ accountSettled.count }}</b>
                条 · 净
                <b :class="accountSettled.net >= 0 ? 'money-in' : 'money-out'">
                    {{ U.fmtMoney(accountSettled.net) }}
                </b>
            </p>
            <div class="quick-main">
                <section class="card">
                    <header class="card-title">
                        物品速记
                        <small class="loot-target">
                            记给
                            <b>{{ quickRosterText }}</b>
                        </small>
                    </header>
                    <p class="section-label">
                        固定价格 · 点一下记一条，右键改价
                        <button class="link-btn" :disabled="app.busy" @click="bulkOpen = true">
                            批量设价…
                        </button>
                    </p>
                    <div class="item-grid">
                        <button
                            v-for="item in quickItems"
                            :key="item.id"
                            type="button"
                            class="item-card"
                            :data-item="item.id"
                            :disabled="app.busy"
                            :title="item.name + ' · ' + priceText(item.id)"
                            @click="addFixed(item)"
                            @contextmenu.prevent="openPrice(item)"
                        >
                            <img :src="item.icon" :alt="item.name" loading="lazy" />
                            <span class="item-name">{{ item.name }}</span>
                            <span class="item-price" :class="{ none: !rules.itemPrice(item.id) }">
                                {{ priceText(item.id) }}
                            </span>
                        </button>
                    </div>
                    <p class="section-label">不固定价格</p>
                    <div class="item-grid">
                        <button
                            v-for="item in quickVariable"
                            :key="item.id"
                            type="button"
                            class="item-card"
                            :data-item="item.id"
                            :disabled="app.busy"
                            :title="item.name + ' · 每次填单价'"
                            @click="addVariable(item)"
                        >
                            <img :src="item.icon" :alt="item.name" loading="lazy" />
                            <span class="item-name">{{ item.name }}</span>
                        </button>
                    </div>
                </section>
                <section class="card loot-card">
                    <header class="card-title">
                        收益记录
                        <small>{{ rangeText }}</small>
                    </header>
                    <ul v-if="loot.length" class="loot-list">
                        <li v-for="tx in lootShown" :key="tx.id">
                            <div class="loot-row">
                                <span class="loot-icon">
                                    <img
                                        v-if="iconOf(tx.itemId)"
                                        :src="iconOf(tx.itemId)"
                                        alt=""
                                        loading="lazy"
                                    />
                                    <AppIcon v-else name="book" :size="16" />
                                </span>
                                <span class="loot-name" :title="tx.note">
                                    {{ tx.itemName || tx.note || '物品' }}
                                    <small>{{ lootMeta(tx) }}</small>
                                </span>
                                <span class="loot-price">{{ U.fmtMoney(holding(tx)) }}</span>
                                <button
                                    type="button"
                                    class="loot-remove"
                                    :disabled="app.busy"
                                    aria-label="移除这条收益记录"
                                    title="移除"
                                    @click="askRemove(tx)"
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="empty-line">
                        这个范围还没有收益记录，点左边的物品图标记一条。
                    </p>
                    <footer class="loot-footer">
                        <span class="loot-sum">
                            <span>
                                共
                                <b>{{ loot.length }}</b>
                                条
                                <span v-if="loot.length > LOOT_LIMIT" class="loot-more">
                                    · 显示最近 {{ LOOT_LIMIT }} 条
                                </span>
                            </span>
                            <span class="loot-totals">
                                金币
                                <b>{{ U.fmtMoney(lootMoney) }}</b>
                                · 物品
                                <b>{{ U.fmtMoney(lootItem) }}</b>
                            </span>
                        </span>
                        <button
                            class="btn compact"
                            :disabled="app.busy"
                            @click="recordsOpen = true"
                        >
                            查看全部
                        </button>
                    </footer>
                </section>
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
    <PriceBulkDialog v-if="bulkOpen" @close="bulkOpen = false" />
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
.live-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}
.live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 5px 3px 8px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: var(--paper-2);
    color: var(--muted);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
}
.live .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--red);
    animation: live-pulse 1.6s ease-in-out infinite;
}
/* 名字就是「改这个号的开始时间」的入口：按时长挨着放，点哪个改哪个。 */
.live-name {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: color 110ms ease;
}
.live-name:hover:not(:disabled) {
    color: var(--gold);
}
.live-time {
    color: var(--muted);
}
.live-stop {
    padding: 0 3px;
    border: 0;
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    transition: color 110ms ease;
}
.live-stop:hover:not(:disabled) {
    color: var(--red);
}
@keyframes live-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.25;
    }
}
.stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
}
.card {
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
}
.stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 13px 15px;
}
.stat-label {
    color: var(--muted);
    font-size: 12px;
}
.stat-value {
    font-size: 18px;
    font-variant-numeric: tabular-nums;
}
.stat-value.in {
    color: var(--green);
}
.stat-value.out {
    color: var(--red);
}
.stat-note {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.4;
}
/* 同步状态：一行小字，回答「钱到哪去了」，不占卡位。 */
.sync-note {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    margin: 0 0 14px;
    color: var(--muted);
    font-size: 12px;
}
.sync-note b {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
}
.sync-note .money-in {
    color: var(--green);
}
.sync-note .money-out {
    color: var(--red);
}
/* 右栏固定 288px：收益记录是速记的辅助视图，不该跟着窗口一起变宽。 */
.quick-main {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 288px;
    gap: 14px;
    align-items: start;
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
/* 「记给谁」是这张卡最容易出错的一处，别让它比操作提示还弱。 */
.loot-target b {
    color: var(--ink);
    font-weight: 600;
}
.section-label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 14px 0 8px;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.4px;
}
/* 「批量设价」是低频操作，做成小字链接挂在分组标题右侧，不占主界面的按钮位置。 */
.link-btn {
    margin-left: auto;
    padding: 0;
    border: 0;
    background: none;
    color: var(--gold);
    font-size: 11px;
    letter-spacing: 0.3px;
    cursor: pointer;
}
.link-btn:hover:not(:disabled) {
    text-decoration: underline;
}
.link-btn:disabled {
    color: var(--muted);
    cursor: default;
}
.item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
    gap: 8px;
}
.item-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 3px 5px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper-2);
    color: var(--ink);
    font-family: inherit;
    cursor: pointer;
    transition:
        border-color 110ms ease,
        background 110ms ease;
}
.item-card:hover:not(:disabled) {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold) 14%, var(--paper));
}
.item-card:disabled {
    opacity: 0.6;
    cursor: default;
}
.item-card img {
    width: 40px;
    height: 40px;
    object-fit: contain;
    image-rendering: pixelated;
}
.item-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    line-height: 1.2;
}
.item-price {
    color: var(--gold);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
}
.item-price.none {
    color: var(--muted);
}
.loot-list {
    padding: 0;
    margin: 10px 0 0;
    list-style: none;
}
.loot-row {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto 22px;
    align-items: center;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px solid var(--line);
}
.loot-list li:last-child .loot-row {
    border-bottom: 0;
}
.loot-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
}
.loot-icon img {
    width: 26px;
    height: 26px;
    object-fit: contain;
    image-rendering: pixelated;
}
.loot-name {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.loot-name small {
    color: var(--muted);
    font-size: 11px;
}
.loot-price {
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.loot-remove {
    padding: 0;
    border: 0;
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: color 110ms ease;
}
.loot-remove:hover:not(:disabled) {
    color: var(--red);
}
.loot-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12.5px;
}
.loot-sum {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    line-height: 1.45;
}
.loot-totals {
    white-space: nowrap;
}
/* 模板空白会被 condense，提示与计数之间靠 margin 分隔而不是靠空格。 */
.loot-more {
    margin-left: 2px;
    color: var(--line-2);
}
.empty-line {
    margin: 14px 0;
    color: var(--muted);
    font-size: 12.5px;
}
@media (max-width: 750px) {
    .filter-character {
        width: 100%;
    }
    .quick-main {
        grid-template-columns: minmax(0, 1fr);
    }
    .item-grid {
        grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    }
}
</style>
