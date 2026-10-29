<script setup lang="ts">
import { computed } from 'vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import OverviewBoard from './OverviewBoard.vue';

/**
 * 进行中的目标：最多四张，只回答「还差多少」。
 *
 * 总览是提醒「还有什么事」，不是目标列表——所以只要进行中的、只要四张，够数与
 * 明细都去目标页看。
 */
const props = defineProps<{ character: string }>();

const app = useApplication();
const rules = app.rules();

const goals = computed(() => {
    void app.data;
    return (
        rules
            // 传角色：不传的话领域会退回自己的全局筛选（恒为 all），切角色时这块就不跟着变了。
            .orderedGoals(rules.goalsFor(props.character))
            .map((goal) => ({ goal, summary: rules.goalSummary(goal) }))
            .filter((entry) => entry.summary.status === 'active')
            .slice(0, 4)
    );
});
function goalText(entry: {
    goal: { tracking?: unknown; target?: number; unit?: string };
    summary: { achieved?: number; members?: unknown[]; current?: number };
}) {
    const { goal, summary } = entry;
    if (goal.tracking)
        return (
            (summary.achieved ?? 0) +
            ' / ' +
            (summary.members ? summary.members.length : 0) +
            ' 个角色达标'
        );
    return (
        U.fmtNumber(summary.current ?? 0) +
        ' / ' +
        U.fmtNumber(goal.target ?? 0) +
        ' ' +
        (goal.unit || '万')
    );
}
/** 目标适用谁：共同目标与角色专属目标混在一屏，不标出来会看不懂在攒谁的钱。 */
function goalScope(goal: { characterId: string }) {
    return goal.characterId === 'all' ? '共同' : rules.charName(goal.characterId);
}
</script>

<template>
    <OverviewBoard title="进行中的目标" description="还差多少">
        <template #tools>
            <RouterLink class="btn compact" to="/goals">查看目标</RouterLink>
        </template>
        <div v-if="goals.length" class="goal-grid">
            <article v-for="entry in goals" :key="entry.goal.id" class="goal-mini">
                <header>
                    <h3 :title="entry.goal.title">{{ entry.goal.title }}</h3>
                    <b>{{ entry.summary.pct }}%</b>
                </header>
                <div class="goal-bar">
                    <i :style="{ width: Math.max(0, Math.min(100, entry.summary.pct)) + '%' }"></i>
                </div>
                <p>
                    {{ goalText(entry) }}
                    <span class="goal-scope">{{ goalScope(entry.goal) }}</span>
                </p>
            </article>
        </div>
        <p v-else class="panel-empty no-goal">
            还没有进行中的目标。
            <RouterLink class="text-button" to="/goals">去定一个</RouterLink>
        </p>
    </OverviewBoard>
</template>

<style scoped>
/* ---------- 目标 ---------- */
.goal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
}
.goal-mini {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper);
    min-width: 0;
}
.goal-mini header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}
.goal-mini h3 {
    overflow: hidden;
    font-size: 13.5px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.goal-mini b {
    flex: none;
    color: var(--gold);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
}
.goal-bar {
    height: 5px;
    border-radius: 3px;
    background: var(--panel-3);
    overflow: hidden;
}
.goal-bar i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(
        to right,
        var(--gold),
        color-mix(in srgb, var(--gold) 72%, var(--paper))
    );
}
.goal-mini p {
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}
.goal-mini p:last-child {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0;
}
.goal-scope {
    color: var(--line-2);
    font-size: 11px;
}
.no-goal {
    display: flex;
    align-items: center;
    gap: 6px;
}
.panel-empty {
    margin: 0;
    padding: 16px 0;
    color: var(--muted);
    font-size: 12.5px;
}
</style>
