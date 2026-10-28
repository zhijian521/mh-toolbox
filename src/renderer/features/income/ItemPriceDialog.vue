<script setup lang="ts">
import { ref } from 'vue';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';

/**
 * 填写速记物品的单价。
 *
 * 单价按「万」输入，领域里存的是游戏币原值（1.5 万存 15000），点卡单价同理。
 * 固定价格的物品走 `once = false`：保存后写回单价表，以后点击直接按它记。
 * 不固定价格的物品走 `once = true`：只借这一条记录用，不写回单价表——
 * 这类物品价格随等级和品类浮动，留一个「参考价」反而会记错账。
 */
const props = defineProps<{ id: number; name: string; thenAdd?: boolean; once?: boolean }>();
const emit = defineEmits<{ close: []; saved: [price?: number] }>();
const app = useApplication();
const rules = app.rules();
const current = props.once ? 0 : rules.itemPrice(props.id);
const price = ref<number | string>(current ? current / 10000 : '');
const dirty = ref(false);
const error = ref('');

async function save() {
    if (app.busy) return;
    error.value = '';
    const value = Number(price.value);
    if (price.value === '' || !Number.isFinite(value) || value <= 0) {
        error.value = '请填写大于 0 的单价';
        return;
    }
    const raw = Math.round(value * 10000);
    try {
        if (!props.once)
            await app.execute((domain) =>
                domain.commit(() => domain.setItemPrice(String(props.id), raw)),
            );
        emit('saved', raw);
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal
        :title="once ? '填写本次单价' : '设置单价'"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <p class="dialog-subject">{{ name }}</p>
        <p v-if="once" class="hint">
            这类物品价格随等级和品类浮动，填的单价只用于这一条记录的估值，不会保存。
        </p>
        <p v-else class="hint">
            单价按万记，只用于速记时的参考估值；物品卖出后仍以成交金额结算收入。
        </p>
        <form id="item-price-form" class="price-form" @submit.prevent="save">
            <label>
                单价（万）
                <BaseNumber
                    v-model="price"
                    name="price"
                    :min="0"
                    :step="0.1"
                    @update:model-value="dirty = true"
                />
            </label>
        </form>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="item-price-form" :disabled="app.busy">
                {{ once ? '记录' : thenAdd ? '保存并记录' : '保存单价' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.dialog-subject {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
}
.price-form {
    margin-top: 14px;
}
.price-form label {
    display: block;
    gap: 4px;
    font-size: 12.5px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
