<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { Goal } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import NumberValue from '../../components/NumberValue.vue';

/**
 * 手动累计目标的进度录入：记一笔变化，或编辑已有的一笔。
 *
 * 记的是增量而不是绝对值——存钱、装备这类目标的进度是流水累加的结果，改一笔历史
 * 应该只影响那一笔。最低进度由领域层夹在 0，这里只提示「正数增加、负数减少」。
 */
const props = defineProps<{ goal: Goal; logId?: string }>();
const emit = defineEmits<{ close: [] }>();
const app = useApplication();
const rules = app.rules();
const editing = computed(() => props.goal.logs.find((log) => log.id === props.logId));
const draft = reactive({
    date: editing.value?.date ?? U.today(),
    delta: (editing.value?.delta ?? '') as number | string,
    note: editing.value?.note ?? '',
});
const initial = JSON.stringify(draft);
const invalidEdit = ref(false),
    error = ref('');
const dirty = computed(() => invalidEdit.value || JSON.stringify(draft) !== initial);
const current = computed(() => {
    void app.data;
    const goal = rules.state.goals.find((item) => item.id === props.goal.id);
    return goal ? rules.goalSummary(goal).current : props.goal.current;
});
const unit = computed(() => props.goal.unit || '万');
/**
 * 空着提交会写入一条 `delta: 0` 的记录：`Number('') === 0` 能通过领域的有限数校验，
 * 进度历史里就多出一条「+0」。领域规则保持与 V1 一致，不在那里加校验，改由表单拦住。
 */
const ready = computed(() => draft.delta !== '' && draft.delta !== null);
function captureInput(event: Event) {
    const form = event.currentTarget;
    if (!(form instanceof HTMLElement)) return;
    invalidEdit.value = [...form.querySelectorAll('input')].some(
        (input) => input.validity.badInput,
    );
}
async function save() {
    if (app.busy) return;
    // 回车提交绕过按钮的禁用态，这里再拦一次。
    if (!ready.value) {
        error.value = '请填写进度变化';
        return;
    }
    error.value = '';
    try {
        await app.execute((domain) =>
            domain.saveGoalProgress(
                props.goal.id,
                plain({ date: draft.date, delta: Number(draft.delta), note: draft.note }),
                props.logId,
            ),
        );
        app.notify(editing.value ? '进度记录已更新' : '进度已更新');
        emit('close');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal
        :title="(editing ? '编辑进度 · ' : '记进度 · ') + goal.title"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <p class="progress-current">
            当前进度
            <NumberValue :value="current" :unit="unit" />
            <span class="hint">/ {{ goal.target }}{{ unit }}</span>
        </p>
        <form id="goal-progress-form" @submit.prevent="save" @input="captureInput">
            <fieldset :disabled="app.busy">
                <div class="form-grid">
                    <label>
                        日期
                        <BaseDate v-model="draft.date" label="进度日期" :max="U.today()" required />
                    </label>
                    <label>
                        进度变化（{{ unit }}）
                        <!-- 存钱 / 装备目标的进度常带小数，step 不写默认是 1，250.5 会被浏览器判为非法而拦下提交。 -->
                        <BaseNumber v-model="draft.delta" name="delta" :min="-999999" :step="0.1" />
                    </label>
                    <label class="full">
                        备注
                        <input v-model="draft.note" name="note" placeholder="如：本月捉鬼净收益" />
                    </label>
                </div>
            </fieldset>
            <p class="hint delta-hint">正数增加、负数减少；累计进度最低为 0。</p>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button
                class="btn primary"
                type="submit"
                form="goal-progress-form"
                :disabled="app.busy || !ready"
            >
                {{ app.busy ? '保存中…' : editing ? '保存记录' : '记入' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.progress-current {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 14px;
    font-size: 13px;
    color: var(--gold);
}
.progress-current .hint {
    color: var(--muted);
    font-size: 12px;
}
.delta-hint {
    margin-top: 10px;
    font-size: 12px;
}
.form-error {
    margin-top: 10px;
    font-size: 13px;
}
</style>
