<script setup lang="ts">
import { ref } from 'vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';

/**
 * 点卡参数：同时在线角色数与每点单价。
 *
 * 这两项决定计时结束时结算的点卡成本（`sessionSlices` 里 每小时 6 点 × 角色数 × 单价），
 * 只影响之后的计时，不改已经结算的会话。
 */
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();
const settings = rules.state.quickSettings;
const accounts = ref<number | string>(settings.accounts);
const cardPrice = ref<number | string>(settings.cardPrice / 10000);
const dirty = ref(false);
const error = ref('');

async function save() {
    if (app.busy) return;
    error.value = '';
    try {
        await app.execute((domain) =>
            domain.commit(() =>
                domain.setQuickSettings({
                    accounts: Number(accounts.value),
                    cardPrice: Math.round(Number(cardPrice.value) * 10000),
                }),
            ),
        );
        app.notify('点卡参数已更新');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal title="点卡参数" :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="hint">
            每小时按 6 点计算：角色数 × 6 点 × 单价。改完只影响之后的计时，不改已结算的记录。
        </p>
        <form id="quick-settings-form" class="settings-grid" @submit.prevent="save">
            <label>
                同时在线角色数
                <BaseNumber
                    v-model="accounts"
                    name="accounts"
                    :min="1"
                    :max="99"
                    @update:model-value="dirty = true"
                />
            </label>
            <label>
                点卡单价（万 / 点）
                <BaseNumber
                    v-model="cardPrice"
                    name="cardPrice"
                    :min="0"
                    :step="0.01"
                    @update:model-value="dirty = true"
                />
            </label>
        </form>
        <p class="hint preview">
            折算：{{ U.fmtMoney(Number(accounts) * 6 * Number(cardPrice)) }} / 小时
        </p>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button
                class="btn primary"
                type="submit"
                form="quick-settings-form"
                :disabled="app.busy"
            >
                保存
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 14px;
}
.settings-grid label {
    display: block;
    gap: 4px;
    font-size: 12.5px;
}
.preview {
    margin: 12px 0 0;
    font-size: 12px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
