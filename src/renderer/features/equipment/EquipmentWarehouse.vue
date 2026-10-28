<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import AppIcon from '../../components/AppIcon.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import EquipmentProperties from './EquipmentProperties.vue';

const props = defineProps<{ profile: EquipmentProfile }>();
const emit = defineEmits<{
    detail: [eq: EquipmentItem];
    edit: [eq: EquipmentItem];
    log: [eq: EquipmentItem];
    remove: [eq: EquipmentItem];
    add: [];
}>();
const app = useApplication();
const rules = app.rules();

/**
 * 仓库就是这个角色的全部档案。
 *
 * 与装备栏的差别只在「看什么」：栏里看的是三套方案各自穿了什么，仓库看的是这个人
 * 拥有什么。所以筛选按类型/部位/状态，不按方案——一件装备可能同时挂在两套里，
 * 按方案筛会让人以为有重复档案。
 */
const group = ref('');
const slot = ref('');
const status = ref('');
const kw = ref('');

const groupOptions = computed(() => [
    { value: '', label: '全部类型' },
    ...Object.entries(rules.equipmentGroups).map(([value, item]) => ({
        value,
        label: item.name,
    })),
    { value: 'other', label: '其他' },
]);
const slotOptions = computed(() => [
    { value: '', label: '全部部位' },
    ...rules.slots.map((item) => ({ value: item, label: item })),
]);
const statusOptions = computed(() => [
    { value: '', label: '全部状态' },
    ...Object.entries(rules.equipmentStatuses).map(([value, label]) => ({ value, label })),
]);

const own = computed<EquipmentItem[]>(() => {
    void app.data;
    return (app.data?.equipment || []).filter((item) => item.characterId === props.profile.id);
});
/** 引用关系每个角色算一次，逐行调用 `equipmentStatus` 会重复建索引。 */
const references = computed(() => rules.equipmentReferenceIndex(props.profile.id));
const statusOf = (eq: EquipmentItem) =>
    rules.equipmentStatus(eq, references.value.get(eq.id) || []);
