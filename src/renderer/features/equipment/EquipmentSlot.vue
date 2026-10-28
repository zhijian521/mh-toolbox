<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem } from '../../app/types';
import { useApplication } from '../../stores/application';
import AppIcon from '../../components/AppIcon.vue';
import EquipmentProperties from './EquipmentProperties.vue';

const props = withDefaults(
    defineProps<{
        part: string;
        eq: EquipmentItem | null;
        /** 旧档案里这一格有多件「在用」，等着用户挑一件。 */
        pending?: boolean;
        /** 玉魄未解锁，点了先去设置命魂之玉。 */
        locked?: boolean;
    }>(),
    { pending: false, locked: false },
);
const emit = defineEmits<{ open: [] }>();
const app = useApplication();
const rules = app.rules();

/** 部位图标：与 AppIcon 里的键一一对应。 */
const icons: Record<string, string> = {
    武器: 'sword',
    头盔: 'helmet',
    项链: 'necklace',
    衣服: 'armor',
    腰带: 'belt',
    鞋子: 'boots',
    戒指: 'ring',
    耳饰: 'earring',
    手镯: 'bracelet',
    佩饰: 'pendant',
    '玉魄·阳': 'jade-yang',
    '玉魄·阴': 'jade-yin',
};
/**
 * 右上角的等级。
 *
 * 玉魄没有装备等级，写的是灵尘总等级——游戏里玉魄的强弱就体现在这里，
 * 留空反而看不出好坏。其余部位按档案里的等级显示，未填就不占位。
 */
const levelText = computed(() => {
    if (!props.eq) return '';
    const value = rules.isJade(props.part)
        ? rules.equipmentDetails(props.eq).jade.dust
        : props.eq.level;
    return value === '' || value == null ? '' : value + ' 级';
});
const nameText = computed(() => {
    if (props.eq) return props.eq.name;
    if (props.locked) return '未解锁';
    if (props.pending) return '待选择';
    return '＋ 添加';
});
const hint = computed(() => {
    if (props.eq) return `${props.part}：${props.eq.name}，查看属性与操作`;
    if (props.locked) return `${props.part}：未解锁，先设置命魂之玉`;
    if (props.pending) return `${props.part}：旧档案有多件在用，选择一件`;
    return `${props.part}：空位，选择装备`;
});
</script>

<template>
    <button
        type="button"
        class="eq-slot"
        :class="{ filled: !!eq, pending, locked }"
        :aria-label="hint"
        :data-slot="part"
        @click="emit('open')"
    >
        <span class="eq-slot-head">
            <AppIcon :name="icons[part] || 'sword'" :size="16" />
            <span class="eq-slot-type">{{ part }}</span>
            <span v-if="levelText" class="eq-slot-level">{{ levelText }}</span>
        </span>
        <span class="eq-slot-name">{{ nameText }}</span>
        <EquipmentProperties v-if="eq" :eq="eq" :lines="4" />
    </button>
</template>

<style scoped>
.eq-slot {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    min-height: 106px;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper);
    text-align: left;
    transition:
        border-color 120ms ease,
        background 120ms ease;
}
.eq-slot:hover {
    border-color: var(--line-2);
    background: var(--paper-2);
}
.eq-slot.filled {
    border-color: var(--line-2);
}
.eq-slot.pending {
    border-style: dashed;
    border-color: var(--gold);
}
.eq-slot.locked {
    color: var(--muted);
}
.eq-slot-head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
}
.eq-slot-type {
    flex: none;
}
.eq-slot-level {
    margin-left: auto;
    flex: none;
    font-variant-numeric: tabular-nums;
}
.eq-slot-name {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    overflow-wrap: anywhere;
}
.eq-slot.filled .eq-slot-name {
    font-weight: 600;
    color: var(--ink);
}
.eq-slot.locked .eq-slot-name {
    font-weight: 400;
    color: var(--muted);
}
</style>
