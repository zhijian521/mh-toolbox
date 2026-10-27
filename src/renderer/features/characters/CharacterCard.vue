<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '../../app/types';
import { useApplication } from '../../stores/application';
import NumberValue from '../../components/NumberValue.vue';
import AppIcon from '../../components/AppIcon.vue';
import CharacterAvatar from '../../components/CharacterAvatar.vue';
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
                <CharacterAvatar :name="character.name" />
                <div>
                    <h2 :title="character.name">{{ character.name }}</h2>
                    <p
                        :title="
                            [
                                character.level == null ? '等级未记录' : character.level + ' 级',
                                character.school,
                                character.server,
                            ]
                                .filter(Boolean)
                                .join(' · ')
                        "
                    >
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
                    <AppIcon name="grip" :size="16" />
                </button>
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="查看养成记录"
                    title="查看养成记录"
                    @click="emit('history')"
                >
                    <AppIcon name="calendar" :size="16" />
                </button>
                <button
                    class="icon-button danger"
                    :disabled="busy"
                    aria-label="删除角色"
                    title="删除角色"
                    @click="emit('delete')"
                >
                    <AppIcon name="trash" :size="16" />
                </button>
                <button
                    class="icon-button"
                    :disabled="busy"
                    aria-label="编辑档案"
                    title="编辑档案"
                    @click="emit('edit')"
                >
                    <AppIcon name="edit" :size="16" />
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

<style scoped>
.character-card {
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 20px;
    width: 100%;
    min-width: 420px;
    max-width: 520px;
}
.character-heading {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
    min-height: 56px;
}
.character-identity {
    display: flex;
    gap: 12px;
    min-width: 0;
    align-items: center;
    flex: 1;
}
.character-identity > div {
    min-width: 0;
    flex: 1;
}
.character-identity h2 {
    font-size: 17px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.character-identity p {
    font-size: 12px;
    color: var(--muted);
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.card-actions {
    gap: 5px;
    flex-wrap: nowrap;
    flex-shrink: 0;
}
.card-actions .icon-button {
    width: 29px;
    height: 29px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
    color: var(--muted);
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
}
.card-actions .icon-button:hover:not(:disabled) {
    border-color: var(--gold);
    background: #eee3cb;
    color: #806027;
}
.card-actions .icon-button:active:not(:disabled) {
    background: #e6d9bc;
}
.card-actions .icon-button.danger {
    color: var(--muted);
}
.card-actions .icon-button.danger:hover:not(:disabled) {
    border-color: #c89483;
    background: #f2e3d8;
    color: var(--red);
}
.character-sections {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
    row-gap: 12px;
    margin-top: 26px;
}
.character-sections > section {
    min-width: 0;
}
.character-sections section:first-child,
.character-sections section:nth-child(4),
.growth-section {
    grid-column: 1/-1;
}
.character-sections h3 {
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}
.character-sections h3:before {
    content: '';
    width: 3px;
    height: 14px;
    background: var(--red);
    flex: none;
}
.metric-list {
    display: grid;
    gap: 2px;
}
.character-sections section:first-child .metric-list,
.character-sections section:nth-child(4) .metric-list {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
}
.metric-list > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    min-width: 0;
    min-height: 29px;
}
.metric-list dt {
    color: #6b6353;
    overflow-wrap: anywhere;
}
.metric-list dd {
    flex: none;
}
.metric-button {
    border: 0;
    border-radius: 3px;
    background: none;
    min-height: 27px;
    padding: 2px 5px;
    margin-right: -5px;
    color: var(--gold);
}
.metric-button:hover:not(:disabled) {
    background: var(--paper-2);
}
.training .metric-button {
    color: var(--blue);
}
.growth-section .metric-list {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
}
.character-note {
    margin-top: 10px;
    font-size: 13px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--muted);
}
@media (max-width: 1150px) {
    .character-card {
        padding: 16px;
    }
    .character-sections {
        column-gap: 32px;
    }
    .character-sections section:first-child .metric-list,
    .character-sections section:nth-child(4) .metric-list,
    .growth-section .metric-list {
        column-gap: 32px;
    }
}
</style>
