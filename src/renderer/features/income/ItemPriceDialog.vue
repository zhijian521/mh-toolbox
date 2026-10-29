<script setup lang="ts">
import { computed, ref } from 'vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import NumberStepper from '../../components/NumberStepper.vue';
import NumberValue from '../../components/NumberValue.vue';

/**
 * 填写速记物品的单价。
 *
 * 单价按「万」输入，领域里存的是游戏币原值（1.5 万存 15000）。
 * `once = false`：固定价格的物品，保存后写回单价表，以后点一下直接按它记。
 * `once = true`：不固定价格的物品，只借这一条记录用，不写回——这类物品价格随
 * 等级和品类浮动，留一个「参考价」反而会记错账。
 */
const props = defineProps<{ id: number; name: string; thenAdd?: boolean; once?: boolean }>();
const emit = defineEmits<{ close: []; saved: [price?: number] }>();
const app = useApplication();
const rules = app.rules();
const current = props.once ? 0 : rules.itemPrice(props.id) / 10000;
const price = ref<number | string>(current || '');
const initial = String(price.value);
const dirty = computed(() => initial !== String(price.value));
const error = ref('');
const parsed = computed(() => {
    if (price.value === '') return null;
    const value = Number(price.value);
    return Number.isFinite(value) && value > 0 ? value : null;
});

async function save() {
    if (app.busy) return;
    error.value = '';
    if (parsed.value === null) {
        error.value = '请填写大于 0 的单价';
        return;
    }
    const raw = U.wanToCash(parsed.value);
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
        <form id="item-price-form" @submit.prevent="save">
            <fieldset :disabled="app.busy">
                <p class="price-subject">{{ name }}</p>
                <NumberStepper
                    v-model="price"
                    name="price"
                    unit="万"
                    placeholder="填单价"
                    decimal
                    autofocus
                />
                <p class="price-preview">
                    估值
                    <NumberValue :value="parsed" unit="万" />
                </p>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="item-price-form" :disabled="app.busy">
                {{ once ? '记录' : thenAdd ? '保存并记录' : '保存单价' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.price-subject {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    text-align: center;
}
.price-preview {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    margin: 0;
    padding: 8px 0 2px;
    color: var(--gold);
    font-size: 13px;
}
</style>
