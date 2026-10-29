<script setup lang="ts">
import { computed, ref } from 'vue';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseCheck from '../../components/BaseCheck.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';

const props = defineProps<{ characterId: string }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();
const profile = rules.equipmentProfile(props.characterId);

/**
 * 命魂之玉：三套方案共用的一个开关。
 *
 * 它同时是玉魄两个格子的解锁条件——没解锁时格子显示「未解锁」且点不进去，所以
 * 这里取消勾选要顺手把三套里的玉魄都摘掉：留着引用却显示未解锁，会出现「栏里
 * 没有玉魄、仓库却说它挂在方案一」的矛盾。
 */
const unlocked = ref(profile.soulJade.unlocked);
const attribute = ref(profile.soulJade.attribute);
const level = ref<number | string>(profile.soulJade.level);
const dirty = ref(false);
const error = ref('');

const attributeOptions = computed(() =>
    rules.soulAttributes.map((item) => ({ value: item, label: item })),
);

async function save() {
    if (app.busy) return;
    error.value = '';
    const value = Number(level.value);
    if (unlocked.value && (!Number.isInteger(value) || value < 0 || value > 15)) {
        error.value = '修炼等级需为 0～15 的整数';
        return;
    }
    if (unlocked.value && !attribute.value) {
        error.value = '请选择基础属性';
        return;
    }
    try {
        await app.execute((domain) =>
            domain.commitEquipment(() => {
                const target = domain.equipmentProfile(props.characterId);
                target.soulJade = {
                    unlocked: unlocked.value,
                    attribute: attribute.value,
                    level: Number.isInteger(value) ? value : 0,
                };
                if (!unlocked.value)
                    target.equipmentSets.forEach((set) =>
                        domain.equipmentGroups.jade.slots.forEach((slot) => {
                            delete set.slots[slot];
                        }),
                    );
            }),
        );
        app.notify('命魂之玉已保存');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal title="命魂之玉 · 修炼设置" :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="hint">三套方案共用。取消解锁会卸下三套里的玉魄，装备档案仍留在仓库。</p>
        <form id="soul-jade-form" class="form-grid soul-form" @submit.prevent="save">
            <BaseCheck v-model="unlocked" class="full" name="unlocked" @change="dirty = true">
                已解锁命魂之玉
            </BaseCheck>
            <label class="full">
                基础属性
                <BaseSelect
                    v-model="attribute"
                    label="命魂之玉基础属性"
                    :options="attributeOptions"
                    :disabled="!unlocked"
                    @update:model-value="dirty = true"
                />
            </label>
            <label class="full">
                修炼等级
                <BaseNumber
                    v-model="level"
                    name="level"
                    :min="0"
                    :max="15"
                    :disabled="!unlocked"
                    @update:model-value="dirty = true"
                />
            </label>
        </form>
        <p class="hint soul-hint">0～15 级，以游戏内实际修炼为准。</p>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="soul-jade-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : '保存' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.soul-form {
    margin-top: 14px;
}
/* 勾选项自带横排布局，不能和字段标签一样 block 化。 */
.soul-form label:not(.check) {
    display: block;
    font-size: 12.5px;
}
.soul-form .check {
    font-size: 12.5px;
}
.soul-hint {
    margin: 10px 0 0;
    font-size: 11.5px;
}
</style>
