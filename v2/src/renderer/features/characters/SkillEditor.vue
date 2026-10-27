<script setup lang="ts">
import type { Skill } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import { useDragSort } from '../../components/drag-sort';
const skills = defineModel<Skill[]>({ required: true });
defineProps<{ auxiliary?: boolean; suggestions?: string[] }>();
const keys = new WeakMap<Skill, string>();
let sequence = 0;
function key(skill: Skill) {
    if (!keys.has(skill)) keys.set(skill, 'skill-' + sequence++);
    return keys.get(skill)!;
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
    <div class="skill-editor" @dragend="sort.end()" @drop="sort.end()">
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
                    required
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
                        @click="skills.splice(index, 1)"
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
        <button type="button" class="btn compact" @click="skills.push({ name: '', level: null })">
            ＋ 添加技能
        </button>
    </div>
</template>
