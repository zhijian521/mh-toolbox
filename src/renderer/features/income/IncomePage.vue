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
    quickUnset,
} from '../../game-data/quick-items.js';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import RangeFilter from '../../components/RangeFilter.vue';
import PageHeader from '../../components/PageHeader.vue';
import IncomeEditor from './IncomeEditor.vue';
import IncomeRecords from './IncomeRecords.vue';
import ItemPriceDialog from './ItemPriceDialog.vue';
import QuickSettings from './QuickSettings.vue';

/**
 * 收益账本。
 *
 * 与账号页是同一张 transactions 表的另一半（`ledger: 'earnings'`）：那边记人民币与
 * 梦幻币的进出，这边记游戏内的日常收益、点卡成本与在线时长。
 *
 * 主体是**物品速记**：点一下物品图标就记一条当天掉落（带参考单价、进库存），
 * 右键改单价。汇总一律来自领域 `earningsStats`，页面不重算。
 *
 * 物品记录不计入收支——持有中的物品只算库存估值，卖出时才由成交记录产生收入，
 * 所以掉落列表里的金额是估值而不是收益。
 */
type CatalogItem = { id: number; name: string; img: string; icon: string };

const app = useApplication();
const rules = app.rules();
const addButton = ref<HTMLButtonElement>();
const character = ref('all');
const range = ref<DateRangeValue>({ preset: 'month', ...U.rangeFor('month') });
const editing = ref<{ tx?: Transaction } | null>(null);
const recordsOpen = ref(false);
const priceTarget = ref<{ item: CatalogItem; thenAdd: boolean } | null>(null);
const settingsOpen = ref(false);
const removing = ref<Transaction | null>(null);
const removeError = ref('');
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
/** 正在计时的会话；每秒刷新一次，让秒表与统计跟着走。 */
const active = computed(() => {
    void app.data;
    return rules.state.activeSession;
});
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
    ticker = setInterval(() => {
        if (active.value) now.value = Date.now();
    }, 1000);
});
onBeforeUnmount(() => {
    if (ticker) clearInterval(ticker);
});
watch(active, () => {
    now.value = Date.now();
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
    // 计时中每秒重算一次，否则「在线时长 / 时薪」会停在开始那一刻。
    void now.value;
    return rules.earningsStats(character.value, range.value.from, range.value.to, true);
});
/** 掉落记录只看速记产生的收入，手工记的收支走「全部记录」。 */
const loot = computed(() =>
    records.value.filter((tx) => tx.source === 'quick' && tx.kind === 'income'),
);
const lootValue = computed(() => loot.value.reduce((sum, tx) => sum + holding(tx), 0));
const rangeText = computed(() => {
    const { from: start, to: end } = range.value;
    if (!start && !end) return '全部时间';
    return end ? start + ' 至 ' + end : start + ' 起';
});
const quick = computed(() => {
    void app.data;
    return rules.state.quickSettings || { accounts: 5, cardPrice: 15000 };
});
/** 五张统计卡：口径全部来自 `earningsStats`，没有一项在这里二次计算。 */
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
            key: 'loot',
            label: '持有物品估值',
            value: U.fmtMoney(s.itemEstimate),
            note: s.itemCount + ' 件在仓 · 卖出后结算收入',
            tone: '',
        },
        {
            key: 'net',
            label: '游戏币净收益',
            value: U.fmtMoney(s.net),
            note: '收入 − 全部日常成本',
            tone: s.net >= 0 ? 'in' : 'out',
        },
        {
            key: 'hourly',
            label: '在线净时薪',
            value: s.hourly === null ? '—' : U.fmtMoney(s.hourly) + ' / 时',
            note: '净收益 ÷ 在线时长',
            tone: s.hourly !== null && s.hourly < 0 ? 'out' : '',
        },
    ];
});

