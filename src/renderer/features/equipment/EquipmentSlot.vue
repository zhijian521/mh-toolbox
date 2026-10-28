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
 * 插槽色调：跟着「这件装备练到什么程度」走，而不是随便上色。
 *
 * 有特技特效是金（最难出），打过宝石或锻炼是青，其余用中性色；玉魄整体走绿，
 * 与灵饰、常规装备分开。空位一律退回线色——一格亮着却没有装备，会让人以为
 * 那一格已经穿了东西。
 */
const tone = computed(() => {
    if (!props.eq) return 'var(--line-2)';
    if (props.locked) return 'var(--line-2)';
    if (rules.isJade(props.part)) return 'var(--green)';
    const detail = rules.equipmentDetails(props.eq);
    if (detail.technique || detail.effects.length) return 'var(--gold)';
    // `bonus` 是打了宝石才有的属性行，不能只看 `gems` 列表——手填的档案常常只有前者。
    if (detail.gems.length || detail.bonus.length || detail.forge !== null) return 'var(--blue)';
    return 'var(--muted)';
});
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
    return '空位';
});
/** 空位给一句「点下去会发生什么」，比只写「＋ 添加」更容易读懂。 */
const tip = computed(() => {
    if (props.eq) return '';
    if (props.locked) return '先设置命魂之玉';
    if (props.pending) return '旧档案有多件候选，点开挑一件';
    return '点击从仓库挑一件';
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
        :class="{ filled: !!eq, pending, locked, vacant: !eq }"
        :style="{ '--q': tone }"
        :aria-label="hint"
        :data-slot="part"
        @click="emit('open')"
    >
        <!-- 插槽：凹陷的方孔托住部位图标，像游戏里那排格子，而不是一块纯色方块。 -->
        <span class="eq-socket">
            <AppIcon :name="icons[part] || 'sword'" :size="27" />
            <span v-if="!eq && !locked" class="eq-add" aria-hidden="true">＋</span>
        </span>
        <span class="eq-main">
            <span class="eq-meta">
                <span class="eq-part">{{ part }}</span>
                <span v-if="levelText" class="eq-level">{{ levelText }}</span>
            </span>
            <span class="eq-name">{{ nameText }}</span>
            <EquipmentProperties v-if="eq" :eq="eq" :lines="3" />
            <span v-else class="eq-tip">{{ tip }}</span>
        </span>
    </button>
</template>

<style scoped>
.eq-slot {
    display: flex;
    /* 插槽与右侧文字块整体居中：空位两行字、满格三四行属性，高度不同也不会一边吊着。 */
    align-items: center;
    gap: 11px;
    width: 100%;
    min-height: 100px;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: 5px;
    /* 卡片底色是插槽色的极淡版本：扫一眼就能分出金 / 青 / 绿几类，又不压过名字。 */
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--q) 7%, var(--paper)) 0%,
        var(--paper) 60%
    );
    text-align: left;
    transition:
        border-color 120ms ease,
        background 120ms ease;
}
.eq-slot:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--q) 48%, var(--line-2));
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--q) 12%, var(--paper)) 0%,
        var(--paper) 64%
    );
}
/* 空位用虚线：一眼分得清「这里还缺一件」和「这里已经穿了」。
 *
 * 修饰类叫 `vacant` 而不是 `empty`：基座里的 `.empty` 是整页空状态（竖排居中、
 * 上下 60px 内边距），撞上去格子会被排成一列。
 */
.eq-slot.vacant {
    border-style: dashed;
    border-color: var(--line-2);
    background: var(--paper);
}
.eq-slot.vacant:hover:not(:disabled) {
    background: var(--paper-2);
}
.eq-slot.pending {
    border-style: dashed;
    border-color: var(--gold);
}
.eq-socket {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 58px;
    height: 58px;
    border: 1px solid color-mix(in srgb, var(--q) 48%, var(--line));
    border-radius: 6px;
    color: var(--q);
    background: radial-gradient(
        120% 120% at 32% 22%,
        color-mix(in srgb, var(--q) 17%, var(--paper-2)),
        var(--paper-2) 72%
    );
    /* 上沿压深、下沿提亮：一个往里凹的孔，与凸起的纸面相反。 */
    box-shadow:
        inset 0 1px 3px color-mix(in srgb, var(--ink) 15%, transparent),
        inset 0 -1px 0
            light-dark(
                color-mix(in srgb, #fff 55%, transparent),
                color-mix(in srgb, #000 45%, transparent)
            );
}
.eq-slot.vacant .eq-socket {
    color: color-mix(in srgb, var(--muted) 55%, var(--paper));
    border-color: var(--line);
}
.eq-slot.locked .eq-socket {
    color: color-mix(in srgb, var(--muted) 62%, var(--paper));
}
/* 空位右下角那枚「加号」：贴着插槽边缘挂出去，像格子角上的空位标记。 */
.eq-add {
    position: absolute;
    right: -6px;
    bottom: -6px;
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    border: 1px solid var(--line-2);
    border-radius: 50%;
    background: var(--paper);
    color: var(--muted);
    font-size: 11px;
    line-height: 1;
    transition:
        color 120ms ease,
        border-color 120ms ease;
}
.eq-slot:hover .eq-add {
    border-color: var(--gold);
    color: var(--gold);
}
.eq-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 2px;
    min-width: 0;
}
.eq-meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--muted);
    font-size: 11px;
}
.eq-part {
    flex: none;
    letter-spacing: 0.04em;
}
.eq-level {
    margin-left: auto;
    flex: none;
    font-variant-numeric: tabular-nums;
}
.eq-name {
    color: var(--ink);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.5;
    overflow-wrap: anywhere;
}
.eq-slot.vacant .eq-name,
.eq-slot.locked .eq-name {
    color: var(--muted);
    font-weight: 400;
}
.eq-tip {
    color: color-mix(in srgb, var(--muted) 82%, var(--paper));
    font-size: 11.5px;
    line-height: 1.5;
}
</style>
