<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DateRangeValue, Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
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
 * 物品记录不计入收支——每件按记下来时的单价算出价值，不区分卖没卖（不记库存），
 * 卖出时才由成交记录产生梦幻币收入。顶部两张卡因此是两条平行的口径：
 * 物品值多少、梦幻币净赚多少。
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
    return rules
        .txIn(character.value, range.value.from, range.value.to)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
});
/** 正在计时的会话；秒表与统计分别按自己的节拍刷新。 */
const active = computed(() => {
    void app.data;
    return rules.state.activeSession;
});
/** 秒表用的时钟：只让「00:12:34」走字，不触发任何统计计算。 */
const now = ref(Date.now());
/** 统计节拍：`earningsStats` 要遍历全部流水与会话，每秒跑一遍纯属浪费，十秒一次足够。 */
const statTick = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
let statClock: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    clock = setInterval(() => {
        if (active.value) now.value = Date.now();
    }, 1000);
    statClock = setInterval(() => {
        if (active.value) statTick.value = Date.now();
    }, 10000);
});
onBeforeUnmount(() => {
    if (clock) clearInterval(clock);
    if (statClock) clearInterval(statClock);
});
watch(active, () => {
    // 开始/结束计时的瞬间要立刻对一次，不能等下一个十秒。
    now.value = Date.now();
    statTick.value = Date.now();
});
const elapsedText = computed(() => {
    const start = Number(active.value?.startAt) || 0;
    if (!start) return '';
    const diff = Math.max(0, now.value - start);
    const pad = (value: number) => String(value).padStart(2, '0');
    return (
        pad(Math.floor(diff / 3600000)) +
        ':' +
        pad(Math.floor(diff / 60000) % 60) +
        ':' +
        pad(Math.floor(diff / 1000) % 60)
    );
});
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
            note: quick.value.accounts + ' 角色 · 每小时 6 点',
            tone: 'out',
        },
        {
            key: 'item',
            label: '物品估值',
            value: U.fmtMoney(s.itemValue),
            note: s.itemQty + ' 件 · 按速记单价计',
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
/** 物品按记录时的数量 × 单价；「金币」这类金额记录直接取金额。 */
function holding(tx: Transaction) {
    return tx.recordType === 'item'
        ? (Number(tx.quantity) || 0) * (Number(tx.unitPrice) || 0)
        : Number(tx.amount) || 0;
}
function currentCharacter() {
    return character.value === 'all' ? app.characters[0]?.id || '' : character.value;
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
 * 开始游戏：先问这次几个号在线、点卡什么价。
 *
 * 以前直接拿设置里的角色数开计时，但补记按实际勾选算——同一天两个入口算出来的
 * 点卡会对不上，而用户往往这两个入口都用。
 */
function startGame() {
    if (app.busy || active.value) return;
    remember();
    onlineMode.value = 'start';
}
/** 结束计时：落会话与点卡流水，顺手把涉及的那几天同步进账号账本。 */
async function stopGame() {
    const session = active.value;
    if (!session || app.busy) return;
    try {
        const done = (await app.execute((domain) =>
            domain.saveSession(
                { ...session, mode: 'range', endAt: Date.now(), source: 'timer' },
                String(session.id),
            ),
        )) as unknown as StoppedSession;
        await syncAccount(dayList(Number(done.startAt), Number(done.endAt)));
        app.notify(
            '本段在线 ' +
                U.fmtMinutes(Number(done.minutes)) +
                '，点卡 −' +
                U.fmtMoney(Number(done.cost)) +
                '，账号收益已更新',
        );
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
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
    try {
        await app.execute((domain) =>
            domain.saveTransaction({
                ledger: 'earnings',
                recordType: money ? 'money' : 'item',
                characterId: currentCharacter(),
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
        app.notify('已记录 ' + item.name + ' · ' + U.fmtMoney(wan));
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
            <span v-if="active" class="live" aria-live="polite">
                <span class="dot" aria-hidden="true"></span>
                {{ elapsedText }} · {{ rules.charName(String(active.characterId ?? '')) }}
            </span>
            <button class="btn" :disabled="app.busy" @click="onlineMode = 'backfill'">
                补在线时长
            </button>
            <button v-if="active" class="btn" :disabled="app.busy" @click="onlineMode = 'adjust'">
                调整开始时间
            </button>
            <button v-if="!active" class="btn primary" :disabled="app.busy" @click="startGame">
                ▶ 开始游戏
            </button>
            <button v-else class="btn danger" :disabled="app.busy" @click="stopGame">
                ■ 结束游戏
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
                        <small>点一下记一条 · 固定价格可右键改价</small>
                    </header>
                    <p class="section-label">固定价格</p>
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
                                    <small v-if="tx.recordType === 'item'">
                                        {{ U.fmtMoney(Number(tx.unitPrice) || 0) }} ×
                                        {{ tx.quantity ?? 0 }}
                                    </small>
                                    <small v-else>金额记录</small>
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
.live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding-right: 4px;
    color: var(--muted);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
}
.live .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--red);
    animation: live-pulse 1.6s ease-in-out infinite;
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
.section-label {
    margin: 14px 0 8px;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.4px;
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
    background: #eee3cb;
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
