<script setup lang="ts">
import { computed } from 'vue';
import type { Goal, GoalMember, GoalSummary } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
import NumberValue from '../../components/NumberValue.vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';

/**
 * 目标卡片。两种目标共用一个外壳：
 *   - 跟随角色档案（`tracking`）：进度来自各角色当前的养成值，达成人数按完整成员算；
 *   - 手动累计（存钱、装备）：进度来自手记的流水，可能为负数调整。
 * 两者的汇总口径都由领域层 `goalSummary` 给出，卡片只负责展示与派发操作。
 */
const props = defineProps<{
    goal: Goal;
    summary: GoalSummary;
    /** 适用角色文案（全部角色 / 单角色名），由页面统一解析。 */
    scope: string;
    /** 仅自定义排序时允许拖动，其他排序下顺序由排序规则决定。 */
    draggable: boolean;
    busy: boolean;
}>();
const emit = defineEmits<{
    edit: [];
    remove: [];
    progress: [];
    history: [];
    status: [status: 'active' | 'done'];
    move: [offset: number];
    drag: [event: DragEvent];
}>();
const rules = useApplication().rules();
const done = computed(() => props.summary.status === 'done');
const members = computed<GoalMember[]>(() => props.summary.members ?? []);
/** 未达标的排在前面：目标是「还差什么」，不是「已经有什么」。 */
const orderedMembers = computed(() =>
    [...members.value].sort((a, b) => Number(a.done) - Number(b.done)),
);
const typeText = computed(() => rules.goalTypeText(props.goal.type));
const metricLabel = computed(() =>
    props.goal.tracking ? rules.goalMetricLabel(props.goal.tracking) : '',
);
const days = computed(() => (props.goal.deadline ? U.daysLeft(props.goal.deadline) : null));
const deadlineText = computed(() => {
    if (done.value || days.value === null) return '';
    return days.value < 0
        ? '已逾期 ' + -days.value + ' 天'
        : days.value === 0
          ? '今天到期'
          : '剩 ' + days.value + ' 天';
});
const overdue = computed(() => !done.value && days.value !== null && days.value < 0);
const sourceText = computed(() =>
    props.goal.tracking
        ? '跟随角色档案'
        : props.goal.characterId === 'all'
          ? '共同累计'
          : '手动累计',
);
const unit = computed(() => props.goal.unit || '万');
</script>
<template>
    <article
        class="goal-card"
        :class="{ done }"
        :data-goal-id="goal.id"
        :aria-label="goal.title + '的目标'"
    >
        <header class="goal-head">
            <h2 class="goal-title" :title="goal.title">{{ goal.title }}</h2>
            <div class="actions goal-tools">
                <button
                    class="icon-button drag-handle"
                    :disabled="busy || !draggable"
                    :draggable="draggable && !busy"
                    :title="
                        draggable
                            ? '拖动排序，或用方向键前后移动'
                            : '切回「自定义排序」后可拖动排序'
                    "
                    aria-label="拖动排序，或用方向键前后移动"
                    @dragstart="emit('drag', $event)"
                    @keydown.left.prevent="emit('move', -1)"
                    @keydown.up.prevent="emit('move', -1)"
                    @keydown.right.prevent="emit('move', 1)"
                    @keydown.down.prevent="emit('move', 1)"
                >
                    <AppIcon name="grip" :size="16" />
                </button>
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="编辑目标"
                    title="编辑目标"
                    @click="emit('edit')"
                >
                    <AppIcon name="edit" :size="16" />
                </button>
                <button
                    class="icon-button danger"
                    :disabled="busy"
                    aria-label="删除目标"
                    title="删除目标"
                    @click="emit('remove')"
                >
                    <AppIcon name="trash" :size="16" />
                </button>
            </div>
        </header>
        <p class="goal-meta">
            <span class="goal-badge" :class="'type-' + goal.type">{{ typeText }}</span>
            <span :title="scope">{{ scope }}</span>
            <span>{{ sourceText }}</span>
            <span v-if="deadlineText" :class="{ 'goal-overdue': overdue }" :title="goal.deadline">
                {{ deadlineText }}
            </span>
            <span v-if="done">
                {{ goal.tracking ? '已全部达标' : (goal.doneAt || '') + ' 达成' }}
            </span>
        </p>
        <div class="goal-nums">
            <template v-if="goal.tracking">
                <span>
                    达成
                    <NumberValue class="goal-num-current" :value="summary.achieved ?? 0" />
                    <span class="goal-separator">/</span>
                    <NumberValue :value="members.length" />
                    个角色
                </span>
                <span><NumberValue class="goal-num-pct" :value="summary.pct" unit="%" /></span>
            </template>
            <template v-else>
                <span>
                    进度
                    <NumberValue class="goal-num-pct" :value="summary.pct" unit="%" />
                </span>
                <span>
                    <NumberValue class="goal-num-current" :value="goal.current" :unit="unit" />
                    <span class="goal-separator">/</span>
                    <NumberValue :value="goal.target" :unit="unit" />
                </span>
            </template>
        </div>
        <div
            class="progress"
            :class="{ ok: done }"
            role="progressbar"
            aria-label="目标进度"
            :aria-valuenow="summary.pct"
            aria-valuemin="0"
            aria-valuemax="100"
        >
            <i :style="{ width: summary.pct + '%' }"></i>
        </div>
        <template v-if="goal.tracking">
            <p class="goal-caption">
                {{ metricLabel }} · 每个角色 {{ goal.target }}{{ goal.unit }}
                <template v-if="summary.unknown">· {{ summary.unknown }} 个待补录</template>
            </p>
            <ul v-if="members.length" class="goal-members" aria-label="各角色养成进度">
                <li v-for="member in orderedMembers" :key="member.id" class="goal-member">
                    <span class="goal-member-name" :title="member.name">{{ member.name }}</span>
                    <span class="goal-member-value">
                        <template v-if="member.value === null">
                            <span class="goal-member-unknown">未记录</span>
                        </template>
                        <template v-else>
                            <NumberValue :value="member.value" />
                            <span class="goal-separator">/</span>
                            <NumberValue :value="goal.target" :unit="goal.unit" />
                        </template>
                    </span>
                    <span
                        class="goal-member-state"
                        :class="{ complete: member.done, unknown: member.value === null }"
                    >
                        <template v-if="member.done">已达标</template>
                        <template v-else-if="member.value === null">待补录</template>
                        <template v-else>
                            还差 {{ member.remaining }}
                            <small>{{ goal.unit }}</small>
                        </template>
                    </span>
                </li>
            </ul>
            <p v-else class="goal-caption">暂无适用角色，添加角色后自动参与目标。</p>
        </template>
        <p v-if="goal.note" class="goal-note">{{ goal.note }}</p>
        <div class="actions goal-actions">
            <template v-if="goal.tracking">
                <button
                    class="btn compact primary"
                    :disabled="busy || !members.length"
                    @click="emit('progress')"
                >
                    更新养成
                </button>
            </template>
            <template v-else-if="done">
                <button class="btn compact" :disabled="busy" @click="emit('status', 'active')">
                    恢复进行
                </button>
            </template>
            <template v-else>
                <button class="btn compact primary" :disabled="busy" @click="emit('progress')">
                    ＋ 记进度
                </button>
                <button class="btn compact" :disabled="busy" @click="emit('status', 'done')">
                    标记完成
                </button>
            </template>
            <button class="btn compact" :disabled="busy" @click="emit('history')">
                {{ goal.tracking ? '养成记录' : '进度历史' }}
            </button>
        </div>
    </article>
