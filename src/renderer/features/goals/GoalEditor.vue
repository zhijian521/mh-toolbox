<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { Goal, GoalType } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';

/**
 * 新建 / 编辑目标。
 *
 * 表单随类型切换收放字段，而不是显示一堆「对本类型无效」的输入框：
 *   - 养成目标 + 跟随角色档案 → 选分类、选具体项目，数值是「每个角色的目标」；
 *   - 其余组合 → 数值是「累计目标」，单位自己填。
 * 收放逻辑与领域校验保持一致：`saveGoal` 只接受合法的组合，界面提前把不合法的
 * 字段藏起来，用户不会填到一半才被拒绝。
 */
const props = defineProps<{ goal?: Goal }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const app = useApplication();
const rules = app.rules();

const automaticSource = props.goal ? !!props.goal.tracking : true;
const draft = reactive({
    type: (props.goal?.type ?? 'progress') as GoalType,
    characterId: props.goal?.characterId ?? 'all',
    source: (automaticSource ? 'character' : 'manual') as 'character' | 'manual',
    category: props.goal?.tracking?.category ?? 'auxiliarySkills',
    metricKey: props.goal?.tracking?.key ?? '',
    target: (props.goal?.target ?? 120) as number | string,
    unit: props.goal?.unit ?? '级',
    deadline: props.goal?.deadline ?? '',
    // 标题等于自动生成的默认值时不预填，让占位提示继续充当「留空即自动」。
    title:
        props.goal && props.goal.title !== rules.goalDefaultTitle(props.goal)
            ? props.goal.title
            : '',
    note: props.goal?.note ?? '',
});
// 新目标先落到第一个可用项目上，否则下拉停在下拉占位、「具体项目」会被领域拒绝。
if (!draft.metricKey)
    draft.metricKey = rules.goalMetricOptions(draft.category, draft.characterId)[0]?.v ?? '';
const initial = JSON.stringify(draft);
const invalidEdit = ref(false),
    error = ref('');
const dirty = computed(() => invalidEdit.value || JSON.stringify(draft) !== initial);
const automatic = computed(() => draft.type === 'progress' && draft.source === 'character');
const metric = computed(() => rules.growthCategory(draft.category));
const showSource = computed(() => draft.type === 'progress');
const showMetricKey = computed(
    () => automatic.value && ['skills', 'training'].includes(metric.value?.kind ?? ''),
);
const hasCharacters = computed(() => app.characters.length > 0);

