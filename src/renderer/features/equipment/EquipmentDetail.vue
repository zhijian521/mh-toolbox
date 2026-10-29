<script setup lang="ts">
import { computed } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import EquipmentProperties from './EquipmentProperties.vue';

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
</script>

<template>
    <BaseModal :title="eq.slot + ' · ' + eq.name" wide :busy="app.busy" @close="emit('close')">
        <div class="detail-grid">
            <section class="detail-main">
                <EquipmentProperties :eq="eq" aligned />
                <!-- 备注不是属性，不进属性表：它是「我自己记的一句话」，跟着详情走。 -->
                <p v-if="eq.note" class="detail-note">{{ eq.note }}</p>
                <p class="detail-meta">
                    {{ rules.charName(eq.characterId) }} ·
                    {{ rules.equipmentStatuses[status] }}
                </p>
                <p class="detail-meta">
                    引用方案：{{ references.map((item) => item.name).join(' / ') || '未配置' }}
                </p>
                <details v-if="eq.ocrText" class="detail-ocr">
                    <summary>识别原文</summary>
                    <pre>{{ eq.ocrText }}</pre>
                </details>
            </section>
            <section class="detail-side">
                <h3>装备时间线</h3>
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
                <p v-else class="detail-meta">暂无变动记录</p>
            </section>
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
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
}
.detail-main,
.detail-side {
    min-width: 0;
}
.detail-note {
    margin: 8px 0 0;
    padding-left: 9px;
    border-left: 2px solid var(--line);
    font-size: 12px;
    line-height: 1.6;
    color: var(--ink);
}
.detail-meta {
    margin: 6px 0 0;
    color: var(--muted);
    font-size: 12px;
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
.detail-side h3 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
}
.timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 46vh;
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
.footer-gap {
    margin-left: auto;
}
@media (max-width: 900px) {
    .detail-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
