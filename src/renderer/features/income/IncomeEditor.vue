<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';

/**
 * 记一笔游戏内收益。
 *
 * 只处理 `recordType: 'money'` 的普通收支；物品的获得、出售与库存属于物品模块，
 * 这里保存时不动 `itemRecordId` / `saleQuantity`，成交记录的编辑入口也暂不开放。
 *
 * 收益账本不收人民币（`saveTransaction` 会拒绝），币种只有梦幻币与储备金。
 */
const props = defineProps<{ tx?: Transaction }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

const seed = props.tx;
const draft = reactive({
    characterId: seed?.characterId ?? app.characters[0]?.id ?? '',
    date: seed?.date ?? U.today(),
    kind: (seed?.kind ?? 'income') as 'income' | 'expense',
    currency: (seed?.currency === 'reserve' ? 'reserve' : 'cash') as 'cash' | 'reserve',
    category: seed?.category ?? rules.incomeCats[0],
    amount: (seed?.amount ?? '') as number | string,
    note: seed?.note ?? '',
});
const initial = JSON.stringify(draft);
const invalidEdit = ref(false),
    error = ref('');
const dirty = computed(() => invalidEdit.value || JSON.stringify(draft) !== initial);

const characterOptions = computed(() =>
    app.characters.map((item) => ({ value: item.id, label: item.name })),
);
const kindOptions = [
    { value: 'income', label: '收入' },
    { value: 'expense', label: '支出' },
];
const currencyOptions = [
    { value: 'cash', label: '梦幻币 · 万' },
    { value: 'reserve', label: '储备金 · 万' },
];
/** 收入与支出各有一套分类，切换方向时把分类一起换过去。 */
const categoryOptions = computed(() =>
    (draft.kind === 'income' ? rules.incomeCats : rules.expenseCats).map((item) => ({
        value: item,
        label: item,
    })),
);
const unitLabel = computed(() => (draft.currency === 'reserve' ? '储备金' : '梦幻币'));
watch(
    () => draft.kind,
    () => {
        if (!categoryOptions.value.some((item) => item.value === draft.category))
            draft.category = categoryOptions.value[0]?.value ?? '';
    },
);
/** `badInput` 只在数字框里打了非法内容时为真；每次输入重算，清空后不再算脏。 */
function captureInput(event: Event) {
    const form = event.currentTarget;
    if (!(form instanceof HTMLElement)) return;
    invalidEdit.value = [...form.querySelectorAll('input')].some(
        (input) => input.validity.badInput,
    );
}
async function save() {
    if (app.busy) return;
    error.value = '';
    if (draft.amount === '' || draft.amount === null || draft.amount === undefined) {
        error.value = '请填写金额';
        document.querySelector<HTMLElement>('#income-form [name="amount"]')?.focus();
        return;
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount)) {
        error.value = '请填写有效金额';
        return;
    }
    try {
        await app.execute((domain) =>
            domain.saveTransaction(
                plain({
                    characterId: draft.characterId,
                    date: draft.date,
                    kind: draft.kind,
                    currency: draft.currency,
                    category: draft.category,
                    // 收益页不提供渠道选择，新建按「游戏内」，编辑旧记录保留原渠道。
                    channel: props.tx?.channel ?? '游戏内',
                    amount,
                    // 收益不记手续费，但编辑旧记录时保留原值，不主动清零。
                    fee: props.tx?.fee ?? 0,
                    note: draft.note.trim(),
                    ledger: 'earnings',
                    recordType: props.tx?.recordType ?? 'money',
                    minutes: props.tx?.minutes ?? 0,
                }),
                props.tx?.id,
            ),
        );
        app.notify(props.tx ? '记录已更新' : '已记入收益账本');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal
        :title="tx ? '编辑收益记录' : '记一笔收益'"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <form id="income-form" @submit.prevent="save" @input="captureInput">
            <fieldset :disabled="app.busy">
                <div class="form-grid">
                    <label>
                        角色
                        <BaseSelect
                            v-model="draft.characterId"
                            label="记账角色"
                            :options="characterOptions"
                        />
                    </label>
                    <label>
                        日期
                        <BaseDate v-model="draft.date" label="记账日期" :max="U.today()" required />
                    </label>
                    <label>
                        收支方向
                        <BaseSelect v-model="draft.kind" label="收支方向" :options="kindOptions" />
                    </label>
                    <label>
                        分类
                        <BaseSelect
                            v-model="draft.category"
                            label="收益分类"
                            :options="categoryOptions"
                        />
                    </label>
                    <label>
                        币种
                        <BaseSelect
                            v-model="draft.currency"
                            label="记账币种"
                            :options="currencyOptions"
                        />
                    </label>
                    <label>
                        金额（万）
                        <BaseNumber v-model="draft.amount" name="amount" :min="0" :step="0.01" />
                    </label>
                    <label class="full">
                        记录内容 / 备注
                        <input
                            v-model="draft.note"
                            name="note"
                            placeholder="如：抓鬼两小时 / 卖了两张藏宝图"
                        />
                    </label>
                </div>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <span class="hint footer-hint">金额单位为万，{{ unitLabel }}不计入人民币账本。</span>
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="income-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : tx ? '保存记录' : '记入' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
