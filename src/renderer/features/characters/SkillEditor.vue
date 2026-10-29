<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { Skill } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import { useDragSort } from '../../components/drag-sort';
const skills = defineModel<Skill[]>({ required: true });
defineProps<{ auxiliary?: boolean; suggestions?: string[] }>();
const root = ref<HTMLElement>(),
    addButton = ref<HTMLButtonElement>();
const keys = new WeakMap<Skill, string>();
let sequence = 0;
function key(skill: Skill) {
    if (!keys.has(skill)) keys.set(skill, 'skill-' + sequence++);
    return keys.get(skill)!;
}
/* 增删技能后把焦点留在这一组操作里：新行直接进入名称框，删行落到相邻行的「移除」。 */
async function addSkill() {
    skills.value.push({ name: '', level: null });
    await nextTick();
    const inputs = root.value?.querySelectorAll<HTMLInputElement>(
        '.skill-row input:not([type="number"])',
    );
    inputs?.[inputs.length - 1]?.focus();
}
async function removeSkill(index: number) {
    skills.value.splice(index, 1);
    await nextTick();
    const buttons = root.value?.querySelectorAll<HTMLButtonElement>('.skill-row button.danger');
    (buttons?.[Math.min(index, buttons.length - 1)] ?? addButton.value)?.focus();
}
/* 技能行按从左到右、从上到下的顺序排列，落位判定取横向中点。 */
const sort = useDragSort({
    keys: () => skills.value.map(key),
    axis: 'x',
    onMove: ({ from, to }) => {
        const list = skills.value,
            [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
    },
});
</script>
<template>
    <div ref="root" class="skill-editor" @dragend="sort.end()" @drop="sort.end()">
        <div v-if="!skills.length" class="hint">尚未填写技能，可添加或补齐门派技能。</div>
        <div class="skill-rows">
            <div
                v-for="(skill, index) in skills"
                :key="key(skill)"
                class="skill-row"
                :class="sort.state(key(skill))"
                @dragover="sort.over(key(skill), $event)"
                @drop.stop="sort.drop($event, key(skill))"
            >
                <input
                    v-model="skill.name"
                    :list="auxiliary ? 'auxiliary-suggestions' : undefined"
                    :aria-label="(auxiliary ? '辅助' : '师门') + '技能名称 ' + (index + 1)"
                    placeholder="技能名称"
                />
                <BaseNumber
                    v-model="skill.level"
                    :aria-label="(skill.name || '技能') + '等级'"
                    placeholder="未记录"
                />
                <div class="actions">
                    <button
                        type="button"
                        class="btn compact danger"
                        aria-label="移除此技能"
                        @click="removeSkill(index)"
                    >
                        移除
                    </button>
                    <button
                        type="button"
                        class="icon-button drag-handle"
                        draggable="true"
                        :aria-label="'拖动排序第 ' + (index + 1) + ' 项技能，或用方向键前后移动'"
                        title="拖动排序，或用方向键前后移动"
                        @dragstart="sort.start(key(skill), $event)"
                        @dragend="sort.end()"
                        @keydown.left.prevent="sort.moveBy(key(skill), -1)"
                        @keydown.up.prevent="sort.moveBy(key(skill), -1)"
                        @keydown.right.prevent="sort.moveBy(key(skill), 1)"
                        @keydown.down.prevent="sort.moveBy(key(skill), 1)"
                    >
                        <AppIcon name="grip" :size="14" />
                    </button>
                </div>
            </div>
        </div>
        <datalist v-if="auxiliary" id="auxiliary-suggestions">
            <option v-for="name in suggestions" :key="name" :value="name" />
        </datalist>
        <button ref="addButton" type="button" class="btn compact" @click="addSkill">
            ＋ 添加技能
        </button>
    </div>
</template>

<style scoped>
.skill-editor {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
}
.skill-rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 20px;
    width: 100%;
}
.skill-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(60px, 1fr) 76px auto;
    gap: 6px;
    align-items: center;
    min-width: 0;
}
.skill-row .actions {
    gap: 3px;
    flex-wrap: nowrap;
}
.skill-row .drag-handle {
    width: 22px;
    height: 27px;
    border-radius: 3px;
    color: var(--line-2);
}
.skill-row .drag-handle:hover:not(:disabled) {
    color: var(--gold);
    border-color: var(--line-2);
    background: var(--paper-2);
}
.skill-row input {
    padding: 6px;
}
/* BaseNumber 是子组件，需要 :deep() 才能命中其内部 input。 */
.skill-row :deep(.number-field) > input {
    padding: 6px 22px 6px 6px;
}
/* 技能行从左到右排列，插入提示改为竖向细线，落在行间空隙里。 */
.skill-row.drop-before:before,
.skill-row.drop-after:after {
    top: 2px;
    bottom: 2px;
    left: auto;
    right: auto;
    width: 2px;
    height: auto;
}
.skill-row.drop-before:before {
    left: -10px;
}
.skill-row.drop-after:after {
    right: -10px;
}
@media (max-width: 1150px) {
    .skill-rows {
        grid-template-columns: 1fr;
    }
}
</style>
