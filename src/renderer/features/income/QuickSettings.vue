<script setup lang="ts">
import { ref } from 'vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';

/**
 * 点卡单价：只留每点多少钱。
 *
 * 「同时在线角色数」以前也在这张弹窗里，但它其实是个派生量——人数由实际开着的
 * 计时段表达，存一个数字下来只会跟真实成本对不上。现在成本 = 每小时 6 点 × 单价，
 * 再乘以段数，页面上不再需要人来填人数。
 *
 * 改完只影响之后的计时与补记，不改已经结算的会话。
 */
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();
const cardPrice = ref<number | string>(rules.state.quickSettings.cardPrice / 10000);
const dirty = ref(false);
const error = ref('');

async function save() {
    if (app.busy) return;
    error.value = '';
    try {
        await app.execute((domain) =>
            domain.commit(() =>
                domain.setQuickSettings({
                    cardPrice: U.wanToCash(cardPrice.value),
                }),
            ),
        );
        app.notify('点卡单价已更新');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal title="点卡单价" :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="hint">
            每小时每号按 6 点计算：点卡 = 6 点 ×
            单价。在线几个号由计时段数决定，不用另外填。改完只影响之后的计时与补记，不改已结算的记录。
        </p>
        <form id="quick-settings-form" class="settings-grid" @submit.prevent="save">
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
        <p class="hint preview">折算：每号每小时 {{ U.fmtMoney(6 * Number(cardPrice)) }}</p>
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
    grid-template-columns: 1fr;
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