const typeOptions = computed(() =>
    rules.goalTypes.map((item) => ({ value: item.v, label: item.t })),
);
const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((character) => ({ value: character.id, label: character.name })),
]);
const sourceOptions = [
    { value: 'character', label: '跟随角色档案' },
    { value: 'manual', label: '手动累计' },
];
const categoryOptions = computed(() =>
    rules.goalMetrics.map((item) => ({ value: item.v, label: item.t })),
);
const metricOptions = computed(() => {
    const options = rules
        .goalMetricOptions(draft.category, draft.characterId)
        .map((item) => ({ value: item.v, label: item.t }));
    // 换过门派或删过技能后，原目标的项目可能已不在名单里；补回去，避免下拉悄悄跳到首项。
    const saved = props.goal?.tracking;
    if (
        saved?.category === draft.category &&
        saved.key &&
        !options.some((item) => item.value === saved.key)
    )
        options.push({ value: saved.key, label: saved.key });
    return options.length ? options : [{ value: '', label: '请先在角色档案中添加技能' }];
});
watch([() => draft.category, () => draft.characterId], () => {
    const options = metricOptions.value;
    if (!options.some((item) => item.value === draft.metricKey))
        draft.metricKey = options[0]?.value ?? '';
});
// 单位跟着类型走：跟随档案时用指标自带单位，切到手动的存钱 / 装备时给常见默认值。
watch([automatic, () => draft.type, metric], () => {
    draft.unit = automatic.value
        ? (metric.value?.unit ?? '级')
        : draft.type === 'progress'
          ? '级'
          : '万';
});
const previewTitle = computed(() => {
    try {
        return rules.goalDefaultTitle({
            characterId: draft.characterId,
            type: draft.type,
            target: Number(draft.target) || 0,
            unit: draft.unit,
            tracking: automatic.value ? { category: draft.category, key: draft.metricKey } : null,
        });
    } catch {
        return '';
    }
});
const preview = computed(() => {
    const unit = draft.unit ?? '';
    const target = draft.target === '' ? '—' : draft.target;
    let text: string;
    if (automatic.value) {
        const probe = {
            ...(props.goal ?? ({} as Goal)),
            characterId: draft.characterId,
            target: Number(draft.target) || 0,
            unit,
            tracking: { category: draft.category, key: draft.metricKey },
        };
        const summary = rules.goalSummary(probe);
        text =
            '每个角色分别达到 ' +
            target +
            unit +
            ' · 当前 ' +
            (summary.achieved ?? 0) +
            ' / ' +
            (summary.members ?? []).length +
            ' 个已达标' +
            (summary.unknown ? '，' + summary.unknown + ' 个待补录' : '') +
            '。保存角色档案后自动更新。';
    } else {
        text = '由适用角色共同累计到 ' + target + unit + '，通过「记进度」记录每次变化。';
    }
    if (draft.characterId === 'all' && automatic.value) text += ' 全部角色包含后续新增角色。';
    if (automatic.value && props.goal?.logs.length)
        text += ' 原手动进度保留，跟随模式不累计手动记录。';
    return text;
});
/** `badInput` 只在数字框里打了非法内容时为真；每次输入重算，清空后不再算脏。 */
function captureInput(event: Event) {
    const form = event.currentTarget;
    if (!(form instanceof HTMLElement)) return;
    invalidEdit.value = [...form.querySelectorAll('input')].some(
        (input) => input.validity.badInput,
    );
}
async function save() {
    if (app.busy) return;
    error.value = '';
    try {
        const saved = await app.execute((domain) =>
            domain.saveGoal(
                plain({
                    type: draft.type,
                    characterId: draft.characterId,
                    target: Number(draft.target),
                    unit: draft.unit,
                    deadline: draft.deadline,
                    title: draft.title,
                    note: draft.note,
                    tracking: automatic.value
                        ? { category: draft.category, key: draft.metricKey }
                        : null,
                }),
                props.goal?.id,
            ),
        );
        emit('saved', saved.id);
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal
        :title="goal ? '编辑目标' : '新建目标'"
        medium
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <p v-if="!hasCharacters" class="hint no-character">
            还没有角色档案。目标需要挂在角色上，请先在「角色」页添加至少一个角色。
        </p>
        <form id="goal-form" @submit.prevent="save" @input="captureInput">
            <fieldset :disabled="app.busy || !hasCharacters">
                <div class="form-grid">
                    <label>
                        目标类型
                        <BaseSelect v-model="draft.type" label="目标类型" :options="typeOptions" />
                    </label>
                    <label>
                        适用角色
                        <BaseSelect
                            v-model="draft.characterId"
                            label="适用角色"
                            :options="characterOptions"
                        />
                    </label>
                    <label v-if="showSource">
                        进度来源
                        <BaseSelect
                            v-model="draft.source"
                            label="进度来源"
                            :options="sourceOptions"
                        />
                    </label>
                    <label v-if="automatic">
                        养成分类
                        <BaseSelect
                            v-model="draft.category"
                            label="养成分类"
                            :options="categoryOptions"
                        />
                    </label>
                    <label v-if="showMetricKey">
                        具体项目
                        <BaseSelect
                            v-model="draft.metricKey"
                            label="具体项目"
                            :options="metricOptions"
                            searchable
                        />
                    </label>
                    <label>
                        {{ automatic ? '每个角色的目标' : '累计目标数值' }}
                        <BaseNumber
                            v-model="draft.target"
                            name="target"
                            :min="0"
                            :step="automatic ? 1 : 0.1"
                        />
                    </label>
                    <label v-if="!automatic">
                        单位
                        <input v-model="draft.unit" name="unit" placeholder="如：万、元、级、个" />
                    </label>
                    <label>
                        期望完成日期
                        <BaseDate v-model="draft.deadline" label="期望完成日期" />
                    </label>
                    <p class="goal-preview full" aria-live="polite">
                        {{ preview }}
                        <span v-if="!automatic && draft.characterId === 'all'">
                            全部角色共同累计，不按角色数相乘。
                        </span>
                    </p>
                    <label class="full">
                        目标名称
                        <input
                            v-model="draft.title"
                            name="title"
                            :placeholder="previewTitle || '留空自动生成'"
                        />
                    </label>
                    <label class="full">
                        备注
                        <textarea v-model="draft.note" name="note" rows="2" placeholder="选填" />
                    </label>
                </div>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <span class="hint footer-hint">留空的目标名称会按角色、项目与数值自动生成。</span>
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button
                class="btn primary"
                type="submit"
                form="goal-form"
                :disabled="app.busy || !hasCharacters"
            >
                {{ app.busy ? '保存中…' : goal ? '保存目标' : '创建目标' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.no-character {
    margin-bottom: 12px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
    font-size: 12.5px;
}
.goal-preview {
    padding: 9px 11px;
    border-radius: 4px;
    background: var(--paper-2);
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.7;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
