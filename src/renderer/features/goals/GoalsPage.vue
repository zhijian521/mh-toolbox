<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import type { Goal, GoalEntry } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import AppIcon from '../../components/AppIcon.vue';
import PageHeader from '../../components/PageHeader.vue';
import { useDragSort } from '../../components/drag-sort';
import GoalCard from './GoalCard.vue';
import GoalEditor from './GoalEditor.vue';
import GoalGrowth from './GoalGrowth.vue';
import GoalProgress from './GoalProgress.vue';
import GoalHistory from './GoalHistory.vue';

/**
 * 目标计划。
 *
 * 两类目标共用一张卡片外壳，区别只在进度来源：跟随角色档案的目标由各角色当前的
 * 养成值算出达成人数，存钱与装备目标靠手记流水累计。汇总口径全部来自领域层
 * `goalSummary`，页面不重算——两侧各算一遍，迟早会出现卡片与记录对不上的情况。
 *
 * 筛选只影响展示，不写回数据；卡片顺序即自定义顺序，拖动与方向键随时可改。
 */
const app = useApplication();
const rules = app.rules();
const content = ref<HTMLElement>();
const addButton = ref<HTMLButtonElement>();
const filters = reactive({
    status: 'active' as 'active' | 'done' | 'all',
    type: '',
    character: 'all',
    keyword: '',
});
const editing = ref<{ goal?: Goal } | null>(null);
const growthGoal = ref<Goal | null>(null);
const progressTarget = ref<{ goal: Goal; logId?: string } | null>(null);
const historyGoal = ref<Goal | null>(null);
const deleting = ref<Goal | null>(null),
    deleteError = ref('');

const scoped = computed<GoalEntry[]>(() => {
    void app.data;
    return rules
        .orderedGoals(rules.goalsFor(filters.character))
        .map((goal) => ({ goal, summary: rules.goalSummary(goal) }));
});
const counts = computed(() => {
    const active = scoped.value.filter((entry) => entry.summary.status === 'active').length;
    return { active, done: scoped.value.length - active, all: scoped.value.length };
});
/** 计数放在选项文案里，切换前就能看到各状态各有多少条（计数不受状态筛选影响）。 */
const statusOptions = computed(() => [
    { value: 'active', label: `进行中 ${counts.value.active}` },
    { value: 'done', label: `已完成 ${counts.value.done}` },
    { value: 'all', label: `全部 ${counts.value.all}` },
]);
const typeOptions = computed(() => [
    { value: '', label: '全部类型' },
    ...rules.goalTypes.map((item) => ({ value: item.v, label: item.t })),
]);
const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((character) => ({ value: character.id, label: character.name })),
]);

/** 状态、类型、角色与关键词都只做筛选；顺序始终是领域给出的自定义顺序。 */
const entries = computed(() => {
    const keyword = filters.keyword.trim().toLocaleLowerCase();
    return scoped.value.filter(({ goal, summary }) => {
        if (filters.status !== 'all' && summary.status !== filters.status) return false;
        if (filters.type && goal.type !== filters.type) return false;
        if (!keyword) return true;
        const names = rules.goalCharacters(goal).map((character) => character.name);
        return [goal.title, goal.note, ...names].join(' ').toLocaleLowerCase().includes(keyword);
    });
});
const filtered = computed(
    () =>
        !!filters.keyword.trim() ||
        !!filters.type ||
        filters.character !== 'all' ||
        filters.status !== 'active',
);

function scopeText(goal: Goal) {
    return goal.characterId === 'all' ? '全部角色' : rules.charName(goal.characterId);
}
function resetFilters() {
    Object.assign(filters, { status: 'all', type: '', character: 'all', keyword: '' });
}
/**
 * 保存或状态切换后把焦点交给卡片的编辑按钮。
 *
 * 卡片可能已经不在当前筛选里（例如在「进行中」页标记完成），此时退回「新建目标」，
 * 否则 `?.focus()` 静默失败，焦点掉回文档开头。
 */
