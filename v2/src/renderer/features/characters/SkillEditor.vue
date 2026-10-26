<script setup lang="ts">
import type { Skill } from '../../app/types';
const skills = defineModel<Skill[]>({ required: true });
defineProps<{ auxiliary?: boolean; suggestions?: string[] }>();
const keys = new WeakMap<Skill, number>();
let sequence = 0;
function key(skill: Skill) {
    if (!keys.has(skill)) keys.set(skill, sequence++);
    return keys.get(skill);
}
function move(index: number, offset: number) {
    const list = skills.value;
    if (index + offset < 0 || index + offset >= list.length) return;
    [list[index], list[index + offset]] = [list[index + offset], list[index]];
}
</script>
<template>
    <div class="skill-editor">
        <div v-if="!skills.length" class="hint">尚未填写技能，可添加或补齐门派技能。</div>
        <div class="skill-rows">
            <div v-for="(skill, index) in skills" :key="key(skill)" class="skill-row">
                <input
                    v-model="skill.name"
                    :list="auxiliary ? 'auxiliary-suggestions' : undefined"
                    :aria-label="(auxiliary ? '辅助' : '师门') + '技能名称 ' + (index + 1)"
                    placeholder="技能名称"
                    required
                />
                <input
                    v-model="skill.level"
                    type="number"
                    min="0"
                    step="1"
                    :max="Number.MAX_SAFE_INTEGER"
                    :aria-label="(skill.name || '技能') + '等级'"
                    placeholder="未记录"
                />
                <div class="actions">
                    <button
                        type="button"
                        class="btn compact"
                        :disabled="index === 0"
                        aria-label="前移此技能"
                        @click="move(index, -1)"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        class="btn compact"
                        :disabled="index === skills.length - 1"
                        aria-label="后移此技能"
                        @click="move(index, 1)"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        class="btn compact danger"
                        aria-label="移除此技能"
                        @click="skills.splice(index, 1)"
                    >
                        移除
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
