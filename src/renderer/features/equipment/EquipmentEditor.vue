<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';

const props = defineProps<{
    /** 编辑时传入；新增时为空。 */
    eq?: EquipmentItem | null;
    profile: EquipmentProfile;
    /** 从格子进来的上下文：存完直接放进那一套。 */
    context?: { index: number; slot: string } | null;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

/**
 * 新增 / 编辑装备档案。
 *
 * 这一批只管「这件装备是什么」：角色、部位、名称、等级、持有状态、备注。结构化属性
 * （词条、宝石、特技、玉魄灵尘）留给下一批的属性编辑器——它们的校验规则比这里复杂得多，
 * 混在一起会让这个弹窗变成第二个领域层。
 *
 * 两个临时约束，等属性编辑器就位后解除：
 * 1. 新增时不能选玉魄：玉魄必须同时提供三条属性与开光信息，没有属性区就填不出合法档案。
 * 2. 编辑时不能改部位：属性按部位分组，换了部位却留着旧词条会得到一条部位与词条对不上的档案。
 */
const editing = computed(() => props.eq || null);
const characterId = ref(props.eq?.characterId || props.profile.id);
const slot = ref(props.eq?.slot || props.context?.slot || '武器');
const name = ref(props.eq?.name || '');
const level = ref<number | string>(props.eq?.level ?? '');
const status = ref(props.eq?.status === 'sold' ? 'sold' : 'stored');
const note = ref(props.eq?.note || '');
const equipNow = ref(!!props.context);
const dirty = ref(false);
const error = ref('');

const characterOptions = computed(() =>
    app.characters.map((item) => ({ value: item.id, label: item.name })),
);
/** 新增时排除玉魄：它必须同时提供三条属性与开光信息，这一批还没有属性编辑器。 */
const slotOptions = computed(() =>
    rules.slots
        .filter((item) => (props.eq ? true : !rules.isJade(item)))
        .map((item) => ({ value: item, label: item })),
);
const statusOptions = computed(() => [
    { value: 'stored', label: '持有' },
    { value: 'sold', label: '已出售' },
]);
/** 存完是否顺手穿上：只在新增、且部位能穿时才问。 */
const canEquipNow = computed(() => !editing.value && slot.value !== '其他');

async function save() {
    if (app.busy) return;
    error.value = '';
    if (!name.value.trim()) {
        error.value = '请填写装备名称';
        return;
    }
    try {
        const record: Record<string, unknown> = {
            characterId: characterId.value,
            slot: slot.value,
            name: name.value.trim(),
            // 玉魄没有装备等级，领域保存时也会把它置空，这里先按空串传。
            level: rules.isJade(slot.value) ? '' : level.value === '' ? '' : Number(level.value),
            status: status.value,
            note: note.value.trim(),
        };
        /**
         * 编辑时把现有属性原样回写。
         *
         * 不传的话领域会走玉魄分支要求 `jade`，普通装备则会静默保留旧 `details`——
         * 两条路径对「只改了个备注」这种事都不友好。回写一次等于让旧文本属性顺手
         * 规范化成结构化的第 1 版，读取路径的 `repairEquipmentDetails` 已保证它能过校验。
         */
        if (props.eq) record.details = rules.equipmentDetails(props.eq);
        await app.execute((domain) =>
            domain.commitEquipment(() => {
                const saved = domain.saveEquipment(record, props.eq?.id);
                if (canEquipNow.value && equipNow.value && status.value !== 'sold')
                    domain.assignEquipment(
                        characterId.value,
                        props.context?.index ?? props.profile.viewedEquipmentSet,
                        slot.value,
                        saved.id,
                    );
            }),
        );
        app.notify(editing.value ? '装备档案已保存' : '装备已登记');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal
        :title="editing ? '编辑装备档案' : '新增装备档案'"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <p v-if="editing" class="hint">
            属性词条在下一批的属性编辑器里维护；这里改的是档案信息，不会动已有属性。
        </p>
        <form id="equipment-form" class="form-grid eq-form" @submit.prevent="save">
            <label>
                角色
                <BaseSelect
                    v-model="characterId"
                    label="装备所属角色"
                    :options="characterOptions"
                    @update:model-value="dirty = true"
                />
            </label>
            <label>
                部位
                <BaseSelect
                    v-model="slot"
                    label="装备部位"
                    :options="slotOptions"
                    :disabled="!!editing"
                    @update:model-value="dirty = true"
                />
            </label>
            <label class="full">
                装备名称
                <input
                    v-model="name"
                    type="text"
                    name="name"
                    placeholder="按游戏里的名称填写"
                    required
                    @input="dirty = true"
                />
            </label>
            <label v-if="!rules.isJade(slot)">
                装备等级
                <BaseNumber
                    v-model="level"
                    name="level"
                    :min="0"
                    :max="999"
                    placeholder="可不填"
                    @update:model-value="dirty = true"
                />
            </label>
            <label>
                持有状态
                <BaseSelect
                    v-model="status"
                    label="持有状态"
                    :options="statusOptions"
                    @update:model-value="dirty = true"
                />
            </label>
            <label v-if="canEquipNow" class="check full">
                <input v-model="equipNow" type="checkbox" name="equipNow" @change="dirty = true" />
                保存后放进正在查看的方案（替换该部位，原档案保留）
            </label>
            <label class="full">
                备注
                <textarea
                    v-model="note"
                    name="note"
                    rows="2"
                    placeholder="可不填"
                    @input="dirty = true"
                ></textarea>
            </label>
        </form>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="equipment-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : editing ? '保存' : '登记装备' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.eq-form {
    margin-top: 14px;
}
.eq-form label {
    display: block;
    font-size: 12.5px;
}
.check {
    display: flex;
    align-items: center;
    gap: 7px;
}
.check input {
    width: 15px;
    height: 15px;
    margin: 0;
    accent-color: var(--gold);
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