</template>

<style scoped>
.goal-card {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 18px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
    min-width: 300px;
    height: 100%;
}
.goal-card.done {
    border-color: #4a7c5973;
}
.goal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}
.goal-title {
    font-size: 16px;
    line-height: 1.5;
    overflow-wrap: anywhere;
}
.goal-tools {
    flex: none;
    gap: 5px;
    flex-wrap: nowrap;
}
.goal-tools .icon-button {
    width: 28px;
    height: 28px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
}
.goal-tools .icon-button:hover:not(:disabled) {
    border-color: var(--gold);
    background: #eee3cb;
    color: #806027;
}
.goal-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 9px;
    font-size: 12px;
    color: var(--muted);
}
.goal-badge {
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    font-size: 11.5px;
    color: var(--muted);
}
/* 类型徽章：类名带 type- 前缀，不能直接用类型名——`.progress` 会撞上进度条那条规则。 */
.goal-badge.type-money {
    color: var(--gold);
    border-color: #a67c2e73;
}
.goal-badge.type-progress {
    color: var(--blue);
    border-color: #3d5a6c73;
}
.goal-badge.type-gear {
    color: #8a5a2b;
    border-color: #8a5a2b73;
}
.goal-overdue {
    color: var(--red);
}
.goal-nums {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    font-size: 12.5px;
    color: var(--muted);
    white-space: nowrap;
}
.goal-nums > span:last-child {
    text-align: right;
}
.goal-num-current,
.goal-num-pct {
    color: var(--gold);
}
.goal-separator {
    color: var(--muted);
    margin: 0 1px;
}
.progress {
    height: 7px;
    border: 1px solid var(--line);
    border-radius: 2px;
    background: var(--paper-2);
    overflow: hidden;
}
.progress > i {
    display: block;
    height: 100%;
    background: var(--gold);
}
.progress.ok > i {
    background: var(--green);
}
.goal-caption {
    font-size: 12px;
    color: var(--muted);
}
.goal-members {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0;
    margin: 0;
    list-style: none;
}
.goal-member {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: baseline;
    gap: 10px;
    padding: 4px 0;
    font-size: 12.5px;
    border-top: 1px solid #d9cfb680;
}
.goal-member-name {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.goal-member-value {
    color: var(--blue);
    white-space: nowrap;
}
.goal-member-unknown {
    color: #9a917e;
}
.goal-member-state {
    min-width: 66px;
    text-align: right;
    color: var(--gold);
    font-size: 12px;
    white-space: nowrap;
}
.goal-member-state.complete {
    color: var(--green);
}
.goal-member-state.unknown {
    color: var(--muted);
}
.goal-member-state small {
    margin-left: 2px;
    font-size: 11px;
}
.goal-note {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.goal-actions {
    margin-top: auto;
    padding-top: 3px;
}
</style>
