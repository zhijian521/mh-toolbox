<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import CharacterAvatar from '../../components/CharacterAvatar.vue';
import EquipmentProperties from './EquipmentProperties.vue';
import { equipmentLevelText, equipmentTone, partSealOf } from './display';

/** 时间线里一条变动；字段由 `gearLogsOf` 直接给出。 */
interface GearLog {
    id: string;
    date: string;
    action: string;
    amount: number;
    currency: string;
    note?: string;
    synced?: boolean;
}

const props = defineProps<{ eq: EquipmentItem; index: number; profile: EquipmentProfile }>();
const emit = defineEmits<{
    close: [];
    edit: [];
    log: [];
    remove: [];
    assign: [slot: string, id: string];
}>();
const app = useApplication();
const rules = app.rules();

const profile = computed(() => rules.equipmentProfile(props.eq.characterId));
const setName = computed(() => profile.value.equipmentSets[props.index]?.name || '');
const equipped = computed(
    () => profile.value.equipmentSets[props.index]?.slots[props.eq.slot] === props.eq.id,
);
const references = computed(() => rules.equipmentReferences(props.eq.id));
const status = computed(() => rules.equipmentStatus(props.eq, references.value));
const logs = computed(() => rules.gearLogsOf(props.eq.id) as unknown as GearLog[]);
/*
 * 卡片与板面上的格子是同一套视觉：同一个色调、同一枚部位印、同样一行等级。
 * 颜色判断抽在 `display.ts`，两处共用，不能各算一套。
 */
const tone = computed(() => equipmentTone(rules, props.eq));
const seal = computed(() => partSealOf(props.eq.slot));
const levelText = computed(() => equipmentLevelText(rules, props.eq));
const refsText = computed(() => references.value.map((item) => item.name).join(' / ') || '未配置');
</script>

