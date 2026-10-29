<script setup lang="ts">
import type { IncomeStatCard } from '../../app/types';
import { U } from '../../domain/util.js';

/**
 * 顶部四张统计卡 + 一行「账号里已同步多少」。
 *
 * 卡本身不含计算：口径全部来自领域的 `earningsStats`，这里只决定顺序与措辞
 * （时长与点卡在前，物品与梦幻币在后），以及正负用哪一档颜色。
 */
defineProps<{
    cards: IncomeStatCard[];
    settled: { count: number; net: number };
}>();
</script>

<template>
    <div class="stat-grid">
        <article v-for="item in cards" :key="item.key" class="stat">
            <span class="stat-label">{{ item.label }}</span>
            <b class="stat-value" :class="item.tone">{{ item.value }}</b>
            <small class="stat-note">{{ item.note }}</small>
        </article>
    </div>
    <p
        v-if="settled.count"
        class="sync-note"
        title="金额 = 速记金币 + 物品估值 − 点卡；同一天同角色只留一条，随时覆盖"
    >
        账号「游戏收益」随记录自动更新 · 本范围
        <b>{{ settled.count }}</b>
        条 · 净
        <b :class="settled.net >= 0 ? 'money-in' : 'money-out'">
            {{ U.fmtMoney(settled.net) }}
        </b>
    </p>
</template>

<style scoped>
.stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
}
.stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 13px 15px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
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
</style>
