<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import EquipmentFields from './EquipmentFields.vue';
import { pruneDetail, type DraftDetail } from './properties';

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
 * 属性区是独立组件（`EquipmentFields`），按部位生成八组字段；这里只管档案字段与保存。
 *
 * 部位可以改，且每个部位各留一份属性草稿：先按武器填了伤害、发现点错部位改成头盔、
 * 再改回武器时，刚才填的东西不该白丢。换部位后旧词条仍然留在草稿里，但保存前由领域
 * 按新部位严格校验，不支持的属性会明确报错，而不是悄悄带着一条对不上的词条存下来。
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

/** 每个部位一份属性草稿，换回来还能接着填。 */
const drafts = new Map<string, DraftDetail>();
function draftFor(target: string): DraftDetail {
    // 编辑已有档案时取它自己的属性，其余部位从空属性开始。
    if (props.eq && target === props.eq.slot)
        return rules.equipmentDetails(props.eq) as unknown as DraftDetail;
    return rules.emptyEquipmentDetails() as unknown as DraftDetail;
}
const detail = ref<DraftDetail>(draftFor(slot.value));
watch(slot, (next, previous) => {
    drafts.set(previous, detail.value);
    detail.value = drafts.get(next) || draftFor(next);
});
// 属性区直接改草稿对象、不逐项发事件，所以用深监听统一标脏。
watch(detail, () => (dirty.value = true), { deep: true });

const characterOptions = computed(() =>
    app.characters.map((item) => ({ value: item.id, label: item.name })),
);
const slotOptions = computed(() => rules.slots.map((item) => ({ value: item, label: item })));
const statusOptions = computed(() => [
    { value: 'stored', label: '持有' },
    { value: 'sold', label: '已出售' },
]);
/** 存完是否顺手穿上：只在新增、且部位能穿时才问。 */
const canEquipNow = computed(() => !editing.value && slot.value !== '其他');
const attributesHint = computed(() =>
    rules.equipmentRule(slot.value).kind === 'other'
        ? '「其他」没有固定词条，属性只能记在下面的原有内容里。'
        : '按游戏里显示的属性逐项填写，留空表示未记录。',
);

async function save() {
    if (app.busy) return;
    error.value = '';
    if (!name.value.trim()) {
        error.value = '请填写装备名称';
        return;
    }
    const jade = rules.isJade(slot.value);
    const details = pruneDetail(detail.value);
    /**
     * 玉魄必须有「一条基础 + 两条附加」。
     *
     * 领域对玉魄的严格校验只管格式，空属性本身是合法的——但那样会存下一件在栏里
     * 只有名字、看不出是什么的玉魄。导入路径也有同一条要求，两处保持一致。
     */
    if (jade && (details.base.length < 1 || details.extra.length < 2)) {
        error.value = '玉魄需要一条基础属性和两条附加属性';
        return;
    }
    try {
        const record: Record<string, unknown> = {
            characterId: characterId.value,
            slot: slot.value,
            name: name.value.trim(),
            // 玉魄没有装备等级，领域保存时也会把它置空，这里先按空串传。
            level: jade ? '' : level.value === '' ? '' : Number(level.value),
            status: status.value,
            note: note.value.trim(),
            details,
        };
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
        wide
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <!--
            两栏：左边只放「这件装备是谁的、叫什么」，右边属性区自己滚。
            原来一列到底，属性一多就要整窗滚动，名字和属性永远不能同时看见。
        -->
        <form id="equipment-form" class="eq-form" @submit.prevent="save">
            <div class="form-columns">
                <div class="col-info">
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
                        <input
                            v-model="equipNow"
                            type="checkbox"
                            name="equipNow"
                            @change="dirty = true"
                        />
                        保存后放进正在查看的方案（替换该部位，原档案保留）
                    </label>
                    <label class="full">
                        备注
                        <textarea
                            v-model="note"
                            name="note"
                            rows="3"
                            placeholder="可不填"
                            @input="dirty = true"
                        ></textarea>
                    </label>
                </div>
                <div class="col-attrs">
                    <div class="attrs-head">
                        <h3>属性</h3>
                        <span class="hint">{{ attributesHint }}</span>
                    </div>
                    <div class="attrs-body">
                        <EquipmentFields v-model="detail" :part="slot" />
                    </div>
                </div>
            </div>
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
.form-columns {
    display: grid;
    grid-template-columns: minmax(0, 340px) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
}
.col-info {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.col-info > .full {
    grid-column: 1 / -1;
}
.col-info label {
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
/*
 * 属性区是一条竖线隔开的独立卷轴：字段多的时候只滚里面的字段，左边的档案、
 * 上面的「属性」标题和底部按钮始终看得见。给整块加外框会和里面每组的横分隔线
 * 叠成两层线，只留一条竖线。
 */
.col-attrs {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-height: 58vh;
    padding-left: 16px;
    border-left: 1px solid var(--line);
}
.attrs-head {
    display: flex;
    align-items: baseline;
    flex: none;
    gap: 8px;
    margin-bottom: 12px;
}
.attrs-head h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
}
.attrs-head .hint {
    min-width: 0;
    font-size: 11.5px;
}
.attrs-body {
    min-height: 0;
    overflow: auto;
    padding-right: 10px;
}
@media (max-width: 900px) {
    .form-columns {
        grid-template-columns: minmax(0, 1fr);
    }
    .col-attrs {
        max-height: none;
        padding-top: 4px;
        padding-left: 0;
        border-left: 0;
    }
    .attrs-body {
        overflow: visible;
        padding-right: 0;
    }
}
</style>
