<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Goal, GoalLog } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import NumberValue from '../../components/NumberValue.vue';

/**
 * 目标记录。
 *
 * 跟随档案的目标没有自己的流水：「记录」就是角色档案里该养成项的变更历史，
 * 只读，删除要去角色的养成记录里做。手动累计的目标才有自己的进度流水，可以
 * 就地编辑与删除——改一笔只影响那一笔，累计值由领域层重算。
 *
 * 删除确认放在列表顶部而不是再开一层弹窗：弹窗内再弹窗时，两层都在 document
 * 捕获阶段监听 Escape，外层会先关掉自己，确认框反而留在原地。
 */
const props = defineProps<{ goal: Goal }>();
const emit = defineEmits<{ close: []; 'edit-log': [logId: string] }>();
const app = useApplication();
const rules = app.rules();
const preset = ref('all'),
    from = ref(''),
    to = ref(''),
    page = ref(1),
    pendingDelete = ref<string | null>(null),
    error = ref('');
const range = computed(() =>
    preset.value === 'custom' ? { from: from.value, to: to.value } : U.rangeFor(preset.value),
);
const presetOptions = [
    { value: 'all', label: '全部' },
    { value: 'today', label: '本日' },
    { value: 'week', label: '本周' },
    { value: 'month', label: '本月' },
    { value: 'year', label: '本年' },
    { value: 'custom', label: '自定义' },
];
const current = computed<Goal>(() => {
    void app.data;
    return rules.state.goals.find((item) => item.id === props.goal.id) ?? props.goal;
});
const automatic = computed(() => !!current.value.tracking);
const summary = computed(() => rules.goalSummary(current.value));
const changes = computed(() => {
    void app.data;
    const goal = current.value;
    if (!goal.tracking) return [];
    return rules.goalGrowthHistory(goal, range.value);
});
const logs = computed<GoalLog[]>(() => {
    void app.data;
    if (current.value.tracking) return [];
    const { from: start, to: end } = range.value;
    return current.value.logs
        .filter((log) => (!start || log.date >= start) && (!end || log.date <= end))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
});
const total = computed(() => (automatic.value ? changes.value.length : logs.value.length));
const pages = computed(() => Math.max(1, Math.ceil(total.value / 12)));
watch(pages, (value) => {
    if (page.value > value) page.value = value;
});
watch([preset, from, to], () => {
    page.value = 1;
    pendingDelete.value = null;
});
const visibleChanges = computed(() => changes.value.slice((page.value - 1) * 12, page.value * 12));
const visibleLogs = computed(() => logs.value.slice((page.value - 1) * 12, page.value * 12));
const pendingLog = computed(() => logs.value.find((log) => log.id === pendingDelete.value));
const labels: Record<string, string> = {
    increase: '提升',
    decrease: '调低',
    changed: '调整',
    added: '新增',
    removed: '移除',
    recorded: '补录',
    cleared: '清空',
};
function signed(value: number) {
    return value > 0 ? '+' + value : String(value);
}
async function removeLog() {
    const id = pendingDelete.value;
    if (!id || app.busy) return;
    error.value = '';
    try {
        await app.execute((domain) => domain.removeGoalProgress(props.goal.id, id));
        pendingDelete.value = null;
        app.notify('进度记录已删除');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal
        :title="(automatic ? '养成记录 · ' : '进度历史 · ') + goal.title"
        wide
        :busy="app.busy"
        @close="emit('close')"
    >
        <p class="history-hint">
            <template v-if="automatic">
                当前 {{ summary.achieved ?? 0 }} / {{ (summary.members ?? []).length }}
                个角色达标 · 以下是角色档案中该项目的养成变更
            </template>
            <template v-else>
                当前
                <NumberValue :value="summary.current" :unit="goal.unit" />
                <template v-if="goal.baseProgress">
                    · 历史基础进度
                    <NumberValue :value="goal.baseProgress" :unit="goal.unit" />
                </template>
            </template>
        </p>
        <div class="history-filters">
            <label class="filter-range">
                日期范围
                <BaseSelect v-model="preset" label="记录日期范围" :options="presetOptions" />
            </label>
            <template v-if="preset === 'custom'">
                <label class="filter-date">
                    开始日期
                    <BaseDate v-model="from" label="开始日期" :max="to || U.today()" />
                </label>
                <label class="filter-date">
                    结束日期
                    <BaseDate v-model="to" label="结束日期" :min="from" :max="U.today()" />
                </label>
            </template>
        </div>
        <section v-if="pendingLog" class="delete-confirm" role="alert">
            <span>
                删除 {{ pendingLog.date }} 的
                <b>{{ signed(pendingLog.delta) }}{{ goal.unit }}</b>
                这条进度？累计进度会重新计算。
            </span>
            <div class="actions">
                <button class="btn compact" :disabled="app.busy" @click="pendingDelete = null">
                    取消
                </button>
                <button class="btn compact danger" :disabled="app.busy" @click="removeLog">
                    {{ app.busy ? '删除中…' : '确认删除' }}
                </button>
            </div>
        </section>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <p class="hint history-count">共 {{ total }} {{ automatic ? '次变更' : '条记录' }}</p>
        <div v-if="!total" class="empty compact-empty">
            <template v-if="automatic">
                暂无该项目的养成变更；首次建档只作为起点，不生成记录。
            </template>
            <template v-else>暂无进度记录，点卡片上的「＋ 记进度」记一笔。</template>
        </div>
        <template v-else-if="automatic">
            <ul class="record-list">
                <li
                    v-for="entry in visibleChanges"
                    :key="entry.id + entry.change.label"
                    class="record-row"
                >
                    <time class="record-date" :datetime="entry.date">{{ entry.date }}</time>
                    <span class="record-character" :title="entry.characterName">
                        {{ entry.characterName }}
                    </span>
                    <span class="record-label">
                        <small>{{ entry.change.group }}</small>
                        {{ entry.change.label }}
                    </span>
                    <span class="record-values">
                        <NumberValue
                            :value="entry.change.from ?? '未记录'"
                            :unit="typeof entry.change.from === 'number' ? entry.change.unit : ''"
                        />
                        <span class="hint">→</span>
                        <NumberValue
                            :value="entry.change.to ?? '未记录'"
                            :unit="typeof entry.change.to === 'number' ? entry.change.unit : ''"
                        />
                    </span>
                    <span
                        class="record-kind"
                        :class="{ positive: entry.change.kind === 'increase' }"
                    >
                        {{ labels[entry.change.kind] || '调整' }}
                    </span>
                    <span class="record-note" :title="entry.note || ''">
                        {{ entry.note || '—' }}
                    </span>
                </li>
            </ul>
        </template>
        <template v-else>
            <ul class="record-list">
                <li v-for="log in visibleLogs" :key="log.id" class="record-row manual">
                    <time class="record-date" :datetime="log.date">{{ log.date }}</time>
                    <span class="record-delta" :class="{ positive: log.delta > 0 }">
                        {{ signed(log.delta) }}
                        <small>{{ goal.unit }}</small>
                    </span>
                    <span class="record-note" :title="log.note || ''">{{ log.note || '—' }}</span>
                    <span class="record-actions">
                        <button
                            class="btn compact"
                            :disabled="app.busy"
                            @click="emit('edit-log', log.id)"
                        >
                            编辑
                        </button>
                        <button
                            class="btn compact danger"
                            :disabled="app.busy"
                            @click="pendingDelete = log.id"
                        >
                            删除
                        </button>
                    </span>
                </li>
            </ul>
        </template>
        <div v-if="total > 12" class="pagination">
            <button class="btn compact" :disabled="page === 1" @click="page--">上一页</button>
            <span>{{ page }} / {{ pages }}</span>
            <button class="btn compact" :disabled="page === pages" @click="page++">下一页</button>
        </div>
        <template #footer="{ close }">
            <p class="hint footer-hint">
                {{
                    automatic
                        ? '跟随档案的目标只能通过更新养成产生记录，原始变更在角色的养成记录里。'
                        : '改一笔历史只影响那一笔，累计进度会自动重算。'
                }}
            </p>
            <button class="btn" @click="close">关闭</button>
        </template>
    </BaseModal>
</template>

<style scoped>
.history-hint {
    margin-bottom: 12px;
    color: var(--muted);
    font-size: 12.5px;
}
.history-filters {
    display: flex;
    align-items: end;
    gap: 12px;
    flex-wrap: wrap;
}
.history-filters label {
    flex: none;
}
.history-filters .filter-range {
    width: 150px;
}
.history-filters .filter-date {
    width: 165px;
}
.delete-confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;
    padding: 9px 11px;
    border: 1px solid #b33a3a40;
    border-radius: 4px;
    background: #b33a3a0a;
    font-size: 12.5px;
}
.history-count {
    margin: 15px 0 6px;
}
.compact-empty {
    min-height: 160px;
    padding: 26px;
}
.record-list {
    padding: 0;
    margin: 0;
    list-style: none;
}
.record-row {
    display: grid;
    grid-template-columns:
        92px minmax(84px, 0.55fr) minmax(140px, 1.2fr)
        minmax(150px, 1fr) 76px minmax(80px, 0.7fr);
    align-items: center;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
}
.record-row.manual {
    grid-template-columns: 92px 96px minmax(0, 1fr) auto;
}
.record-date {
    color: var(--ink);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.record-character {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.record-label {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.record-label small {
    color: var(--muted);
    min-width: 52px;
    font-size: 11.5px;
    flex: none;
}
.record-values {
    display: flex;
    align-items: baseline;
    gap: 5px;
    color: var(--gold);
    white-space: nowrap;
}
.record-delta {
    color: var(--red);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.record-delta.positive {
    color: var(--green);
}
.record-delta small {
    margin-left: 2px;
    font-size: 11px;
    color: var(--muted);
}
.record-kind {
    color: var(--muted);
    font-size: 12px;
    text-align: right;
    white-space: nowrap;
}
.record-kind.positive {
    color: var(--green);
}
.record-note {
    color: var(--muted);
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.record-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
}
.pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
    margin-top: 15px;
}
@media (max-width: 750px) {
    .record-row {
        grid-template-columns: 1fr;
        gap: 5px;
        padding: 9px 0;
    }
    .record-kind {
        text-align: left;
    }
    .record-row.manual {
        grid-template-columns: 1fr auto;
    }
}
</style>
