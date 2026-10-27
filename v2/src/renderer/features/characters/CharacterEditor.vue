<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import { defaultSchool } from '../../game-data/schools.js';
import type { Character } from '../../app/types';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import SkillEditor from './SkillEditor.vue';
const props = defineProps<{ character?: Character }>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const app = useApplication(),
    rules = app.rules();
const progress = plain(rules.normalizeCharacterProgress(props.character?.progress));
const draft = reactive({
    name: props.character?.name || '',
    level: props.character?.level ?? '',
    school: props.character ? props.character.school : defaultSchool,
    server: props.character?.server || '',
    progress,
    changeDate: U.today(),
    changeNote: '',
});
const initial = JSON.stringify(draft),
    invalidEdit = ref(false),
    error = ref('');
const dirty = computed(() => invalidEdit.value || JSON.stringify(draft) !== initial);
const sections = [
    ['basic', '基础信息'],
    ['schoolSkills', '师门技能'],
    ['training', '人物修炼'],
    ['petTraining', '召唤兽修炼'],
    ['auxiliarySkills', '辅助技能'],
    ['growth', '其他养成'],
];
const sectionElements = new Map<string, HTMLElement>();
const activeSection = ref('basic');
let skillSchool = draft.school;
const schoolChoice = ref(false);
watch(
    () => draft.school,
    (school) => {
        schoolChoice.value = school !== skillSchool && draft.progress.schoolSkills.length > 0;
        if (!schoolChoice.value) skillSchool = school;
    },
);
function settleSchool(replace: boolean) {
    if (replace) draft.progress.schoolSkills = rules.fillSchoolSkills(draft.school, []);
    schoolChoice.value = false;
    skillSchool = draft.school;
}
function navigateSection(key: string) {
    activeSection.value = key;
    const section = sectionElements.get(key);
    section?.scrollIntoView({ block: 'start' });
    section?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
}
function captureInput(event: Event) {
    if (event.target instanceof HTMLInputElement && event.target.validity.badInput)
        invalidEdit.value = true;
}
async function save() {
    error.value = '';
    if (app.busy) return;
    if (schoolChoice.value) {
        error.value = '更换门派后，请选择如何处理现有师门技能';
        navigateSection('basic');
        return;
    }
    if (props.character && !draft.changeDate) {
        error.value = '请选择变更日期';
        navigateSection('growth');
        return;
    }
    try {
        const result = (await app.execute((domain) =>
            domain.saveCharacter(
                plain({
                    name: draft.name,
                    level: draft.level,
                    school: draft.school,
                    server: draft.server,
                    progress: draft.progress,
                }),
                props.character?.id,
                { date: draft.changeDate, note: draft.changeNote },
            ),
        )) as Character;
        emit('saved', result.id);
        app.notify(props.character ? '角色档案已保存' : '角色已创建');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
const schoolOptions = computed(() => [
    { value: '', label: '未记录' },
    ...(rules.schools as string[]).map((school) => ({ value: school, label: school })),
    ...(draft.school && !rules.schools.includes(draft.school)
        ? [{ value: draft.school, label: draft.school }]
        : []),
]);
const trainingGroups = [
    {
        key: 'training' as const,
        title: '人物修炼',
        fields: rules.characterTraining as { key: string; label: string }[],
    },
    {
        key: 'petTraining' as const,
        title: '召唤兽修炼',
        fields: rules.petTraining as { key: string; label: string }[],
    },
];
</script>
<template>
    <BaseModal
        :title="character ? '编辑角色档案' : '添加角色'"
        medium
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <template #navigation>
            <nav class="section-nav" aria-label="档案分区">
                <button
                    v-for="[key, title] in sections"
                    :key="key"
                    class="btn compact"
                    :class="{ selected: activeSection === key }"
                    :aria-current="activeSection === key ? 'location' : undefined"
                    :disabled="app.busy"
                    @click="navigateSection(key)"
                >
                    {{ title }}
                </button>
            </nav>
        </template>
        <form id="character-form" @submit.prevent="save" @input="captureInput">
            <fieldset :disabled="app.busy">
                <section
                    :ref="
                        (element) => {
                            if (element) sectionElements.set('basic', element as HTMLElement);
                        }
                    "
                    class="edit-section"
                >
                    <h3 tabindex="-1">基础信息</h3>
                    <div class="form-grid">
                        <label>
                            角色昵称
                            <input
                                v-model="draft.name"
                                name="name"
                                placeholder="如：养老一号"
                                required
                                autofocus
                            />
                        </label>
                        <label>
                            等级
                            <input
                                v-model="draft.level"
                                name="level"
                                type="number"
                                min="0"
                                step="1"
                                :max="Number.MAX_SAFE_INTEGER"
                                placeholder="未记录"
                            />
                        </label>
                        <label>
                            门派
                            <BaseSelect
                                v-model="draft.school"
                                label="门派"
                                :options="schoolOptions"
                                searchable
                            />
                        </label>
                        <label>
                            服务器
                            <input v-model="draft.server" name="server" placeholder="如：紫禁城" />
                        </label>
                    </div>
                    <div
                        v-if="schoolChoice"
                        class="school-choice"
                        role="group"
                        aria-label="更换门派后的技能处理"
                    >
                        <p>请选择如何处理现有师门技能。</p>
                        <div class="actions">
                            <button type="button" class="btn" @click="settleSchool(false)">
                                保留现有技能
                            </button>
                            <button type="button" class="btn" @click="settleSchool(true)">
                                {{
                                    rules.schoolSkillNames[draft.school]
                                        ? '替换为新门派技能'
                                        : '清空师门技能'
                                }}
                            </button>
                        </div>
                    </div>
                </section>
                <section
                    :ref="
                        (element) => {
                            if (element)
                                sectionElements.set('schoolSkills', element as HTMLElement);
                        }
                    "
                    class="edit-section"
                >
                    <div class="section-heading">
                        <h3 tabindex="-1">师门技能</h3>
                        <button
                            type="button"
                            class="btn compact"
                            :disabled="schoolChoice"
                            @click="
                                draft.progress.schoolSkills = rules.fillSchoolSkills(
                                    draft.school,
                                    draft.progress.schoolSkills,
                                )
                            "
                        >
                            补齐门派技能
                        </button>
                    </div>
                    <SkillEditor v-model="draft.progress.schoolSkills" />
                </section>
                <div class="training-grid">
                    <section
                        v-for="group in trainingGroups"
                        :key="group.key"
                        :ref="
                            (element) => {
                                if (element) sectionElements.set(group.key, element as HTMLElement);
                            }
                        "
                        class="edit-section"
                    >
                        <h3 tabindex="-1">{{ group.title }}</h3>
                        <div class="form-grid stack">
                            <label v-for="field in group.fields" :key="field.key">
                                {{ field.label }}
                                <input
                                    v-model="draft.progress[group.key][field.key]"
                                    type="number"
                                    min="0"
                                    step="1"
                                    :max="Number.MAX_SAFE_INTEGER"
                                    placeholder="未记录"
                                />
                            </label>
                        </div>
                    </section>
                </div>
                <section
                    :ref="
                        (element) => {
                            if (element)
                                sectionElements.set('auxiliarySkills', element as HTMLElement);
                        }
                    "
                    class="edit-section"
                >
                    <h3 tabindex="-1">辅助技能</h3>
                    <SkillEditor
                        v-model="draft.progress.auxiliarySkills"
                        auxiliary
                        :suggestions="rules.auxiliarySkillNames"
                    />
                </section>
                <section
                    :ref="
                        (element) => {
                            if (element) sectionElements.set('growth', element as HTMLElement);
                        }
                    "
                    class="edit-section"
                >
                    <h3 tabindex="-1">其他养成</h3>
                    <div class="form-grid">
                        <label>
                            乾元丹个数
                            <input
                                v-model="draft.progress.qianyuanPills"
                                type="number"
                                min="0"
                                step="1"
                                :max="Number.MAX_SAFE_INTEGER"
                                placeholder="未记录"
                            />
                        </label>
                        <label>
                            潜能果个数
                            <input
                                v-model="draft.progress.potentialFruits"
                                type="number"
                                min="0"
                                step="1"
                                :max="Number.MAX_SAFE_INTEGER"
                                placeholder="未记录"
                            />
                        </label>
                        <label class="full">
                            养成备注
                            <textarea
                                v-model="draft.progress.note"
                                rows="3"
                                placeholder="经脉流派、坐骑成长、机缘等"
                            />
                        </label>
                        <template v-if="character">
                            <label>
                                变更日期
                                <BaseDate
                                    v-model="draft.changeDate"
                                    label="变更日期"
                                    :max="U.today()"
                                />
                            </label>
                            <label>
                                本次变更说明
                                <input v-model="draft.changeNote" placeholder="仅随本次变化保存" />
                            </label>
                        </template>
                    </div>
                </section>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <span class="hint footer-hint">留空表示未记录，填写 0 表示已确认的零值。</span>
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="character-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : '保存档案' }}
            </button>
        </template>
    </BaseModal>
</template>
