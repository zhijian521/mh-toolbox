<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';

/**
 * 三套方案的改名与复制。
 *
 * 两件事放在一个弹窗里，是因为它们改的是同一个对象、都从「我正在看的这一套」出发：
 * 改名改三套的标签，复制把当前这套的搭配覆盖到另一套。V1 分成两个入口，用户在
 * 「想给方案起名」和「想换一套搭配」之间经常点错。
 *
 * 改名校验（非空、≤20 字、不重名）在领域里做：名称会出现在选装标题和「已在本套」
 * 的提示里，重名分不清指向哪一套。
 */
const props = defineProps<{
    profile: EquipmentProfile;
    mode: 'rename' | 'copy';
    /** 复制时以哪一套为源；缺省用正在查看的那套。 */
    from?: number;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

const names = ref(props.profile.equipmentSets.map((set) => set.name));
const from = computed(() => props.from ?? props.profile.viewedEquipmentSet);
const copying = computed(() => props.mode === 'copy');
const target = ref(String([0, 1, 2].find((index) => index !== from.value) ?? 0));
const dirty = ref(false);
const error = ref('');

const targetOptions = computed(() =>
    props.profile.equipmentSets
        .map((set, index) => ({ value: String(index), label: set.name }))
        .filter((item) => Number(item.value) !== from.value),
);
const title = computed(() =>
    copying.value
        ? '复制「' + (props.profile.equipmentSets[from.value]?.name || '') + '」'
        : '装备方案改名',
);
const hint = computed(() =>
    copying.value
        ? '把这一套的搭配覆盖到目标方案，目标名称保留；装备档案与账本收支都不受影响。'
        : '名称最多 20 个字，三套不能重名。改名不影响任何搭配。',
);

async function save() {
    if (app.busy) return;
    error.value = '';
    try {
        await app.execute((domain) =>
            domain.commitEquipment(() => {
                if (copying.value)
                    domain.copyEquipmentSet(props.profile.id, from.value, Number(target.value));
                else domain.renameEquipmentSet(props.profile.id, names.value);
            }),
        );
        app.notify(copying.value ? '装备搭配已复制' : '方案名称已保存');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal :title="title" :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="hint">{{ hint }}</p>
        <form id="plan-form" class="plan-form" @submit.prevent="save">
            <template v-if="copying">
                <label>
                    复制到
                    <BaseSelect
                        v-model="target"
                        label="复制到哪一套"
                        :options="targetOptions"
                        @update:model-value="dirty = true"
                    />
                </label>
                <p class="hint">
                    目标方案原来的搭配会被覆盖（档案都还在仓库里，「已在本套」会跟着变）。
                </p>
            </template>
            <template v-else>
                <label v-for="(name, index) in names" :key="index">
                    {{ rules.equipmentSetNames[index] || '方案 ' + (index + 1) }}
                    <input
                        v-model="names[index]"
                        type="text"
                        :name="'set-' + index"
                        :maxlength="20"
                        required
                        @input="dirty = true"
                    />
                </label>
            </template>
        </form>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="plan-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : copying ? '覆盖目标方案' : '保存名称' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.plan-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
}
.plan-form label {
    display: block;
    font-size: 12.5px;
}
.plan-form input {
    margin-top: 4px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
