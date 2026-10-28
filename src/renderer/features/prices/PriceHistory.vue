<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PriceItem, PriceLog } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import { useApplication } from '../../stores/application';

/**
 * 一张卡的价格流水。
 *
 * 每行与「上一条更早的记录」比较，标出这次是涨了还是跌了；行的顺序就是领域给的
 * `priceLogsSorted`，这里不再排一遍。删除用行内确认，不再叠一层弹窗——记录本身
 * 可以重录，三层弹窗的键盘代价比误删更大。
 */
const props = defineProps<{ item: PriceItem }>();
const emit = defineEmits<{ close: []; add: []; edit: [log: PriceLog] }>();
const app = useApplication();
const rules = app.rules();

const logs = computed<PriceLog[]>(() => rules.priceLogsSorted(props.item));
const current = computed(() => logs.value[0] ?? null);
const currentLabel = computed(() => rules.priceLabel(current.value ? current.value.price : null));
const rows = computed(() =>
    logs.value.map((log, index) => {
        const previous = logs.value[index + 1];
        return {
            log,
            delta: previous ? log.price - previous.price : null,
            latest: index === 0,
        };
    }),
);
const pending = ref('');
const error = ref('');
const total = computed(() => logs.value.length);

/** @param {number} value */
function diff(value: number) {
    const label = rules.priceLabel(Math.abs(value));
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return value === 0 ? '持平' : sign + label.value + ' ' + label.unit;
}
/** @param {number} value */
function tone(value: number) {
    return value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
}
async function remove(log: PriceLog) {
    if (app.busy) return;
    error.value = '';
    try {
        await app.execute((domain) => domain.removePriceLog(props.item.id, log.id));
        pending.value = '';
        app.notify('价格记录已删除');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal :title="item.name + ' · 价格流水'" medium :busy="app.busy" @close="emit('close')">
        <div class="history-summary">
            <div class="summary-price">
                <span class="summary-value">{{ currentLabel.value }}</span>
                <span class="summary-unit">{{ currentLabel.unit }}</span>
            </div>
            <div class="summary-side">
                <span class="summary-label">当前价 · 每{{ item.unit || '个' }}</span>
                <span class="summary-count">共 {{ total }} 条 · 分类 {{ item.category }}</span>
            </div>
        </div>

        <p v-if="error" class="error history-error" role="alert">{{ error }}</p>

        <ul v-if="rows.length" class="log-list">
            <li v-for="row in rows" :key="row.log.id" class="log-row">
                <span class="log-date" :class="{ latest: row.latest }">
                    {{ row.log.date.slice(5) }}
                </span>
                <span class="log-price">
                    {{ rules.priceLabel(row.log.price).value }}
                    <small>{{ rules.priceLabel(row.log.price).unit }}</small>
                </span>
                <span class="log-delta" :class="row.delta === null ? 'flat' : tone(row.delta)">
                    {{ row.delta === null ? '起点' : diff(row.delta) }}
                </span>
                <span class="log-note" :title="row.log.note">{{ row.log.note || '—' }}</span>
                <span class="actions log-tools">
                    <template v-if="pending === row.log.id">
                        <button
                            class="btn compact danger"
                            :disabled="app.busy"
                            @click="remove(row.log)"
                        >
                            确认
                        </button>
                        <button class="btn compact" :disabled="app.busy" @click="pending = ''">
                            取消
                        </button>
                    </template>
                    <template v-else>
                        <button
                            class="icon-button"
                            :disabled="app.busy"
                            aria-label="修改这条价格"
                            title="修改这条价格"
                            @click="emit('edit', row.log)"
                        >
                            <AppIcon name="edit" :size="14" />
                        </button>
                        <button
                            class="icon-button danger"
                            :disabled="app.busy"
                            aria-label="删除这条价格"
                            title="删除这条价格"
                            @click="pending = row.log.id"
                        >
                            <AppIcon name="trash" :size="14" />
                        </button>
                    </template>
                </span>
            </li>
        </ul>
        <p v-else class="empty-history">还没有价格记录。</p>

        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">关闭</button>
            <button class="btn primary" :disabled="app.busy" @click="emit('add')">＋ 记一条</button>
        </template>
    </BaseModal>
</template>

<style scoped>
.history-summary {
    display: flex;
    align-items: baseline;
    gap: 14px;
    padding: 2px 0 14px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 6px;
}
.summary-price {
    display: flex;
    align-items: baseline;
    gap: 4px;
}
.summary-value {
    font-size: 30px;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}
.summary-unit {
    font-size: 13px;
    color: var(--gold);
}
.summary-side {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--muted);
}
.summary-label {
    letter-spacing: 0.5px;
}
.summary-count {
    font-size: 11.5px;
}
.history-error {
    margin: 8px 0 4px;
    font-size: 13px;
}
.log-list {
    list-style: none;
    margin: 0;
    padding: 4px 0 0;
}
.log-row {
    display: grid;
    grid-template-columns: 52px 96px 88px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #d9cfb680;
    font-size: 13px;
}
.log-row:last-child {
    border-bottom: 0;
}
.log-date {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-size: 12.5px;
}
.log-date.latest {
    color: var(--gold);
}
.log-price {
    font-variant-numeric: tabular-nums;
    font-size: 15px;
}
.log-price small {
    font-size: 11.5px;
    color: var(--gold);
}
.log-delta {
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.log-delta.up {
    color: var(--red);
}
.log-delta.down {
    color: var(--green);
}
.log-delta.flat {
    color: var(--muted);
}
.log-note {
    color: var(--muted);
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.log-tools {
    gap: 3px;
    flex-wrap: nowrap;
    justify-content: flex-end;
}
.log-tools .icon-button {
    width: 24px;
    height: 24px;
}
.empty-history {
    padding: 26px 0;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
}
</style>
