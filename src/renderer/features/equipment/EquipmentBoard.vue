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
        <div class="eq-board-columns">
            <div class="eq-board-main">
                <div class="eq-board-head">
                    <div class="eq-board-title">
                        <h2>装备</h2>
                        <p>点击格子换装</p>
                    </div>
                </div>
                <!--
                    方案切换：三个号码签 + 名字。号码是固定的（一 / 二 / 三），名字可以改，
                    所以号码用等宽数字单独占一枚小方章，扫一眼就能对上「方案 2」。
                -->
                <div class="eq-plan-row">
                    <div
                        class="eq-plan-tabs"
                        role="group"
                        :aria-label="profile.name + '的装备方案'"
                    >
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
    gap: 12px;
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
.eq-board-side {
    gap: 10px;
}
/*
 * 两栏共用一条顶线，但左栏标题下面还有副标题和方案行（合计 81px），右栏只有
 * 一行标题（36px）——第一排格子就被左栏这两行推低了 45px。把右侧标题块补到
 * 同样的高度、再让出一行方案行的位置，两栏的第一排格子才从同一条水平线开始。
 * 31 = 左栏（标题 40 + 间距 8 + 方案行 25 + 间距 8）− 右栏（标题 40 + 间距 10）。
 */
.eq-board-side > .eq-board-head:first-child {
    min-height: 40px;
    margin-bottom: 31px;
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
.eq-plan-row {
    display: flex;
    align-items: center;
    gap: 8px 12px;
    flex-wrap: wrap;
}
.eq-plan-tabs {
    display: flex;
    flex: 1 1 auto;
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
    margin-left: auto;
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
    /* 上下堆叠后两栏不再并排，不需要为对齐留空。 */
    .eq-board-side > .eq-board-head:first-child {
        min-height: 0;
        margin-bottom: 0;
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