async function focusCard(id: string) {
    await nextTick();
    const target =
        content.value?.querySelector<HTMLButtonElement>(
            `[data-goal-id="${CSS.escape(id)}"] button[aria-label="编辑目标"]`,
        ) ?? addButton.value;
    target?.focus({ preventScroll: true });
}
/**
 * 拖动与方向键排序后必须把焦点还回手柄。
 *
 * 方向键是同一个手柄上的连续操作，焦点一旦移走，第二下就落不到卡片上了；
 * 交给 `focusCard` 会让键盘用户每移动一次都要重新找回来。
 */
async function focusHandle(id: string) {
    await nextTick();
    const target =
        content.value?.querySelector<HTMLButtonElement>(
            `[data-goal-id="${CSS.escape(id)}"] .drag-handle`,
        ) ?? addButton.value;
    target?.focus({ preventScroll: true });
}
async function saved(id: string) {
    const isNew = !editing.value?.goal;
    editing.value = null;
    if (isNew) {
        const goal = rules.state.goals.find((item) => item.id === id);
        // 新目标可能落在当前筛选之外（例如「已完成」页里新建），先按它的状态切过去，
        // 否则用户保存完看不到任何变化。
        if (goal)
            Object.assign(filters, {
                status: rules.goalSummary(goal).status,
                type: '',
                keyword: '',
            });
    }
    await focusCard(id);
}
async function setStatus(goal: Goal, status: 'active' | 'done') {
    if (app.busy) return;
    try {
        await app.execute((domain) => domain.setGoalStatus(goal.id, status));
        app.notify(status === 'done' ? '目标已达成' : '已恢复进行中');
        await focusCard(goal.id);
    } catch (error) {
        app.notify(error instanceof Error ? error.message : String(error), true);
    }
}
async function remove() {
    const goal = deleting.value;
    if (!goal || app.busy) return;
    try {
        await app.execute((domain) => domain.removeGoal(goal.id));
        deleting.value = null;
        app.notify('目标已删除');
        await nextTick();
        addButton.value?.focus();
    } catch (error) {
        deleteError.value = error instanceof Error ? error.message : String(error);
    }
}
/**
 * 从记录里点「编辑」时先收起记录弹窗再开编辑弹窗：两层弹窗都监听 Escape 与焦点循环，
 * 叠在一起时外层会先响应，键盘操作会变得不可预测。
 */