<template>
    <BaseModal :title="eq.slot + ' · ' + eq.name" wide :busy="app.busy" @close="emit('close')">
        <div class="detail-grid">
            <!--
                左边是「装备本身」：跟板面格子同一套头像 + 部位 + 等级 + 名称，
                下面接完整属性。右边只放跟时间和归属有关的东西，两边职责不混。
            -->
            <section class="detail-card" :style="{ '--q': tone }">
                <div class="card-head">
                    <CharacterAvatar
                        class="card-avatar"
                        :name="eq.name"
                        :seal="seal"
                        :tone="tone"
                    />
                    <div class="card-id">
                        <span>{{ eq.slot }}</span>
                        <span v-if="levelText" class="card-level">{{ levelText }}</span>
                    </div>
                    <h3 class="card-name">{{ eq.name }}</h3>
                </div>
                <EquipmentProperties :eq="eq" aligned />
            </section>
            <div class="detail-side">
                <section class="panel">
                    <h3>变更记录</h3>
                    <div v-if="logs.length" class="timeline">
                        <div v-for="log in logs" :key="log.id" class="tl-item">
                            <div class="tl-head">
                                <span
                                    class="badge"
                                    :class="{
                                        income: rules.gearAction(log.action).dir > 0,
                                        expense: rules.gearAction(log.action).dir < 0,
                                    }"
                                >
                                    {{ rules.gearAction(log.action).t }}
                                </span>
                                <span class="tl-amount">
                                    {{ log.amount ? U.fmtAmount(log.amount, log.currency) : '—' }}
                                </span>
                            </div>
                            <div class="tl-date">{{ log.date }}</div>
                            <div v-if="log.note" class="tl-note">{{ log.note }}</div>
                        </div>
                    </div>
                    <p v-else class="panel-empty">
                        这件装备还没记过变动。底部的「记变动」可以记购入、售出、打造或镶嵌。
                    </p>
                </section>
                <section class="panel">
                    <h3>其他信息</h3>
                    <dl class="meta">
                        <dt>归属</dt>
                        <dd>
                            {{ rules.charName(eq.characterId) }} ·
                            {{ rules.equipmentStatuses[status] }}
                        </dd>
                        <dt>引用方案</dt>
                        <dd>{{ refsText }}</dd>
                        <template v-if="eq.note">
                            <dt>备注</dt>
                            <dd class="meta-note">{{ eq.note }}</dd>
                        </template>
                    </dl>
                    <details v-if="eq.ocrText" class="detail-ocr">
                        <summary>识别原文</summary>
                        <pre>{{ eq.ocrText }}</pre>
                    </details>
                </section>
            </div>
        </div>
        <template #footer="{ close }">
            <button class="btn danger" type="button" :disabled="app.busy" @click="emit('remove')">
                删除
            </button>
            <button class="btn" type="button" :disabled="app.busy" @click="emit('edit')">
                编辑
            </button>
            <button class="btn" type="button" :disabled="app.busy" @click="emit('log')">
                记变动
            </button>
            <span class="footer-gap"></span>
            <button class="btn" :disabled="app.busy" @click="close">关闭</button>
            <button
                v-if="equipped"
                class="btn"
                type="button"
                :disabled="app.busy"
                @click="emit('assign', eq.slot, '')"
            >
                从本套卸下
            </button>
            <button
                v-else-if="eq.status !== 'sold' && eq.slot !== '其他'"
                class="btn primary"
                type="button"
                :disabled="app.busy"
                @click="emit('assign', eq.slot, eq.id)"
            >
                配置到「{{ setName }}」
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
}
/* 卡片底色是插槽色的极淡版本，与板面上的格子同一种「练到什么程度」的暗示。 */
.detail-card {
    --q: var(--muted);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px 16px 18px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--q) 8%, var(--paper)) 0%,
        var(--paper) 58%
    );
}
.card-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 3px;
    align-items: center;
}
.card-avatar {
    grid-row: span 2;
}
/* 部位在左、等级顶到右端，与板面格子右上角那一行的读法一致。 */
.card-id {
    display: flex;
    align-items: baseline;
    gap: 8px;
    color: var(--muted);
    font-size: 11px;
}
.card-level {
    margin-left: auto;
    flex: none;
    font-variant-numeric: tabular-nums;
}
.card-name {
    grid-column: 2;
    margin: 0;
    color: var(--ink);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
}
.detail-side {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
}
.panel {
    min-width: 0;
}
.panel h3 {
    margin: 0 0 8px;
    font-size: 12.5px;
    font-weight: 600;
}
.panel-empty {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.7;
}
/* 归属、引用方案、备注排成一张两列小表，比三行各自为政的灰字好扫。 */
.meta {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 6px 12px;
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
}
.meta dt {
    color: var(--muted);
    white-space: nowrap;
}
.meta dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
}
/* 备注里常有「制造者」「耐久」各自一行，原文的换行要留住。 */
.meta-note {
    white-space: pre-line;
}
.timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 38vh;
    overflow: auto;
}
.tl-item {
    padding-left: 9px;
    border-left: 2px solid var(--line);
}
.tl-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}
.tl-amount {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}
.tl-date {
    margin-top: 2px;
    color: var(--muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
}
.tl-note {
    margin-top: 2px;
    font-size: 12px;
    overflow-wrap: anywhere;
}
.badge {
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    font-size: 11px;
}
.badge.income {
    color: var(--green);
    border-color: color-mix(in srgb, var(--green) 45%, transparent);
}
.badge.expense {
    color: var(--red);
    border-color: color-mix(in srgb, var(--red) 40%, transparent);
}
.detail-ocr {
    margin-top: 10px;
    font-size: 12px;
}
.detail-ocr summary {
    color: var(--muted);
    cursor: pointer;
}
.detail-ocr pre {
    margin: 6px 0 0;
    padding: 8px 10px;
    max-height: 180px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--paper-2);
    font-size: 11.5px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}
.footer-gap {
    margin-left: auto;
}
@media (max-width: 900px) {
    .detail-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
