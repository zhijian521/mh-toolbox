<script setup lang="ts">
import { computed } from 'vue';

/**
 * 养成变更的类型列：角色养成记录与目标记录共用。
 *
 * 文案由 kind 决定，提升时在标签后补一个增量（`提升 +1`）。增量只在提升时给出：
 * 「调低」「调整」「新增」等类型的差值含义不同（新增是从无到有、调整是换了一项），
 * 统一显示一个数字会让人误以为都是加减。
 *
 * 两处各写一份曾出现过口径分叉——角色页显示 `提升+1`，目标页只有 `提升`。判定与
 * 文案集中在这里，新增记录页直接引用，不要复制。
 */
const props = defineProps<{
    kind: string;
    from?: number | string | null;
    to?: number | string | null;
}>();
const LABELS: Record<string, string> = {
    increase: '提升',
    decrease: '调低',
    changed: '调整',
    added: '新增',
    removed: '移除',
    recorded: '补录',
    cleared: '清空',
};
const text = computed(() => LABELS[props.kind] ?? '调整');
const delta = computed(() => {
    if (props.kind !== 'increase') return '';
    const from = Number(props.from);
    const to = Number(props.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return '';
    return '+' + (to - from);
});
</script>
<template>
    <span class="growth-kind" :class="{ positive: kind === 'increase' }">
        {{ text }}
        <b v-if="delta">{{ delta }}</b>
    </span>
</template>

<style scoped>
/* 作为网格项目时靠右对齐，与前后列的数字形成右边界；窄屏由父级改成靠左。 */
.growth-kind {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    justify-self: end;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
}
.growth-kind.positive {
    color: var(--green);
}
.growth-kind b {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
}
@media (max-width: 750px) {
    .growth-kind {
        justify-self: start;
    }
}
</style>