function editLogged(logId: string) {
    const goal = historyGoal.value;
    if (!goal) return;
    historyGoal.value = null;
    progressTarget.value = { goal, logId };
}
async function move(id: string, targetId: string, position: 'before' | 'after') {
    if (app.busy || id === targetId) return;
    try {
        await app.execute((domain) => domain.saveGoalOrder(id, { targetId, position }));
        app.notify('目标顺序已保存');
        await focusHandle(id);
    } catch (error) {
        app.notify(error instanceof Error ? error.message : String(error), true);
    }
}
const sort = useDragSort({
    keys: () => entries.value.map((entry) => entry.goal.id),
    scroll: () => content.value,
    enabled: () => !app.busy,
    onMove: ({ key, targetKey, position }) => void move(key, targetKey, position),
});
</script>
<template>
    <PageHeader title="目标" description="养成目标跟随档案自动更新 · 存钱与装备目标手动累计">
        <template #actions>
            <button ref="addButton" class="btn primary" :disabled="app.busy" @click="editing = {}">
                ＋ 新建目标
            </button>
        </template>
    </PageHeader>
    <div ref="content" class="page-content" @dragend="sort.end()" @drop="sort.end()">
        <div class="goal-filters">
            <label class="filter-field filter-status">
                状态
                <BaseSelect v-model="filters.status" label="目标状态" :options="statusOptions" />
            </label>
            <label class="filter-field filter-type">
                类型
                <BaseSelect v-model="filters.type" label="目标类型筛选" :options="typeOptions" />
            </label>
            <label class="filter-field filter-character">
                角色
                <BaseSelect
                    v-model="filters.character"
                    label="适用角色筛选"
                    :options="characterOptions"
                />
            </label>
            <label class="filter-field filter-keyword">
                搜索
                <input
                    v-model="filters.keyword"
                    type="search"
                    aria-label="搜索目标、角色或备注"
                    placeholder="目标、角色或备注"
                />
            </label>
        </div>
        <div v-if="!scoped.length" class="empty">
            <AppIcon name="target" :size="38" />
            <h2>定一个小目标</h2>
            <p>养成目标跟随角色档案自动计算，存钱和装备目标用「记进度」手动累计。</p>
            <button class="btn" :disabled="app.busy" @click="editing = {}">新建第一个目标</button>
        </div>
        <div v-else-if="!entries.length" class="empty">
            <AppIcon name="target" :size="38" />
            <!--
                这里分两种空：有筛选条件却没结果，和「进行中的都做完了」。
                后者没有任何筛选条件，给「清除筛选」是死路——它会切到全部，
                用户看不出发生了什么。
            -->
            <template v-if="filtered">
                <h2>没有符合筛选条件的目标</h2>
                <button class="btn" @click="resetFilters">清除筛选</button>
            </template>
            <template v-else>
                <h2>进行中的目标都完成了</h2>
                <p>已完成 {{ counts.done }} 个，可以切到「已完成」查看或恢复进行。</p>
                <button class="btn" @click="filters.status = 'done'">查看已完成</button>
            </template>
        </div>
        <div v-else class="goal-grid">
            <div
                v-for="entry in entries"
                :key="entry.goal.id"
                class="card-wrapper"
                :class="sort.state(entry.goal.id)"
                @dragover="sort.over(entry.goal.id, $event)"
                @drop.stop="sort.drop($event, entry.goal.id)"
            >
                <GoalCard
                    :goal="entry.goal"
                    :summary="entry.summary"
                    :scope="scopeText(entry.goal)"
                    :busy="app.busy"
                    @edit="editing = { goal: plain(entry.goal) }"
                    @remove="
                        deleting = entry.goal;
                        deleteError = '';
                    "
                    @progress="
                        entry.goal.tracking
                            ? (growthGoal = entry.goal)
                            : (progressTarget = { goal: entry.goal })
                    "
                    @history="historyGoal = entry.goal"
                    @status="setStatus(entry.goal, $event)"
                    @move="sort.moveBy(entry.goal.id, $event)"
                    @drag="sort.start(entry.goal.id, $event)"
                />
            </div>
        </div>
    </div>
    <GoalEditor v-if="editing" :goal="editing.goal" @close="editing = null" @saved="saved" />
    <GoalGrowth v-if="growthGoal" :goal="growthGoal" @close="growthGoal = null" />
    <GoalProgress
        v-if="progressTarget"
        :goal="progressTarget.goal"
        :log-id="progressTarget.logId"
        @close="progressTarget = null"
    />
    <GoalHistory
        v-if="historyGoal"
        :goal="historyGoal"
        @close="historyGoal = null"
        @edit-log="editLogged"
    />
    <BaseModal v-if="deleting" title="删除目标" :busy="app.busy" @close="deleting = null">
        <p>确定删除目标「{{ deleting.title }}」吗？</p>
        <p>
            跟随档案的目标会连同它的进度视图一起移除；手动累计目标的进度流水一并删除。
            角色档案与养成记录不受影响。
        </p>
        <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn danger" :disabled="app.busy" @click="remove">
                {{ app.busy ? '删除中…' : '确认删除' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.goal-filters {
    display: flex;
    align-items: end;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.filter-field {
    flex: none;
    gap: 4px;
    font-size: 12px;
}
.filter-status {
    width: 118px;
}
.filter-type {
    width: 118px;
}
.filter-character {
    width: 132px;
}
.filter-keyword {
    flex: 1;
    min-width: 150px;
    max-width: 260px;
}
.filter-keyword input {
    min-height: 34px;
}
.goal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
    align-items: stretch;
}
.card-wrapper {
    position: relative;
    min-width: 0;
}
@media (max-width: 750px) {
    .goal-grid {
        grid-template-columns: minmax(0, 1fr);
    }
    .filter-keyword {
        max-width: none;
    }
}
</style>
