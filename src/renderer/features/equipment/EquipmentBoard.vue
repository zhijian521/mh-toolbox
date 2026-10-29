<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { plain } from '../../services/desktop';
import { useApplication } from '../../stores/application';
import EquipmentSlot from './EquipmentSlot.vue';

const props = defineProps<{ profile: EquipmentProfile }>();
const emit = defineEmits<{
    pick: [slot: string];
    detail: [eq: EquipmentItem];
    soul: [];
    plan: [mode: 'rename' | 'copy'];
}>();
const app = useApplication();
const rules = app.rules();

const gearSlots = rules.equipmentGroups.gear.slots;
const accessorySlots = rules.equipmentGroups.accessory.slots;
const jadeSlots = rules.equipmentGroups.jade.slots;
/** 正在查看的方案：换装只动这一套，切换它本身也要落盘，下次打开还是这套。 */
const viewed = computed(() => props.profile.viewedEquipmentSet);
const set = computed(() => props.profile.equipmentSets[viewed.value]);
const pendingSlots = computed(() => props.profile.pendingEquipmentSlots || []);
const soul = computed(() => props.profile.soulJade);
const soulText = computed(() =>
    soul.value.unlocked ? `${soul.value.attribute} · 修炼 ${soul.value.level} 级` : '尚未解锁',
);

function message(failure: unknown) {
    return failure instanceof Error ? failure.message : String(failure);
}
/**
 * 切方案 = 换穿哪套。
 *
 * 方案只是同一批档案的三种搭法，玩家身上永远只有一套；所以「切到哪套看」与
 * 「哪套在用」是同一件事，不再额外提供「使用此套」这一道确认。
 */
async function setViewed(index: number) {
    if (app.busy || index === viewed.value) return;
    try {
        await app.execute((domain) =>
            domain.commitEquipment(() => {
                domain.equipmentProfile(props.profile.id).viewedEquipmentSet = index;
            }),
        );
    } catch (failure) {
        app.notify(message(failure), true);
    }
}
/**
 * 格子的数据取快照，不直接传领域里的活对象。
 *
 * `saveEquipment` 是 `Object.assign(previous, eq)` 原地改，对象引用不变；父组件虽然因为
 * `profile` 换了引用而重渲染，传给格子的 prop 还是同一个对象，Vue 判定「属性没变」就
 * 跳过子组件更新——改完名字格子里仍是旧名，切一次方案才刷新。深拷贝一次，引用变了
 * 才会重画；一件装备几个字段，这点拷贝可以忽略。
 */
function equipped(slot: string) {
    const eq = rules.equipmentById(set.value.slots[slot]);
    return eq ? (plain(eq) as EquipmentItem) : null;
}
/** 玉魄格子未解锁时不给选装入口，点了先去设命魂之玉。 */
function open(slot: string) {
    const eq = equipped(slot);
    if (eq) emit('detail', eq);
    else if (rules.isJade(slot) && !soul.value.unlocked) emit('soul');
    else emit('pick', slot);
}
function isPending(slot: string) {
    return viewed.value === 0 && !equipped(slot) && pendingSlots.value.includes(slot);
}
</script>

<template>
    <section class="eq-board">
        <p v-if="pendingSlots.length" class="eq-notice">
            旧档案中「{{ pendingSlots.join('、') }}」的第一套穿戴有多件候选，请在对应格子选一件，
            其余档案都还在仓库里。
        </p>
        <!--
            方案切换横跨两栏、放在两个标题之上。
            一是方案本来就属于整个角色，不只属于装备那栏；二是两栏的标题块从此等高，
            第一排格子天然从同一条线开始，不用再拿 margin 去补。
            号码是固定的（一 / 二 / 三），名字可以改，所以号码用等宽数字单独占一枚小方章。
        -->
        <div class="eq-board-top">
            <div class="eq-plan-tabs" role="group" :aria-label="profile.name + '的装备方案'">
                <button
                    v-for="(item, index) in profile.equipmentSets"
                    :key="index"
                    type="button"
                    class="eq-plan"
                    :class="{ on: index === viewed }"
                    :aria-pressed="index === viewed"
                    :title="`方案 ${index + 1}：${item.name}`"
                    @click="setViewed(index)"
                >
                    <b>{{ index + 1 }}</b>
                    <span class="eq-plan-name">{{ item.name }}</span>
                </button>
            </div>
            <div class="eq-plan-actions">
                <button
                    class="text-button eq-plan-act"
                    type="button"
                    :disabled="app.busy"
                    title="给三套方案改名"
                    @click="emit('plan', 'rename')"
                >
                    改名
                </button>
                <span class="eq-plan-sep" aria-hidden="true">·</span>
                <button
                    class="text-button eq-plan-act"
                    type="button"
                    :disabled="app.busy"
                    :title="'把「' + set.name + '」的搭配复制到另一套'"
                    @click="emit('plan', 'copy')"
                >
                    复制方案
                </button>
            </div>
        </div>
        <div class="eq-board-columns">
            <div class="eq-board-main">
                <div class="eq-board-head">
                    <div class="eq-board-title">
                        <h2>装备</h2>
                    </div>
                </div>
                <div class="eq-gear-grid">
                    <EquipmentSlot
                        v-for="slot in gearSlots"
                        :key="slot"
                        :part="slot"
                        :eq="equipped(slot)"
                        :pending="isPending(slot)"
                        @open="open(slot)"
                    />
                </div>
            </div>
            <div class="eq-board-side">
                <div class="eq-board-head">
                    <div class="eq-board-title">
                        <h2>灵饰</h2>
                    </div>
                </div>
                <div class="eq-accessory-grid">
                    <EquipmentSlot
                        v-for="slot in accessorySlots"
                        :key="slot"
                        :part="slot"
                        :eq="equipped(slot)"
                        :pending="isPending(slot)"
                        @open="open(slot)"
                    />
                </div>
                <div class="eq-board-head">
                    <div class="eq-board-title">
                        <h2>命魂之玉</h2>
                        <p>{{ soulText }}</p>
                    </div>
                    <button class="btn compact" :disabled="app.busy" @click="emit('soul')">
                        修炼设置
                    </button>
                </div>
                <div class="eq-jade-grid">
                    <EquipmentSlot
                        v-for="slot in jadeSlots"
                        :key="slot"
                        :part="slot"
                        :eq="equipped(slot)"
                        :locked="!soul.unlocked"
                        @open="open(slot)"
                    />
                </div>
            </div>
        </div>
    </section>
