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
 * 记一笔账号收支。
 *
 * 币种决定金额的单位与汇总归属：人民币按元记，梦幻币按万记，两者永远不混算。
 * 手续费的方向由领域统一处理（收入扣、支出加），这里只负责把金额填进去。
 *
 * 装备关联暂时留空：账号页的「买入 / 卖出装备」原本会同步装备状态，但装备页
 * 还没迁移，界面上无从建档。编辑旧记录时保留原值，不因这次保存把关联清掉。
 */
const props = defineProps<{ tx?: Transaction; preset?: Record<string, unknown> }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

const seed = props.tx;
const preset = props.preset ?? {};
const draft = reactive({
    characterId: seed?.characterId ?? String(preset.characterId ?? app.characters[0]?.id ?? ''),
    date: seed?.date ?? String(preset.date ?? U.today()),
    kind: (seed?.kind ?? preset.kind ?? 'expense') as 'income' | 'expense',
    currency: String(seed?.currency ?? preset.currency ?? 'rmb'),
    category: seed?.category ?? String(preset.category ?? '装备交易'),
    channel: seed?.channel ?? String(preset.channel ?? '藏宝阁'),
    amount: (seed?.amount ?? preset.amount ?? '') as number | string,
    fee: (seed?.fee ?? preset.fee ?? 0) as number | string,
    note: seed?.note ?? '',
});
const initial = JSON.stringify(draft);
const invalidEdit = ref(false),
    error = ref('');
const dirty = computed(() => invalidEdit.value || JSON.stringify(draft) !== initial);

const characterOptions = computed(() =>
    app.characters.map((item) => ({ value: item.id, label: item.name })),
);
const currencyOptions = computed(() => {
    const options = [
        { value: 'rmb', label: '人民币 · 元' },
        { value: 'cash', label: '梦幻币 · 万' },
    ];
    // 旧数据里的储备金记录仍可编辑，但不作为新选项提供。
    if (draft.currency === 'reserve')
        options.push({ value: 'reserve', label: '储备金 · 万（旧记录）' });
    return options;
});
const kindOptions = [
    { value: 'expense', label: '支出 / 买入' },
    { value: 'income', label: '收入 / 卖出' },
];
const channelOptions = computed(() => rules.channels.map((item) => ({ value: item, label: item })));
const categoryOptions = computed(() => {
    const options = rules.accountCats.map((item) => ({ value: item, label: item }));
    // 历史分类可能已从常量里删除，补回去避免下拉悄悄跳到首项。
    if (draft.category && !options.some((item) => item.value === draft.category))
        options.push({ value: draft.category, label: draft.category });
    return options;
});
const unitLabel = computed(() => (draft.currency === 'rmb' ? '元' : '万'));
const amountLabel = computed(() => '成交金额（' + unitLabel.value + '）');
const feeLabel = computed(() => '手续费（' + unitLabel.value + '）');

// 点卡两条各自绑定币种与渠道：官方充值走人民币，游戏内买卡走梦幻币。
// 只在新建时联动，编辑旧记录一律按原值，不被这条规则改写。
watch(
    () => draft.category,
    (category) => {
        if (props.tx) return;
        if (category === '点卡充值') {
            draft.kind = 'expense';
            draft.currency = 'rmb';
            draft.channel = '官方充值';
        } else if (category === '点卡购买') {
            draft.kind = 'expense';
            draft.currency = 'cash';
            draft.channel = '游戏内';
        }
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
    // 留空表示没填，不是 0：`Number('')` 会得 0，直接落到一条 ¥0.00 的记录上。
    if (draft.amount === '' || draft.amount === null || draft.amount === undefined) {
        error.value = '请填写成交金额';
        // 错误提示在表单底部，把焦点带回出错的字段。
        document.querySelector<HTMLElement>('#account-form [name="amount"]')?.focus();
        return;
    }
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount)) {
        error.value = '请填写有效的成交金额';
        return;
    }
    const fee = Number(draft.fee || 0);
    if (draft.kind === 'income' && fee > amount) {
        error.value = '手续费不能超过收入金额';
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
                    channel: draft.channel,
                    amount,
                    fee,
                    note: draft.note.trim(),
                    ledger: 'account',
                    // 时长与记录形态不属于这张表单：新建按「金额记录」，编辑保留原值。
                    recordType: props.tx?.recordType ?? 'money',
                    minutes: props.tx?.minutes ?? 0,
                    // 装备页尚未迁移：旧记录带着关联就原样保留，不在这里清掉。
                    equipmentId: props.tx?.equipmentId ?? '',
                    gearAction: props.tx?.gearAction ?? '',
                }),
                props.tx?.id,
            ),
        );
        app.notify(props.tx ? '记录已更新' : '已记入账号账本');
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal
        :title="tx ? '编辑账号收支' : '记账号收支'"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <form id="account-form" @submit.prevent="save" @input="captureInput">
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
                        分类
                        <BaseSelect
                            v-model="draft.category"
                            label="收支分类"
                            :options="categoryOptions"
                        />
                    </label>
                    <label>
                        收支方向
                        <BaseSelect v-model="draft.kind" label="收支方向" :options="kindOptions" />
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
                        交易渠道
                        <BaseSelect
                            v-model="draft.channel"
                            label="交易渠道"
                            :options="channelOptions"
                        />
                    </label>
                    <label>
                        {{ amountLabel }}
                        <BaseNumber v-model="draft.amount" name="amount" :min="0" :step="0.01" />
                    </label>
                    <label>
                        {{ feeLabel }}
                        <BaseNumber v-model="draft.fee" name="fee" :min="0" :step="0.01" />
                    </label>
                    <p class="hint fee-hint full">
                        收入扣手续费、支出加手续费；手续费与成交金额同币种。
                    </p>
                    <label class="full">
                        记录内容 / 备注
                        <input
                            v-model="draft.note"
                            name="note"
                            placeholder="如：藏宝阁购入简易武器 / 充值 100 元点卡"
                        />
                    </label>
                </div>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <span class="hint footer-hint">金额按{{ unitLabel }}记，汇总时两本账分开算。</span>
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="account-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : tx ? '保存记录' : '记入' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.fee-hint {
    margin-top: -2px;
    font-size: 12px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
