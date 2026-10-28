<script setup lang="ts">
import { computed, ref } from 'vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';

/**
 * 一局结束后的结算：把这段的盈亏记进账号账本。
 *
 * 收益页与账号页是两本独立的账（`earnings` / `account`），唯一要打通的就是这一步：
 * 打完一局，把「这趟赚了还是亏了」写成账号里的一条收入或支出，梦幻币余额才算得上。
 *
 * 金额默认按**这一天**的速记算，而不是按「速记的创建时刻」归集：速记只精确到日期，
 * 而且常见顺序是「先打了一会儿、回头才点开始游戏」，按时刻归集会把它们全漏掉。
 * 物品按速记时的标价计入（还没卖，算的是这趟的产出而不是现金），点卡作为成本扣掉。
 * 同一天打两局时默认值会把前一局也算进来，弹窗里说明了这一点，数字可以自己改。
 *
 * 正数记收入、负数记支出：账号账本的 `income` 只接受非负金额，亏损硬塞进收入会把
 * 两边的汇总都算错。
 */
const props = defineProps<{
    session: {
        characterId: string;
        startAt: number;
        endAt: number;
        minutes: number;
        cost: number;
    };
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

/** 这一段覆盖的日期：跨夜的会话要从开始那天算到结束那天。 */
const span = computed(() => {
    const from = U.fmtDate(new Date(Number(props.session.startAt) || Date.now()));
    const to = U.fmtDate(new Date(Number(props.session.endAt) || Date.now()));
    return { from, to };
});
const dayText = computed(() =>
    span.value.from === span.value.to ? span.value.from : span.value.from + ' 至 ' + span.value.to,
);
/** 这一段打出来的东西：金币算现金，物品按标价估值。 */
const played = computed(() => {
    void app.data;
    let cash = 0;
    let items = 0;
    let count = 0;
    rules.state.transactions.forEach((tx) => {
        if (tx.ledger !== 'earnings' || tx.source !== 'quick' || tx.kind !== 'income') return;
        if (tx.characterId !== props.session.characterId) return;
        if (tx.date < span.value.from || tx.date > span.value.to) return;
        count++;
        if (tx.recordType === 'item')
            items += (Number(tx.quantity) || 0) * (Number(tx.unitPrice) || 0);
        else cash += Number(tx.amount) || 0;
    });
    return { cash, items, count };
});
const suggested = computed(
    () =>
        Math.round((played.value.cash + played.value.items - Number(props.session.cost)) * 100) /
        100,
);
const amount = ref<number | string>(suggested.value);
const dirty = computed(() => String(amount.value) !== String(suggested.value));
const error = ref('');
const value = computed(() => {
    if (amount.value === '' || amount.value === null) return null;
    const parsed = Number(amount.value);
    return Number.isFinite(parsed) ? parsed : null;
});
const subject = computed(() => {
    const name = rules.charName(props.session.characterId);
    return name ? name + ' · 在线 ' + U.fmtMinutes(Number(props.session.minutes)) : '';
});

async function save() {
    if (app.busy) return;
    error.value = '';
    if (value.value === null) {
        error.value = '请填写本次盈亏';
        return;
    }
    if (value.value === 0) {
        error.value = '盈亏为 0，不需要记进账号';
        return;
    }
    const gain = value.value > 0;
    try {
        await app.execute((domain) =>
            domain.saveTransaction({
                ledger: 'account',
                recordType: 'money',
                characterId: props.session.characterId,
                date: U.today(),
                kind: gain ? 'income' : 'expense',
                currency: 'cash',
                category: '其他收支',
                channel: '游戏内',
                amount: Math.abs(value.value as number),
                fee: 0,
                minutes: 0,
                note: '在线 ' + (Number(props.session.minutes) / 60).toFixed(2) + ' 小时产出',
            }),
        );
        app.notify(
            '已记入账号 · ' + (gain ? '收入 ' : '支出 ') + U.fmtMoney(Math.abs(value.value)),
        );
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal title="结算这一局" :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="settle-subject">{{ subject }}</p>
        <dl class="settle-figures">
            <div>
                <dt>速记金币</dt>
                <dd>{{ U.fmtMoney(played.cash) }}</dd>
            </div>
            <div>
                <dt>物品估值</dt>
                <dd>{{ U.fmtMoney(played.items) }}</dd>
            </div>
            <div>
                <dt>点卡消耗</dt>
                <dd class="out">−{{ U.fmtMoney(Number(session.cost)) }}</dd>
            </div>
        </dl>
        <p class="settle-scope">按 {{ dayText }} 的速记统计</p>
        <form id="settle-form" class="settle-form" @submit.prevent="save">
            <label>
                记入账号账本的盈亏（万）
                <BaseNumber v-model="amount" name="amount" :min="-999999" :step="0.01" />
            </label>
        </form>
        <p class="hint settle-hint">
            {{
                value === null
                    ? '填上这一局实际到手的数，亏了就填负数。'
                    : value > 0
                      ? '将记为「其他收支」的收入 ' + U.fmtMoney(value)
                      : value < 0
                        ? '将记为「其他收支」的支出 ' + U.fmtMoney(-value)
                        : '盈亏为 0 时不需要记进账号。'
            }}
        </p>
        <p v-if="!played.count" class="hint settle-hint">
            这一天还没有速记，金额按实际到手填。收益页的速记与本笔互不影响。
        </p>
        <p v-else class="hint settle-hint">
            同一天打第二局时，上面的数字会把前一局也算进来，按实际改一下再记。
        </p>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">不记，只结束</button>
            <button class="btn primary" type="submit" form="settle-form" :disabled="app.busy">
                {{ app.busy ? '记入中…' : '记入账号' }}
            </button>
        </template>
    </BaseModal>
</template>
<style scoped>
.settle-subject {
    margin: 0 0 12px;
    color: var(--muted);
    font-size: 13px;
    text-align: center;
}
.settle-figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
}
.settle-figures div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.settle-figures dt {
    color: var(--muted);
    font-size: 11.5px;
}
.settle-figures dd {
    margin: 0;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
}
.settle-figures dd.out {
    color: var(--red);
}
.settle-scope {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 11.5px;
}
.settle-form {
    margin-top: 8px;
}
.settle-form label {
    display: block;
    gap: 4px;
    font-size: 12.5px;
}
.settle-hint {
    margin: 10px 0 0;
    font-size: 12px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
