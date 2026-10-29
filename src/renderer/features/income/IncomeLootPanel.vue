<script setup lang="ts">
import type { Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import { quickItemById } from '../../game-data/quick-items.js';
import AppIcon from '../../components/AppIcon.vue';

/**
 * 右侧收益记录卡：只列速记产生的收入，最近 N 条，底部两个合计。
 *
 * 「金币」与「物品估值」分开报是刻意的：两者单位都是万，但量纲不同（到手的币
 * 与按标价折算的货值），加在一起得出的数没有含义。
 */
defineProps<{
    /** 本范围的全部速记收入，用来报条数与合计。 */
    list: Transaction[];
    /** 实际渲染的那几条（`list` 的前 N 条）。 */
    shown: Transaction[];
    money: number;
    item: number;
    limit: number;
    rangeText: string;
}>();
const emit = defineEmits<{ remove: [tx: Transaction]; openAll: [] }>();

const app = useApplication();
const rules = app.rules();

function iconOf(id?: number) {
    return quickItemById(Number(id))?.icon || '';
}
/** 收益记录行的副标题：归属角色 + 计价方式，多开时一眼分出是哪个号的那份。 */
function lootMeta(tx: Transaction) {
    const detail =
        tx.recordType === 'item'
            ? U.fmtMoney(rules.itemUnitPrice(tx)) + ' × ' + (tx.quantity ?? 0)
            : '金额记录';
    return rules.charName(tx.characterId) + ' · ' + detail;
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
</script>

<template>
    <section class="card loot-card">
        <header class="card-title">
            收益记录
            <small>{{ rangeText }}</small>
        </header>
        <ul v-if="list.length" class="loot-list">
            <li v-for="tx in shown" :key="tx.id">
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
                        @click="emit('remove', tx)"
                    >
                        ✕
                    </button>
                </div>
            </li>
        </ul>
        <p v-else class="empty-line">这个范围还没有收益记录，点左边的物品图标记一条。</p>
        <footer class="loot-footer">
            <span class="loot-sum">
                <span>
                    共
                    <b>{{ list.length }}</b>
                    条
                    <span v-if="list.length > limit" class="loot-more">
                        · 显示最近 {{ limit }} 条
                    </span>
                </span>
                <span class="loot-totals">
                    金币
                    <b>{{ U.fmtMoney(money) }}</b>
                    · 物品
                    <b>{{ U.fmtMoney(item) }}</b>
                </span>
            </span>
            <button class="btn compact" :disabled="app.busy" @click="emit('openAll')">
                查看全部
            </button>
        </footer>
    </section>
</template>

<style scoped>
.card {
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
}
.card-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    font-size: 15px;
    font-weight: 600;
}
.card-title small {
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 400;
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
</style>
