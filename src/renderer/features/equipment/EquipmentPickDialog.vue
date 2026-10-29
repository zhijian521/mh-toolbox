<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import EquipmentProperties from './EquipmentProperties.vue';

const props = defineProps<{ profile: EquipmentProfile; index: number; part: string }>();
const emit = defineEmits<{ close: []; saved: []; add: []; shot: [] }>();
const app = useApplication();
const rules = app.rules();
const error = ref('');

/**
 * 从仓库挑一件穿到指定方案。
 *
 * 候选只包含「这个角色、这个部位、没卖」的档案：跨角色的装备不能借穿，已出售的
 * 更不能重新挂上去——领域会在 `assignEquipment` 里再挡一次，这里先筛掉是为了
 * 不让人点了才看到报错。
 */
const current = computed(() => props.profile.equipmentSets[props.index]?.slots[props.part] || '');
const candidates = computed<EquipmentItem[]>(() => {
    void app.data;
    return (app.data?.equipment || []).filter(
        (item) =>
            item.characterId === props.profile.id &&
            item.slot === props.part &&
            item.status !== 'sold',
    );
});
function referencesOf(eq: EquipmentItem) {
    return rules.equipmentReferences(eq.id);
}

async function assign(id: string) {
    if (app.busy) return;
    error.value = '';
    try {
        await app.execute((domain) =>
            domain.commitEquipment(() =>
                domain.assignEquipment(props.profile.id, props.index, props.part, id),
            ),
        );
        app.notify(id ? '已更新装备搭配' : '已卸下，档案保留在仓库');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal
        :title="profile.equipmentSets[index].name + ' · 选择' + part"
        :busy="app.busy"
        @close="emit('close')"
    >
        <p class="hint">从「{{ profile.name }}」的仓库里选，替换只影响这一套方案。</p>
        <div v-if="candidates.length" class="eq-picker">
            <button
                v-for="eq in candidates"
                :key="eq.id"
                type="button"
                class="eq-pick"
                :class="{ current: eq.id === current }"
                :disabled="app.busy"
                @click="assign(eq.id)"
            >
                <span class="eq-pick-head">
                    <b>{{ eq.name }}</b>
                    <span v-if="eq.id === current" class="eq-pick-tag">当前</span>
                </span>
                <EquipmentProperties :eq="eq" />
                <small class="eq-pick-refs">
                    {{
                        referencesOf(eq)
                            .map((item) => item.name)
                            .join(' / ') || '未配置'
                    }}
                </small>
            </button>
        </div>
        <p v-else class="hint eq-picker-empty">仓库里还没有这个部位的装备，可以直接新增。</p>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button v-if="current" class="btn" :disabled="app.busy" @click="assign('')">
                卸下本套
            </button>
            <button
                class="btn"
                type="button"
                :disabled="app.busy"
                title="截游戏里的装备图，本地识别后直接填入这一套"
                @click="emit('shot')"
            >
                截图识别
            </button>
            <button class="btn primary" type="button" :disabled="app.busy" @click="emit('add')">
                ＋ 新增并装备
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.eq-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
    max-height: 46vh;
    overflow: auto;
}
.eq-pick {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper);
    text-align: left;
}
.eq-pick:hover:not(:disabled) {
    border-color: var(--gold);
    background: var(--paper-2);
}
.eq-pick.current {
    border-color: var(--line-2);
    background: var(--panel-3);
}
.eq-pick-head {
    display: flex;
    align-items: center;
    gap: 6px;
}
.eq-pick-head b {
    font-size: 13px;
}
.eq-pick-tag {
    padding: 0 5px;
    border: 1px solid var(--green);
    border-radius: 3px;
    color: var(--green);
    font-size: 10.5px;
}
.eq-pick-refs {
    color: var(--muted);
    font-size: 11px;
}
.eq-picker-empty {
    margin: 16px 0 0;
}
</style>