const rows = computed(() => {
    const term = kw.value.trim().toLowerCase();
    const groupSlots = rules.equipmentGroups[group.value]?.slots;
    return own.value
        .filter((eq) => {
            if (slot.value && eq.slot !== slot.value) return false;
            if (group.value === 'other') {
                if (eq.slot !== '其他') return false;
            } else if (groupSlots && !groupSlots.includes(eq.slot)) return false;
            if (status.value && statusOf(eq) !== status.value) return false;
            if (term && !rules.equipmentSearchText(eq).toLowerCase().includes(term)) return false;
            return true;
        })
        .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
});
function referencesOf(eq: EquipmentItem) {
    return references.value.get(eq.id) || [];
}
function equippedIn(eq: EquipmentItem) {
    return props.profile.equipmentSets[props.profile.viewedEquipmentSet]?.slots[eq.slot] === eq.id;
}
function levelText(eq: EquipmentItem) {
    return rules.isJade(eq.slot) || eq.level === '' || eq.level == null ? '' : eq.level + ' 级';
}
function reset() {
    group.value = '';
    slot.value = '';
    status.value = '';
    kw.value = '';
}
/** 配置到「正在查看的那一套」：仓库里换装与栏里点空格是同一个动作。 */
async function equip(eq: EquipmentItem) {
    if (app.busy) return;
    try {
        await app.execute((domain) =>
            domain.commitEquipment(() =>
                domain.assignEquipment(
                    props.profile.id,
                    props.profile.viewedEquipmentSet,
                    eq.slot,
                    eq.id,
                ),
            ),
        );
        app.notify(
            '已配置到「' +
                props.profile.equipmentSets[props.profile.viewedEquipmentSet].name +
                '」',
        );
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
</script>

<template>
    <section class="eq-warehouse">
        <div class="eq-filters">
            <BaseSelect v-model="group" label="装备类型筛选" :options="groupOptions" />
            <BaseSelect v-model="slot" label="装备部位筛选" :options="slotOptions" />
            <BaseSelect v-model="status" label="装备状态筛选" :options="statusOptions" />
            <input
                v-model="kw"
                class="eq-search"
                type="search"
                placeholder="搜索名称 / 属性 / 特技"
                aria-label="搜索装备"
            />
            <button class="btn compact" type="button" @click="reset">重置</button>
        </div>
        <p class="eq-warehouse-count">
            共
            <b>{{ own.length }}</b>
            件档案 · 当前筛选 {{ rows.length }} 件 · 穿戴目标「{{
                profile.equipmentSets[profile.viewedEquipmentSet].name
            }}」
        </p>
        <div v-if="rows.length" class="eq-table">
            <div class="eq-row eq-row-head">
                <span>部位 / 名称</span>
                <span>属性</span>
                <span>状态 / 引用</span>
                <span class="eq-ops-head">操作</span>
            </div>
            <div v-for="eq in rows" :key="eq.id" class="eq-row" :data-equipment="eq.id">
                <span class="eq-cell-name">
                    <span class="eq-cell-slot">
                        {{ eq.slot }}
                        <template v-if="levelText(eq)">· {{ levelText(eq) }}</template>
                    </span>
                    <button type="button" class="eq-name-button" @click="emit('detail', eq)">
                        {{ eq.name }}
                    </button>
                </span>
                <EquipmentProperties :eq="eq" :lines="5" />
                <span class="eq-cell-state">
                    <span class="badge" :class="statusOf(eq)">
                        {{ rules.equipmentStatuses[statusOf(eq)] }}
                    </span>
                    <small>
                        {{
                            referencesOf(eq)
                                .map((item) => item.name)
                                .join(' / ') || '未配置'
                        }}
                    </small>
                </span>
                <span class="eq-cell-ops">
                    <button
                        v-if="statusOf(eq) !== 'sold' && eq.slot !== '其他'"
                        class="btn compact"
                        type="button"
                        :disabled="app.busy || equippedIn(eq)"
                        :title="
                            equippedIn(eq)
                                ? '已经穿在「' +
                                  profile.equipmentSets[profile.viewedEquipmentSet].name +
                                  '」里'
                                : ''
                        "
                        @click="equip(eq)"
                    >
                        {{ equippedIn(eq) ? '已在本套' : '配置' }}
                    </button>
                    <button
                        class="btn compact"
                        type="button"
                        :disabled="app.busy"
                        @click="emit('log', eq)"
                    >
                        记变动
                    </button>
                    <button
                        class="btn compact"
                        type="button"
                        :disabled="app.busy"
                        @click="emit('edit', eq)"
                    >
                        编辑
                    </button>
                    <button
                        class="btn compact danger"
                        type="button"
                        :disabled="app.busy"
                        @click="emit('remove', eq)"
                    >
                        删除
                    </button>
                </span>
            </div>
        </div>
        <div v-else-if="own.length" class="empty eq-empty">
            <AppIcon name="archive" :size="30" />
            <p>没有符合筛选条件的装备，换个条件或重置。</p>
            <button class="btn" type="button" @click="reset">重置筛选</button>
        </div>
        <div v-else class="empty eq-empty">
            <AppIcon name="archive" :size="30" />
            <p>这个角色还没有装备档案。</p>
            <button class="btn primary" type="button" @click="emit('add')">＋ 新增装备</button>
        </div>
    </section>
</template>

<style scoped>
.eq-warehouse {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.eq-filters {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.eq-search {
    flex: 1;
    min-width: 180px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 12.5px;
}
.eq-search:focus {
    outline: 2px solid color-mix(in srgb, var(--gold) 45%, transparent);
    outline-offset: -1px;
}
.eq-warehouse-count {
    margin: 0;
    color: var(--muted);
    font-size: 11.5px;
}
.eq-warehouse-count b {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
}
.eq-table {
    border: 1px solid var(--line);
    border-radius: 4px;
    overflow: hidden;
}
.eq-row {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.4fr) 132px 216px;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    border-top: 1px solid var(--line);
    background: var(--paper);
}
.eq-row:first-child {
    border-top: 0;
}
.eq-row-head {
    padding: 7px 12px;
    background: var(--paper-2);
    color: var(--muted);
    font-size: 11.5px;
}
.eq-row:not(.eq-row-head):hover {
    background: var(--paper-2);
}
.eq-cell-name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.eq-cell-slot {
    color: var(--muted);
    font-size: 11px;
}
.eq-name-button {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    text-align: left;
    overflow-wrap: anywhere;
}
.eq-name-button:hover {
    color: var(--gold);
}
.eq-cell-state {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}
.eq-cell-state small {
    color: var(--muted);
    font-size: 11px;
    overflow-wrap: anywhere;
}
.eq-cell-ops {
    display: flex;
    justify-content: flex-end;
    gap: 5px;
}
.eq-ops-head {
    text-align: right;
}
.badge {
    align-self: flex-start;
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    font-size: 11px;
}
.badge.active {
    color: var(--green);
    border-color: #4a7c5973;
}
.badge.sold {
    color: var(--red);
    border-color: #b33a3a66;
}
.badge.standby {
    color: var(--gold);
    border-color: #a67c2e66;
}
.eq-empty {
    min-height: 220px;
    padding: 30px;
}
.eq-empty p {
    margin: 0;
}
@media (max-width: 1080px) {
    .eq-row {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 116px 190px;
    }
}
</style>