</template>

<style scoped>
.eq-board {
    display: flex;
    flex-direction: column;
    /*
     * 整块给个上限：格子靠 1fr 分宽，窗口一宽就被拉成一排 600px 的空壳卡片，
     * 属性一行只有几个字，读起来反而更散。1440 窗口下这里本来就是 1200，
     * 所以 1240 只在大屏上生效——格子停在 289 / 315，右边留白，不再继续撑。
     */
    max-width: 1240px;
    /* 14px：方案行上下各留一格，比栏内的 8px 松、比两栏之间的 16px 紧。 */
    gap: 14px;
}
.eq-notice {
    margin: 0;
    padding: 9px 12px;
    border: 1px solid var(--gold);
    border-radius: 4px;
    background: color-mix(in srgb, var(--gold) 8%, transparent);
    color: var(--ink);
    font-size: 12.5px;
    line-height: 1.6;
}
.eq-board-columns {
    display: grid;
    /*
     * 左右等分：左六格的属性是「基础 + 双加 + 锻炼」两三行短词条，右四格灵饰与
     * 两格玉魄一条属性一行。两边要的最小宽度差不多（各约 250px），给谁多一点另
     * 一边就会折行——「气血回复效果 +10 [+12]」和「伤害 +480 · 命中 +320」一样长。
     */
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
}
.eq-board-main,
.eq-board-side {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
}
/*
 * 方案行横跨两栏。它上面没有别的块，下面的两个标题块等高（都只有一行 h2），
 * 第一排格子就天然落在同一条水平线上——不用再靠 margin 去补两栏的高度差。
 *
 * 「改名 · 复制方案」紧跟在三枚方案签后面，不再贴右边缘：它们改的是同一套方案，
 * 分居两头会让人以为「复制方案」属于右边那栏。
 */
.eq-board-top {
    display: flex;
    align-items: center;
    gap: 6px 10px;
    flex-wrap: wrap;
}
.eq-board-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-height: 26px;
}
/* 右侧按钮自己顶到最右，与标题各占一头。 */
.eq-board-head > .btn {
    margin-left: auto;
}
.eq-board-title h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
}
.eq-board-title p {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 11.5px;
}
.eq-plan-tabs {
    display: flex;
    /* 不拉伸：后面的「改名 · 复制方案」要贴着最后一枚签，而不是被推到右边缘。 */
    flex: 0 1 auto;
    min-width: 0;
    gap: 6px;
    flex-wrap: wrap;
}
/* 改名与复制都作用于「当前这套」，因此贴着方案标签放，而不是丢进页面顶栏。 */
.eq-plan-actions {
    display: flex;
    align-items: center;
    flex: none;
    gap: 8px;
}
/*
 * 号码签：等宽数字单独占一枚小方章，名字跟在后面。
 * 三枚签按内容宽度排，不再等分整行——名字是两三个字时，等分出来的就是一条长条按钮。
 */
.eq-plan {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 11em;
    padding: 3px 10px 3px 3px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper);
    color: var(--muted);
    font-size: 12px;
}
.eq-plan b {
    display: grid;
    place-items: center;
    flex: none;
    width: 17px;
    height: 17px;
    border-radius: 3px;
    background: var(--paper-2);
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    transition:
        background-color 120ms ease,
        color 120ms ease;
}
.eq-plan-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.eq-plan:hover:not(:disabled) {
    border-color: var(--line-2);
    color: var(--ink);
}
.eq-plan.on {
    border-color: color-mix(in srgb, var(--gold) 55%, var(--line));
    background: color-mix(in srgb, var(--gold) 8%, var(--paper));
    color: var(--ink);
}
.eq-plan.on b {
    background: color-mix(in srgb, var(--gold) 24%, var(--paper));
    color: color-mix(in srgb, var(--gold) 72%, var(--ink));
}
.eq-plan-act {
    color: var(--muted);
    font-size: 12px;
}
.eq-plan-act:hover:not(:disabled) {
    color: var(--ink);
    text-decoration: none;
}
.eq-plan-sep {
    color: var(--line-2);
    font-size: 12px;
}
/*
 * 常规装备与灵饰都是两列。
 *
 * 试过三列：197px 宽的格子把「伤害 +480 · 命中 +320」挤成两行，
 * 卡片反而从 200 长到 320，比两列还高。宽度够才是省高度的前提。
 */
.eq-gear-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}
.eq-accessory-grid,
.eq-jade-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}
/*
 * 两列要 1300 才够宽：1280 窗口下每格只剩 252px，「气血回复效果 +10 [+12]」正好
 * 差几个像素就会折断。再窄就上下堆叠，让每格拿回整行宽度。
 */
@media (max-width: 1250px) {
    .eq-board-columns {
        grid-template-columns: minmax(0, 1fr);
    }
}
@media (max-width: 900px) {
    .eq-gear-grid,
    .eq-accessory-grid,
    .eq-jade-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
