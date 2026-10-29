<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EquipmentItem } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import BaseDate from '../../components/BaseDate.vue';

const props = defineProps<{ eq: EquipmentItem }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

/**
 * 记一次装备变动：购入、售出、打造、强化……
 *
 * 「同时记入账号账本」默认勾上，因为这是用户真正想要的账——装备花了多少、卖了多少。
 * 勾选后领域会写一条带 `equipmentId` 的账号流水并双向关联，编辑那条流水会回写这里
 * 的时间线；不勾则只留一份装备变动记录，不动账本。
 */
const date = ref(U.today());
const action = ref('buy');
const currency = ref('cash');
const channel = ref(rules.channels[0]);
const amount = ref<number | string>('');
const sync = ref(true);
const note = ref('');
const dirty = ref(false);
const error = ref('');

/** 玉魄没有打造与镶嵌宝石，普通装备没有灵尘与开光——两边各去掉不适用于自己的动作。 */
const actions = computed(() =>
    rules.gearActions.filter((item) =>
        rules.isJade(props.eq.slot)
            ? !['craft', 'gem'].includes(item.v)
            : !['dust', 'consecrate'].includes(item.v),
    ),
);
const actionOptions = computed(() =>
    actions.value.map((item) => ({ value: item.v, label: item.t })),
);
const currencyOptions = [
    { value: 'cash', label: '梦幻币 · 万' },
    { value: 'rmb', label: '人民币 · 元' },
];
const channelOptions = computed(() => rules.channels.map((item) => ({ value: item, label: item })));
const current = computed(() => rules.gearAction(action.value));
/** 只有产生收支的动作才谈得上记账；「替换」「其他」只留一条变动记录。 */
const bookable = computed(() => current.value.dir !== 0);
const references = computed(() => rules.equipmentReferences(props.eq.id));

async function save() {
    if (app.busy) return;
    error.value = '';
    try {
        await app.execute((domain) =>
            domain.recordEquipmentChange(props.eq.id, {
                date: date.value,
                action: action.value,
                currency: currency.value,
                channel: channel.value,
                amount: amount.value === '' ? 0 : Number(amount.value),
                note: note.value,
                sync: bookable.value && sync.value,
            }),
        );
        app.notify('变动已记录');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal
        :title="'装备变动 · ' + eq.name"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <form id="gear-log-form" class="form-grid gear-form" @submit.prevent="save">
            <label>
                日期
                <BaseDate v-model="date" label="变动日期" :max="U.today()" required />
            </label>
            <label>
                动作
                <BaseSelect
                    v-model="action"
                    label="变动动作"
                    :options="actionOptions"
                    @update:model-value="dirty = true"
                />
            </label>
            <label>
                币种
                <BaseSelect
                    v-model="currency"
                    label="变动币种"
                    :options="currencyOptions"
                    @update:model-value="dirty = true"
                />
            </label>
            <label>
                渠道
                <BaseSelect
                    v-model="channel"
                    label="变动渠道"
                    :options="channelOptions"
                    @update:model-value="dirty = true"
                />
            </label>
            <label class="full">
                成交金额（{{ currency === 'rmb' ? '元' : '万梦幻币' }}）
                <BaseNumber
                    v-model="amount"
                    name="amount"
                    :min="0"
                    :step="0.01"
                    placeholder="可留空"
                    @update:model-value="dirty = true"
                />
            </label>
            <label v-if="bookable" class="check full">
                <input v-model="sync" type="checkbox" name="sync" @change="dirty = true" />
                同时记入账号账本（{{ current.t }}）
            </label>
            <label class="full">
                备注
                <input
                    v-model="note"
                    type="text"
                    name="note"
                    placeholder="可不填，默认写成「装备名 + 动作」"
                    @input="dirty = true"
                />
            </label>
        </form>
        <p v-if="action === 'sell' && references.length" class="hint gear-warn">
            售出会清空「{{ references.map((item) => item.name).join('、') }}」里的这一格；
            撤销那条流水后可以重新配置。
        </p>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="gear-log-form" :disabled="app.busy">
                {{ app.busy ? '记录中…' : '记录变动' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.gear-form {
    margin-top: 14px;
}
.gear-form label {
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
.gear-warn {
    margin: 12px 0 0;
    padding: 8px 10px;
    border: 1px solid var(--gold);
    border-radius: 3px;
    background: color-mix(in srgb, var(--gold) 8%, transparent);
    font-size: 12px;
    line-height: 1.6;
}
</style>
