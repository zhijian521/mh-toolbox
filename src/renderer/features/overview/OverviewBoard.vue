<script setup lang="ts">
/**
 * 账本段落的公共外壳：左边标题与一句说明，右边工具（区间筛选、去明细页的按钮）。
 *
 * 三块并排的段落（日常收益、账号账本、进行中的目标）长得一模一样，只有内容不同；
 * 把这一圈细线分隔的标题行收在一处，改视觉时不用改三遍。
 */
defineProps<{ title: string; description: string }>();
</script>

<template>
    <section class="board">
        <header class="board-head">
            <div class="board-title">
                <h2>{{ title }}</h2>
                <p>{{ description }}</p>
            </div>
            <div v-if="$slots.tools" class="board-tools">
                <slot name="tools" />
            </div>
        </header>
        <slot />
    </section>
</template>

<style scoped>
/* ---------- 账本段落：细线分隔，不用一层层白卡片堆起来 ---------- */
.board {
    display: flex;
    flex-direction: column;
    gap: 14px;
}
.board-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--line);
}
.board-title {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.board-title h2 {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.3px;
}
.board-title p {
    color: var(--muted);
    font-size: 12px;
}
.board-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}
</style>
