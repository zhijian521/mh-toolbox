<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import EquipmentSlot from './EquipmentSlot.vue';

const props = defineProps<{ profile: EquipmentProfile }>();
const emit = defineEmits<{
    pick: [slot: string];
    detail: [eq: EquipmentItem];
    soul: [];
}>();
const app = useApplication();
const rules = app.rules();

const gearSlots = rules.equipmentGroups.gear.slots;
const accessorySlots = rules.equipmentGroups.accessory.slots;
const jadeSlots = rules.equipmentGroups.jade.slots;
/** 正在查看的方案：换装只动这一套，切换它本身也要落盘，下次打开还是这套。 */
const viewed = computed(() => props.profile.viewedEquipmentSet);
const active = computed(() => props.profile.activeEquipmentSet);
const set = computed(() => props.profile.equipmentSets[viewed.value]);
const pendingSlots = computed(() => props.profile.pendingEquipmentSlots || []);
const soul = computed(() => props.profile.soulJade);
const soulText = computed(() =>
    soul.value.unlocked ? `${soul.value.attribute} · 修炼 ${soul.value.level} 级` : '尚未解锁',
);

function message(failure: unknown) {
    return failure instanceof Error ? failure.message : String(failure);
}
/** 方案切换是「上次看到哪」这种偏好，但存在数据里，所以同样走落盘。 */
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
/** 当前使用方案决定其它页面（仓库的「配置」、总览）认哪一套为在装。 */
async function activate() {
    if (app.busy) return;
    try {
        await app.execute((domain) =>
            domain.commitEquipment(() => {
                domain.equipmentProfile(props.profile.id).activeEquipmentSet = viewed.value;
            }),
        );
        app.notify('已切换当前使用方案');
    } catch (failure) {
        app.notify(message(failure), true);
    }
}
function equipped(slot: string) {
    return rules.equipmentById(set.value.slots[slot]) || null;
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
                    <span v-if="viewed === active" class="eq-in-use">使用中</span>
                    <button v-else class="btn compact" :disabled="app.busy" @click="activate">
                        使用此套
                    </button>
                </div>
                <div class="eq-plan-tabs" role="group" :aria-label="profile.name + '的装备方案'">
                    <button
                        v-for="(item, index) in profile.equipmentSets"
                        :key="index"
                        type="button"
                        class="eq-plan"
                        :class="{ on: index === viewed, active: index === active }"
                        :aria-pressed="index === viewed"
                        :title="`方案 ${index + 1}：${item.name}`"
                        @click="setViewed(index)"
                    >
                        <b>{{ index + 1 }}</b>
                        <span>{{ item.name }}</span>
                    </button>
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
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
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
.eq-board-head {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    min-height: 26px;
}
/* 右侧按钮自己顶到最右，「使用中」就能紧挨标题，不至于孤零零挂在行尾。 */
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
.eq-in-use {
    flex: none;
    padding: 2px 8px;
    border: 1px solid var(--green);
    border-radius: 3px;
    color: var(--green);
    font-size: 11.5px;
}
.eq-plan-tabs {
    display: flex;
    gap: 6px;
}
.eq-plan {
    display: flex;
    align-items: baseline;
    gap: 5px;
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--paper);
    color: var(--muted);
    font-size: 12px;
    text-align: left;
}
.eq-plan b {
    flex: none;
    font-variant-numeric: tabular-nums;
}
.eq-plan span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.eq-plan:hover {
    border-color: var(--line-2);
}
.eq-plan.on {
    border-color: var(--line-2);
    background: var(--panel-3);
    color: var(--ink);
}
/* 当前使用的那一套加一道内描边，与「正在查看」的选中态区分开。 */
.eq-plan.active {
    box-shadow: inset 0 -2px 0 var(--green);
}
.eq-gear-grid,
.eq-accessory-grid,
.eq-jade-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}
@media (max-width: 1080px) {
    .eq-board-columns {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
