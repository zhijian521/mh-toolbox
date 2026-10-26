<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '../../app/types';
import { useApplication } from '../../stores/application';
import NumberValue from '../../components/NumberValue.vue';
import AppIcon from '../../components/AppIcon.vue';
const props = defineProps<{ character: Character; busy: boolean }>();
const emit = defineEmits<{
    edit: [];
    history: [];
    delete: [];
    quick: [category: string, key: string];
    move: [offset: number];
    drag: [event: DragEvent];
}>();
const rules = useApplication().rules();
const groups = computed(() => [
    {
        title: '师门技能',
        key: 'schoolSkills',
        rows: props.character.progress.schoolSkills.map((skill) => ({
            key: skill.name,
            label: skill.name,
            value: skill.level,
            unit: '级',
        })),
    },
    {
        title: '人物修炼',
        key: 'training',
        rows: rules.characterTraining.map((field: { key: string; label: string }) => ({
            ...field,
            value: props.character.progress.training[field.key],
            unit: '级',
        })),
    },
    {
        title: '召唤兽修炼',
        key: 'petTraining',
        rows: rules.petTraining.map((field: { key: string; label: string }) => ({
            ...field,
            value: props.character.progress.petTraining[field.key],
            unit: '级',
        })),
    },
    {
        title: '辅助技能',
        key: 'auxiliarySkills',
        rows: props.character.progress.auxiliarySkills.map((skill) => ({
            key: skill.name,
            label: skill.name,
            value: skill.level,
            unit: '级',
        })),
    },
]);
</script>
<template>
    <article
        class="character-card"
        :data-character-id="character.id"
        :aria-label="character.name + '的角色档案'"
    >
        <header class="character-heading">
            <div class="character-identity">
                <AppIcon name="user" :size="36" />
                <div>
                    <h2>{{ character.name }}</h2>
                    <p>
                        <button
                            class="text-button"
                            :disabled="busy"
                            aria-label="修改等级"
                            @click="emit('quick', 'level', '')"
                        >
                            {{ character.level == null ? '等级未记录' : character.level + ' 级' }}
                        </button>
                        <span v-if="character.school">· {{ character.school }}</span>
                        <span v-if="character.server">· {{ character.server }}</span>
                    </p>
                </div>
            </div>
            <div class="actions card-actions">
                <button
                    class="icon-button drag-handle"
                    :disabled="busy"
                    :draggable="!busy"
                    aria-label="拖动排序，或用方向键前后移动"
                    title="拖动排序，或用方向键前后移动"
                    @dragstart="emit('drag', $event)"
                    @keydown.left.prevent="emit('move', -1)"
                    @keydown.up.prevent="emit('move', -1)"
                    @keydown.right.prevent="emit('move', 1)"
                    @keydown.down.prevent="emit('move', 1)"
                >
                    <AppIcon name="grip" :size="15" />
                </button>
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="查看养成记录"
                    @click="emit('history')"
                >
                    <AppIcon name="calendar" :size="15" />
                </button>
                <button
                    class="icon-button danger"
                    :disabled="busy"
                    aria-label="删除角色"
                    @click="emit('delete')"
                >
                    <AppIcon name="trash" :size="15" />
                </button>
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="编辑档案"
                    @click="emit('edit')"
                >
                    <AppIcon name="edit" :size="15" />
                </button>
            </div>
        </header>
        <div class="character-sections">
            <section
                v-for="group in groups"
                :key="group.key"
                :class="{
                    training: group.key === 'training' || group.key === 'petTraining',
                }"
            >
                <h3>{{ group.title }}</h3>
                <dl v-if="group.rows.length" class="metric-list">
                    <div v-for="row in group.rows" :key="row.key">
                        <dt>{{ row.label }}</dt>
                        <dd>
                            <button
                                class="metric-button"
                                :disabled="busy"
                                :aria-label="
                                    '修改' +
                                    row.label +
                                    '，当前' +
                                    (row.value == null ? '未记录' : row.value + row.unit)
                                "
                                @click="emit('quick', group.key, row.key)"
                            >
                                <NumberValue :value="row.value" :unit="row.unit" />
                            </button>
                        </dd>
                    </div>
                </dl>
                <p v-else class="hint">未记录</p>
            </section>
            <section class="growth-section">
                <h3>其他养成</h3>
                <dl class="metric-list">
                    <div
                        v-for="[key, title] in [
                            ['qianyuanPills', '乾元丹'],
                            ['potentialFruits', '潜能果'],
                        ]"
                        :key="key"
                    >
                        <dt>{{ title }}</dt>
                        <dd>
                            <button
                                class="metric-button"
                                :disabled="busy"
                                :aria-label="'修改' + title"
                                @click="emit('quick', key, '')"
                            >
                                <NumberValue
                                    :value="
                                        character.progress[
                                            key as 'qianyuanPills' | 'potentialFruits'
                                        ]
                                    "
                                    unit="个"
                                />
                            </button>
                        </dd>
                    </div>
                </dl>
                <p v-if="character.progress.note" class="character-note">
                    {{ character.progress.note }}
                </p>
            </section>
        </div>
    </article>
</template>
