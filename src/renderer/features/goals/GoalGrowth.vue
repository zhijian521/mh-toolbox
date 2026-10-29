<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { Goal, GoalMember } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';

/**
 * 批量更新养成。
 *
 * 一次提交写入各角色档案里的同一个养成项，并生成对应的养成记录；不是另存一份
 * 「目标进度」——目标只是档案的另一种视图。所以这里填的是角色当前的实际值，
 * 而不是增量，留空表示该项未记录。
 */
const props = defineProps<{ goal: Goal }>();
const emit = defineEmits<{ close: [] }>();
const app = useApplication();
const rules = app.rules();
const members = computed<GoalMember[]>(() => {
    void app.data;
    const current = rules.state.goals.find((item) => item.id === props.goal.id);
    return current ? (rules.goalSummary(current).members ?? []) : [];
});
/** 未达标的排前面，和卡片的顺序一致。 */
const ordered = computed(() => [...members.value].sort((a, b) => Number(a.done) - Number(b.done)));
const values = reactive<Record<string, number | string>>(
    Object.fromEntries(ordered.value.map((member) => [member.id, member.value ?? ''])),
);
const date = ref(U.today()),
    note = ref(''),
    error = ref('');
const initial = JSON.stringify({ values: { ...values }, date: date.value, note: note.value });
const dirty = computed(
    () => JSON.stringify({ values: { ...values }, date: date.value, note: note.value }) !== initial,
);
/**
 * 只有真正改了数值才能保存。
 *
 * 日期与说明是随变更一起写进养成记录的，单独改它们没有落点；而领域在没有值变化时
 * 会抛「没有需要更新的进度」。因此禁用条件看值，关窗提醒仍看整张表单（`dirty`）。
 */
const valueChanged = computed(() =>
    ordered.value.some((member) => {
        const input = values[member.id];
        const current = member.value;
        // 清空表示「未记录」，与原本就未记录不同。
        if (input === '' || input === null || input === undefined) return current !== null;
        // 从「未记录」变成明确的 0 也是变更，不能按数值相等跳过。
        if (current === null) return true;
        return Number(input) !== Number(current);
    }),
);
const metricLabel = computed(() => rules.goalMetricLabel(props.goal.tracking!));
async function save() {
    if (app.busy) return;
    error.value = '';
    try {
        const count = await app.execute((domain) =>
            domain.saveGoalGrowth(
                props.goal.id,
                { ...values },
                { date: date.value, note: note.value },
            ),
        );
        const current = rules.state.goals.find((item) => item.id === props.goal.id);
        const finished = current ? rules.goalSummary(current).status === 'done' : false;
        app.notify('已更新 ' + count + ' 个角色' + (finished ? '，目标已达成' : ''));
        emit('close');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal title="更新养成" wide :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="hint growth-hint">
            更新「{{
                metricLabel
            }}」：填角色当前的实际等级或数量，一次保存到角色档案并生成养成记录。留空表示未记录。
        </p>
        <form id="goal-growth-form" @submit.prevent="save">
            <fieldset :disabled="app.busy">
                <div class="form-grid stack">
                    <label v-for="member in ordered" :key="member.id">
                        <span class="member-label">
                            {{ member.name }}
                            <small v-if="member.done" class="positive">已达标</small>
                            <small v-else-if="member.value !== null">
                                还差 {{ member.remaining }}{{ goal.unit }}
                            </small>
                            <small v-else class="muted">待补录</small>
                        </span>
                        <BaseNumber
                            v-model="values[member.id]"
                            :name="'member-' + member.id"
                            placeholder="未记录"
                            :min="0"
                            :step="1"
                        />
                    </label>
                    <label>
                        变更日期
                        <BaseDate v-model="date" label="变更日期" :max="U.today()" required />
                    </label>
                    <label>
                        本次说明
                        <input v-model="note" name="note" placeholder="选填，如：周末统一补强身" />
                    </label>
                </div>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <span class="hint footer-hint">
                目标 {{ goal.target }}{{ goal.unit }} · 共 {{ members.length }} 个角色
            </span>
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button
                class="btn primary"
                type="submit"
                form="goal-growth-form"
                :disabled="app.busy || !members.length || !valueChanged"
            >
                {{ app.busy ? '保存中…' : '保存进度' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.growth-hint {
    margin-bottom: 14px;
    font-size: 12.5px;
}
.member-label {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.member-label small {
    font-size: 11.5px;
}
.member-label small.muted {
    color: color-mix(in srgb, var(--muted) 78%, var(--paper));
}
</style>
