<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import { U } from '../../domain/util.js';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';

/**
 * 编辑一条已有的收益记录。
 *
 * 收益页不再提供「记一笔」：日常收益一律走物品速记，通用收支去账号页记。
 * 这里只处理 `recordType: 'money'` 的记录（速记里的「金币」、补记生成的点卡流水），
 * 物品与成交记录由物品模块管，不进这张表单。
 *
 * 收益账本只记梦幻币：不收人民币（`saveTransaction` 会拒绝），也不再提供储备金，
 * 保存时固定写 `cash`。
 */
const props = defineProps<{ tx: Transaction }>();
/**
 * `saved` 带上「改前 / 改后」两个日期：收益页只按这些天重算账号里的「游戏收益」。
 * 只传旧日期的话，把记录从 28 号改到 29 号，29 号那条收益永远不会被重新结算。
 */
const emit = defineEmits<{ close: []; saved: [dates: string[]]; remove: [] }>();
const app = useApplication();
const rules = app.rules();

const draft = reactive({
    characterId: props.tx.characterId,
    date: props.tx.date,
    kind: props.tx.kind as 'income' | 'expense',
    category: props.tx.category,
    amount: props.tx.amount as number | string,
    note: props.tx.note ?? '',
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
/** 收入与支出各有一套分类，切换方向时把分类一起换过去。 */
const categoryOptions = computed(() => {
    const options = (draft.kind === 'income' ? rules.incomeCats : rules.expenseCats).map(
        (item) => ({ value: item, label: item }),
    );
    // 历史分类可能已从常量里删除，补回去避免下拉悄悄跳到首项。
    if (draft.category && !options.some((item) => item.value === draft.category))
        options.push({ value: draft.category, label: draft.category });
    return options;
});
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
                    currency: 'cash',
                    category: draft.category,
                    // 渠道、手续费、类型与时长不归这张表单管，原样保留。
                    channel: props.tx.channel ?? '游戏内',
                    amount,
                    fee: props.tx.fee ?? 0,
                    note: draft.note.trim(),
                    ledger: 'earnings',
                    recordType: props.tx.recordType,
                    minutes: props.tx.minutes ?? 0,
                }),
                props.tx.id,
            ),
        );
        app.notify('记录已更新');
        emit('saved', [...new Set([props.tx.date, draft.date].filter(Boolean))]);
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal title="编辑收益记录" :busy="app.busy" :dirty="dirty" @close="emit('close')">
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
            <!--
                删除放在编辑器里是因为「改着改着发现整条记错了」是最常见的路径：
                先撤销修改再出去找列表行，比直接删掉多两步。
                实际的确认与连带删除仍在页面那层做，这里只把意图交出去。
            -->
            <button
                class="btn danger foot-delete"
                type="button"
                :disabled="app.busy"
                @click="emit('remove')"
            >
                删除这条
            </button>
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="income-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : '保存记录' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
/* 删除靠左、其余按钮靠右，避免和提示文字挤成一段。 */
.foot-delete {
    margin-right: auto;
}
</style>
