<script setup lang="ts">
import { computed, ref } from 'vue';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import NumberStepper from '../../components/NumberStepper.vue';
import NumberValue from '../../components/NumberValue.vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
const props = defineProps<{
    id: string;
    category: string;
    metricKey: string;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication(),
    rules = app.rules();
const character = rules.charById(props.id);
const metric = rules.characterProgressMetric(character, props.category, props.metricKey);
const value = ref<number | string | null>(metric.value),
    date = ref(U.today()),
    note = ref(''),
    error = ref(''),
    invalidEdit = ref(false);
const initial = JSON.stringify([value.value, date.value, note.value]);
const dirty = computed(
    () => invalidEdit.value || initial !== JSON.stringify([value.value, date.value, note.value]),
);
const parsed = computed(() => rules.characterNumber(value.value));
/** 非法数字只在当次输入成立，每次重算，避免清空后仍被判为「有未保存修改」。 */
function markInvalid(event: Event) {
    invalidEdit.value = event.target instanceof HTMLInputElement && event.target.validity.badInput;
}
async function save() {
    if (app.busy) return;
    error.value = '';
    if (!date.value) {
        error.value = '请选择变更日期';
        return;
    }
    try {
        await app.execute((domain) =>
            domain.saveCharacterValue(props.id, props.category, props.metricKey, value.value, {
                date: date.value,
                note: note.value,
            }),
        );
        emit('saved');
        app.notify('已保存');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal :title="metric.label" :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <form id="quick-form" @submit.prevent="save">
            <fieldset :disabled="app.busy">
                <p class="quick-context">
                    <span>{{ character?.name }}</span>
                    <span class="quick-context-separator" aria-hidden="true">·</span>
                    <span>{{ metric.group }}</span>
                    <span class="quick-context-separator" aria-hidden="true">·</span>
                    <span class="quick-context-current">
                        当前
                        <NumberValue :value="metric.value" :unit="metric.unit" />
                    </span>
                </p>
                <NumberStepper
                    v-model="value"
                    name="value"
                    :unit="metric.unit"
                    placeholder="未记录"
                    autofocus
                    @invalid="markInvalid"
                />
                <p class="quick-preview">
                    <span class="quick-preview-label">修改后：</span>
                    <NumberValue :value="metric.value" :unit="metric.unit" />
                    <span class="quick-preview-arrow">→</span>
                    <NumberValue :value="parsed" :unit="metric.unit" />
                </p>
                <details>
                    <summary>补充信息</summary>
                    <div class="form-grid stack">
                        <label>
                            变更日期
                            <BaseDate v-model="date" label="变更日期" :max="U.today()" />
                        </label>
                        <label>
                            本次说明
                            <input v-model="note" placeholder="选填" />
                        </label>
                    </div>
                </details>
            </fieldset>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" form="quick-form" type="submit" :disabled="app.busy">
                {{ app.busy ? '保存中…' : '保存' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.quick-context {
    display: flex;
    align-items: baseline;
    justify-content: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
    padding-bottom: 10px;
    color: var(--muted);
    font-size: 13px;
    text-align: center;
}
.quick-context-separator {
    color: var(--line-2);
}
.quick-context-current {
    color: var(--ink);
}
.quick-context-current :deep(.number-value b) {
    color: var(--gold);
}
.quick-preview {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    padding: 8px 0 12px;
    color: var(--gold);
    text-align: center;
}
.quick-preview-arrow {
    margin: 0 6px;
    color: var(--muted);
}
</style>