function priceText(id: number) {
    const price = rules.itemPrice(id);
    return price ? U.fmtMoney(price / 10000) : '未设价';
}
function iconOf(id?: number) {
    return quickItemById(Number(id))?.icon || '';
}
/** 物品按剩余数量估值；「金币」这类金额记录直接取金额。 */
function holding(tx: Transaction) {
    return tx.recordType === 'item' ? rules.itemHoldingValue(tx) : Number(tx.amount) || 0;
}
function currentCharacter() {
    return character.value === 'all' ? app.characters[0]?.id || '' : character.value;
}
/** 开始计时：参数取「点卡参数」里的角色数与单价，结算时按每小时 6 点算成本。 */
async function startGame() {
    if (app.busy || active.value) return;
    try {
        await app.execute((domain) => domain.startSession(currentCharacter()));
        now.value = Date.now();
        app.notify('开始记录游戏时间');
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
/** 结束计时：把进行中的会话结算成 sessions 与点卡流水，统计随即回到已结算口径。 */
async function stopGame() {
    const session = active.value;
    if (!session || app.busy) return;
    try {
        const done = (await app.execute((domain) =>
            domain.saveSession(
                { ...session, mode: 'range', endAt: Date.now(), source: 'timer' },
                String(session.id),
            ),
        )) as unknown as { minutes?: number; cost?: number };
        app.notify('本段在线 ' + U.fmtMinutes(done.minutes) + '，点卡 −' + U.fmtMoney(done.cost));
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
function remember() {
    const focused = document.activeElement;
    opener.value = focused instanceof HTMLElement && focused !== document.body ? focused : null;
}
function restore() {
    const target = opener.value?.isConnected ? opener.value : addButton.value;
    target?.focus({ preventScroll: true });
    opener.value = null;
}

/** 有单价就直接记；没单价先弹设置，设完再记（与 V1 一致）。 */ async function addLoot(
    item: CatalogItem,
) {
    if (app.busy) return;
    if (!rules.itemPrice(item.id)) {
        remember();
        priceTarget.value = { item, thenAdd: true };
        return;
    }
    await recordLoot(item);
}
async function recordLoot(item: CatalogItem) {
    const price = rules.itemPrice(item.id);
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
                // 金币直接记金额，其余进库存：一件、按单价估值、持有。
                ...(money
                    ? {}
                    : { itemName: item.name, quantity: 1, unitPrice: wan, status: 'held' }),
            }),
        );
        app.notify('已记录 ' + item.name + ' · ' + U.fmtMoney(wan));
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
function openPrice(item: CatalogItem) {
    remember();
    priceTarget.value = { item, thenAdd: false };
}
async function priceSaved() {
    const target = priceTarget.value;
    priceTarget.value = null;
    if (target?.thenAdd) await recordLoot(target.item);
    await nextTick();
    restore();
}
function askRemove(tx: Transaction) {
    remember();
    removing.value = tx;
}
async function confirmRemove() {
    const tx = removing.value;
    if (!tx || app.busy) return;
    removeError.value = '';
    try {
        // removeTransaction 只改内存，必须自己套一层 commit 才会落盘。
        await app.execute((domain) => domain.commit(() => domain.removeTransaction(tx.id)));
        removing.value = null;
        app.notify('已移除该记录');
        await nextTick();
        restore();
    } catch (failure) {
        removeError.value = failure instanceof Error ? failure.message : String(failure);
    }
}
function openEditor() {
    remember();
    editing.value = {};
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
    restore();
}
</script>
<template>
    <PageHeader title="收益" description="物品速记 · 在线时长与点卡 · 物品卖出后才计入收入">
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
                <button class="chip" :disabled="app.busy" @click="settingsOpen = true">
                    <AppIcon name="coin" :size="13" />
                    点卡 {{ quick.accounts }} 角色 · {{ U.fmtMoney(quick.cardPrice / 10000) }}/点
                </button>
                <span class="spacer"></span>
                <span v-if="active" class="live" aria-live="polite">
                    <span class="dot" aria-hidden="true"></span>
                    {{ elapsedText }} · {{ rules.charName(String(active.characterId ?? '')) }}
                </span>
                <button v-if="!active" class="btn primary" :disabled="app.busy" @click="startGame">
                    ▶ 开始游戏
                </button>
                <button v-else class="btn danger" :disabled="app.busy" @click="stopGame">
                    ■ 结束游戏
                </button>
            </div>
            <div class="stat-grid">
                <article v-for="item in statCards" :key="item.key" class="card stat">
                    <span class="stat-label">{{ item.label }}</span>
                    <b class="stat-value" :class="item.tone">{{ item.value }}</b>
                    <small class="stat-note">{{ item.note }}</small>
                </article>
            </div>
            <div class="quick-main">
                <section class="card">
                    <header class="card-title">
                        物品速记
                        <small>点一下记一条 · 右键改单价</small>
                    </header>
                    <p class="section-label">固 定 价 格</p>
                    <div class="item-grid">
                        <button
                            v-for="item in quickItems"
                            :key="item.id"
                            type="button"
                            class="item-card"
                            :data-item="item.id"
                            :disabled="app.busy"
                            :title="item.name + ' · ' + priceText(item.id)"
                            @click="addLoot(item)"
                            @contextmenu.prevent="openPrice(item)"
                        >
                            <img :src="item.icon" :alt="item.name" loading="lazy" />
                            <span class="item-name">{{ item.name }}</span>
                            <span class="item-price" :class="{ none: !rules.itemPrice(item.id) }">
                                {{ priceText(item.id) }}
                            </span>
                        </button>
                    </div>
                    <p class="section-label">未 设 价 格</p>
                    <div class="item-grid">
                        <button
                            v-for="item in quickUnset"
                            :key="item.id"
                            type="button"
                            class="item-card"
                            :data-item="item.id"
                            :disabled="app.busy"
                            :title="item.name + ' · ' + priceText(item.id)"
                            @click="addLoot(item)"
                            @contextmenu.prevent="openPrice(item)"
                        >
                            <img :src="item.icon" :alt="item.name" loading="lazy" />
                            <span class="item-name">{{ item.name }}</span>
                            <span class="item-price" :class="{ none: !rules.itemPrice(item.id) }">
                                {{ priceText(item.id) }}
                            </span>
                        </button>
                    </div>
                </section>
                <section class="card loot-card">
                    <header class="card-title">
                        掉落记录
                        <small>{{ rangeText }}</small>
                    </header>
                    <ul v-if="loot.length" class="loot-list">
                        <li v-for="tx in loot" :key="tx.id">
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
                                        {{ rules.itemStatuses[tx.status ?? ''] || '持有' }} · 剩
                                        {{ rules.itemRemaining(tx) }} / {{ tx.quantity ?? 0 }}
                                    </small>
                                    <small v-else>金额记录</small>
                                </span>
                                <span class="loot-price">{{ U.fmtMoney(holding(tx)) }}</span>
                                <button
                                    type="button"
                                    class="loot-remove"
                                    :disabled="app.busy"
                                    aria-label="移除这条掉落记录"
                                    title="移除"
                                    @click="askRemove(tx)"
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    </ul>
                    <p v-else class="empty-line">
                        这个范围还没有掉落记录，点左边的物品图标记一条。
                    </p>
                    <footer class="loot-footer">
                        <span>
                            共
                            <b>{{ loot.length }}</b>
                            条 · 持有估值
                            <b>{{ U.fmtMoney(lootValue) }}</b>
                        </span>
                        <button
                            class="btn compact"
                            :disabled="app.busy"
                            @click="recordsOpen = true"
                        >
                            查看全部记录
                        </button>
                    </footer>
                </section>
            </div>
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
    <ItemPriceDialog
        v-if="priceTarget"
        :id="priceTarget.item.id"
        :name="priceTarget.item.name"
        :then-add="priceTarget.thenAdd"
        @close="priceTarget = null"
        @saved="priceSaved"
    />
    <QuickSettings
        v-if="settingsOpen"
        @close="settingsOpen = false"
        @saved="settingsOpen = false"
    />
    <BaseModal v-if="removing" title="移除掉落记录" :busy="app.busy" @close="removing = null">
        <p>确定移除「{{ removing.itemName || removing.note || '物品' }}」这一条吗？</p>
        <p v-if="removing.saleId">它已经关联了成交收入，移除后成交记录也会一起删除，且无法恢复。</p>
        <p v-else>移除后库存与估值会重新计算，且无法恢复。</p>
        <p v-if="removeError" class="error" role="alert">{{ removeError }}</p>
        <template #footer="{ close }">
            <button class="btn" autofocus :disabled="app.busy" @click="close">取消</button>
            <button class="btn danger" :disabled="app.busy" @click="confirmRemove">
                {{ app.busy ? '移除中…' : '确认移除' }}
            </button>
        </template>
    </BaseModal>
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
.spacer {
    flex: 1;
}
.live {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--red);
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
.quick-main {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
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
    letter-spacing: 2px;
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
    gap: 10px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12.5px;
}
.empty-line {
    margin: 14px 0;
    color: var(--muted);
    font-size: 12.5px;
}
@media (max-width: 1150px) {
    .quick-main {
        grid-template-columns: minmax(0, 1fr);
    }
}
@media (max-width: 750px) {
    .filter-character {
        width: 100%;
    }
    .item-grid {
        grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    }
}
</style>
