<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import { defaultSchool } from '../../game-data/schools.js';
import type { Character, Skill } from '../../app/types';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import SkillEditor from './SkillEditor.vue';
import { useSectionNav } from '../../components/section-nav';
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
] as const;
const nav = useSectionNav(sections.map(([key]) => key));
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
// badInput 只在「数字框里打了非法内容」时为真；每次输入重算一次，
// 否则用户把那格清空后 dirty 仍然是 true，关窗时白问一次「放弃未保存的修改」。
function captureInput(event: Event) {
    const form = event.currentTarget;
    if (!(form instanceof HTMLElement)) return;
    invalidEdit.value = [...form.querySelectorAll('input')].some(
        (input) => input.validity.badInput,
    );
}
async function save() {
    error.value = '';
    if (app.busy) return;
    if (schoolChoice.value) {
        error.value = '更换门派后，请选择如何处理现有师门技能';
        nav.go('basic');
        return;
    }
    if (props.character && !draft.changeDate) {
        error.value = '请选择变更日期';
        nav.go('growth');
        return;
    }
    /*
     * 技能行先在这里收拾干净，不靠 `required` 拦。
     *
     * 名称框挂 `required` 时，点「保存」会被原生校验悄悄拦下（表单的 submit 根本不触发），
     * 页面自己的错误区一个字都不显示，而报错气泡多半指向已经滚出视野的那一行——表现就是
     * 「点了没反应」。现在：只填了等级没填名称的行明确报错；什么都没填的空行直接丢掉。
     */
    const filled = (/** @type {Skill[]} */ list: Skill[]) =>
        list.filter((skill) => String(skill.name || '').trim());
    const nameless = [...draft.progress.schoolSkills, ...draft.progress.auxiliarySkills].filter(
        (skill) => !String(skill.name || '').trim() && skill.level != null && skill.level !== '',
    );
    if (nameless.length) {
        error.value = '技能行请补上名称，或删掉只填了等级的那一行';
        nav.go('schoolSkills');
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
                    progress: {
                        ...draft.progress,
                        schoolSkills: filled(draft.progress.schoolSkills),
                        auxiliarySkills: filled(draft.progress.auxiliarySkills),
                    },
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
                    :class="{ selected: nav.active === key }"
                    :aria-current="nav.active === key ? 'location' : undefined"
                    :disabled="app.busy"
                    @click="nav.go(key)"
                >
                    {{ title }}
                </button>
            </nav>
        </template>
        <form id="character-form" @submit.prevent="save" @input="captureInput">
            <fieldset :disabled="app.busy">
                <section :ref="nav.register('basic')" class="edit-section">
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
                            <BaseNumber v-model="draft.level" name="level" placeholder="未记录" />
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
                <section :ref="nav.register('schoolSkills')" class="edit-section">
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
                        :ref="nav.register(group.key)"
                        class="edit-section"
                    >
                        <h3 tabindex="-1">{{ group.title }}</h3>
                        <div class="form-grid stack">
                            <label v-for="field in group.fields" :key="field.key">
                                {{ field.label }}
                                <BaseNumber
                                    v-model="draft.progress[group.key][field.key]"
                                    placeholder="未记录"
                                />
                            </label>
                        </div>
                    </section>
                </div>
                <section :ref="nav.register('auxiliarySkills')" class="edit-section">
                    <h3 tabindex="-1">辅助技能</h3>
                    <SkillEditor
                        v-model="draft.progress.auxiliarySkills"
                        auxiliary
                        :suggestions="rules.auxiliarySkillNames"
                    />
                </section>
                <section :ref="nav.register('growth')" class="edit-section">
                    <h3 tabindex="-1">其他养成</h3>
                    <div class="form-grid">
                        <label>
                            乾元丹个数
                            <BaseNumber
                                v-model="draft.progress.qianyuanPills"
                                placeholder="未记录"
                            />
                        </label>
                        <label>
                            潜能果个数
                            <BaseNumber
                                v-model="draft.progress.potentialFruits"
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

<style scoped>
.edit-section {
    margin-bottom: 28px;
    scroll-margin-top: 12px;
}
.edit-section:last-child {
    margin-bottom: 0;
}
.edit-section h3 {
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.edit-section h3:before {
    content: '';
    width: 3px;
    height: 14px;
    background: var(--red);
    flex: none;
}
.section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    gap: 10px;
}
.section-heading h3 {
    margin-bottom: 0;
}
.section-nav {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 0 20px 14px;
    flex: none;
}
.section-nav .btn {
    background: transparent;
}
.training-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
    align-items: start;
}
.school-choice {
    border: 1px solid var(--line-2);
    background: var(--paper-2);
    padding: 12px;
    margin-top: 15px;
    border-radius: 3px;
}
.school-choice .actions {
    margin-top: 10px;
}
.form-error {
    margin-top: 20px;
    padding: 10px;
    background: var(--paper-2);
    border: 1px solid color-mix(in srgb, var(--red) 33%, transparent);
    border-radius: 3px;
    /* 基座那条 .form-error 把字号压到 13px，这里是带底纹的盒子，沿用全局 13.5px 才和正文齐。 */
    font-size: 13.5px;
}
@media (max-width: 750px) {
    .training-grid {
        grid-template-columns: 1fr;
    }
}
</style>
