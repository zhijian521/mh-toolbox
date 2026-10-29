<script setup lang="ts">
/**
 * 紧凑记录列表：日期、名称（可带一句灰色副标题）、右侧金额。
 *
 * 总览里出现两处（最近收益、最近账号记录），差别只在副标题写什么，所以这里只吃
 * 已经算好的行，不认识流水——口径留在各自的段落里。
 */
interface MiniRow {
    id: string;
    date: string;
    title: string;
    sub: string;
    amount: string;
    tone: string;
    tip: string;
}

defineProps<{ rows: MiniRow[]; empty: string }>();
</script>

<template>
    <ul v-if="rows.length" class="mini-list">
        <li v-for="row in rows" :key="row.id">
            <span class="mini-date">{{ row.date }}</span>
            <span class="mini-name" :title="row.tip">
                {{ row.title }}
                <small>{{ row.sub }}</small>
            </span>
            <span class="mini-amount" :class="row.tone">{{ row.amount }}</span>
        </li>
    </ul>
    <p v-else class="panel-empty">{{ empty }}</p>
</template>

<style scoped>
/* ---------- 紧凑列表 ---------- */
.mini-list {
    padding: 0;
    margin: 0;
    list-style: none;
}
.mini-list li {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 9px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--line);
    font-size: 12.5px;
}
.mini-list li:last-child {
    border-bottom: 0;
}
.mini-date {
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}
.mini-name {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.mini-name small {
    flex: none;
    color: var(--muted);
    font-size: 11px;
}
.mini-amount {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.mini-amount.income {
    color: var(--green);
}
.mini-amount.expense {
    color: var(--red);
}
.mini-amount.item {
    color: var(--muted);
}
.panel-empty {
    margin: 0;
    padding: 16px 0;
    color: var(--muted);
    font-size: 12.5px;
}
</style>
