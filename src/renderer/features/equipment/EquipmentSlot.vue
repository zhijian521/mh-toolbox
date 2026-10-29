<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem } from '../../app/types';
import { useApplication } from '../../stores/application';
import CharacterAvatar from '../../components/CharacterAvatar.vue';
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
/**
 * 印在头像右下角的那一个字：取玩家的口头叫法，不是机械截字。
 *
 * 「武器」取第二个字会得到「器」、「衣服」得「服」、「鞋子」得「子」——都不成字眼；
 * 真要跟部位对得上，只能用一张表。装备名千变万化，部位才是稳定的那一维，
 * 所以印的是部位而不是装备。
 */
const PART_SEALS: Record<string, string> = {
    头盔: '盔',
    项链: '链',
    武器: '武',
    衣服: '衣',
    腰带: '腰',
    鞋子: '鞋',
    戒指: '戒',
    耳饰: '耳',
    手镯: '镯',
    佩饰: '佩',
    '玉魄·阳': '阳',
    '玉魄·阴': '阴',
};
const partSeal = computed(() => {
    const chars = Array.from(props.part);
    return PART_SEALS[props.part] || chars[chars.length - 1] || props.part;
});
/** 空位没有名字可展示，就把部位字写在正面，省得一格空白看不出是什么。 */
const avatarName = computed(() => (props.eq ? props.eq.name : partSeal.value));
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
    return '点击挑一件或截图识别';
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
        <!--
            左侧是角色页那种头像：山水一笔 + 名字首字，右下角一枚部位小印。
            装备名千变万化，部位才是稳定的那一维，所以印的是部位。
        -->
        <span class="eq-icon">
            <CharacterAvatar :name="avatarName" :seal="eq ? partSeal : ''" :tone="tone" />
        </span>
        <span class="eq-main">
            <span class="eq-meta">
                <span class="eq-part">{{ part }}</span>
                <span v-if="levelText" class="eq-level">{{ levelText }}</span>
            </span>
            <span class="eq-name">{{ nameText }}</span>
            <!-- 属性一条不少：不再折叠成「还有 N 条」，宁可格子高一点。 -->
            <EquipmentProperties v-if="eq" :eq="eq" />
            <span v-else class="eq-tip">{{ tip }}</span>
        </span>
    </button>
</template>

<style scoped>
.eq-slot {
    display: flex;
    /* 插槽与文字块整体居中：空位两行字、满格五六行属性，高度不同也不会一边吊着。 */
    align-items: center;
    gap: 11px;
    width: 100%;
    height: 100%;
    min-height: 104px;
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
    border-color: color-mix(in srgb, var(--q) 52%, var(--line-2));
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
/* 头像跟着格子色调：山水与角印都是 --q，空位退回线色。 */
.eq-icon {
    display: flex;
    flex: none;
}
.eq-slot.vacant .eq-icon :deep(.avatar-initial),
.eq-slot.locked .eq-icon :deep(.avatar-initial) {
    color: var(--muted);
}
/* 未解锁的玉魄整枚压暗：那里点了也不会有反应，别再画得跟能点一样。 */
.eq-slot.locked .eq-icon {
    opacity: 0.5;
}
.eq-main {
    display: flex;
    flex-direction: column;
    /* 同一排的格子会被拉到等高，内容垂直居中，多出来的空白才不会全堆在底部。 */
    justify-content: center;
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
