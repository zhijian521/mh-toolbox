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
 * **按天记账**：一段计时跨过午夜时，点卡已经按天切成两条流水（`sessionSlices`），
 * 结算也按天各写一条，不会把两天的产出挤进同一天。
 *
 * **同一天只留一条**：写入前按「账号账本 + 该角色 + 该日期 + source=settle」找已有记录，
 * 找到就原地改，找不到才新增。所以一天打三局，账号里始终只有当天那一条，后面的覆盖前面的。
 *
 * 金额默认 `速记金币 + 物品估值 − 点卡`：物品按速记时的标价计入（还没卖，算的是这趟的
 * 产出而不是现金），点卡作为成本扣掉。数字都可以改——真按实际到账填。
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

type DayRow = {
    date: string;
    cash: number;
    items: number;
    cost: number;
    minutes: number;
    amount: number | string;
};
const round2 = (value: number) => Math.round(value * 100) / 100;

/** 这一段覆盖的日期，跨夜时拆成多天。上限 8 天，纯粹是防坏数据。 */
const days = computed(() => {
    const from = U.fmtDate(new Date(Number(props.session.startAt) || Date.now()));
    const to = U.fmtDate(new Date(Number(props.session.endAt) || Date.now()));
    const list = [from];
    let cursor = from;
    while (cursor < to && list.length < 8) {
        cursor = U.addDays(cursor, 1);
        list.push(cursor);
    }
    return list;
});
/** 点卡按天切片：与写进收益账本的那几条流水完全一致。 */
const slices = computed(() => rules.sessionSlices({ ...props.session, mode: 'range' }));
const perDay = computed(() => {
    const map: Record<string, { cost: number; minutes: number }> = {};
    days.value.forEach((date) => (map[date] = { cost: 0, minutes: 0 }));
    slices.value.forEach((slice) => {
        const slot = map[slice.date];
        if (!slot) return;
        slot.cost += slice.cost;
        slot.minutes += slice.minutes;
    });
    return map;
});
const rows = ref<DayRow[]>(
    days.value.map((date) => {
        let cash = 0;
        let items = 0;
        rules.state.transactions.forEach((tx) => {
            if (tx.ledger !== 'earnings' || tx.source !== 'quick' || tx.kind !== 'income') return;
            if (tx.characterId !== props.session.characterId || tx.date !== date) return;
            if (tx.recordType === 'item')
                items += (Number(tx.quantity) || 0) * (Number(tx.unitPrice) || 0);
            else cash += Number(tx.amount) || 0;
        });
        const slot = perDay.value[date] || { cost: 0, minutes: 0 };
        return {
            date,
            cash: round2(cash),
            items: round2(items),
            cost: round2(slot.cost),
            minutes: slot.minutes,
            amount: round2(cash + items - slot.cost),
        };
    }),
);
const initial = JSON.stringify(rows.value.map((row) => [row.date, String(row.amount)]));
const dirty = computed(
    () => JSON.stringify(rows.value.map((row) => [row.date, String(row.amount)])) !== initial,
);
const error = ref('');
const subject = computed(() => {
    const name = rules.charName(props.session.characterId);
    const span = U.fmtMinutes(Number(props.session.minutes));
    return name ? name + ' · 在线 ' + span : '在线 ' + span;
});

function describe(amount: number | string) {
    if (amount === '' || amount === null) return '填上这一天的实际盈亏，亏了就填负数。';
    const value = Number(amount);
    if (!Number.isFinite(value)) return '请填写有效金额。';
    if (value > 0) return '记为「游戏收益」收入 ' + U.fmtMoney(value);
    if (value < 0) return '记为「游戏收益」支出 ' + U.fmtMoney(-value);
    return '为 0 的这一天不写记录。';
}
/** 已存在的那条当日收益：有就覆盖，没有才新增。 */
function existingOf(date: string) {
    return rules.state.transactions.find(
        (tx) =>
            tx.ledger === 'account' &&
            tx.source === 'settle' &&
            tx.date === date &&
            tx.characterId === props.session.characterId,
    );
}

async function save() {
    if (app.busy) return;
    error.value = '';
    const pending = rows.value.filter((row) => {
        const value = Number(row.amount);
        return row.amount !== '' && Number.isFinite(value) && value !== 0;
    });
    if (!pending.length) {
        error.value = '没有要记的金额：填一个非 0 的盈亏，或直接关掉';
        return;
    }
    try {
        for (const row of pending) {
            const value = Number(row.amount);
            const previous = existingOf(row.date);
            await app.execute((domain) =>
                domain.saveTransaction(
                    {
                        ledger: 'account',
                        recordType: 'money',
                        characterId: props.session.characterId,
                        date: row.date,
                        kind: value > 0 ? 'income' : 'expense',
                        currency: 'cash',
                        category: '游戏收益',
                        channel: '游戏内',
                        amount: Math.abs(value),
                        fee: 0,
                        minutes: 0,
                        source: 'settle',
                        note: '在线 ' + (row.minutes / 60).toFixed(2) + ' 小时产出',
                    },
                    previous?.id,
                ),
            );
        }
        app.notify(
            pending.length > 1
                ? '已按天记入账号 · ' + pending.length + ' 天'
                : '已记入账号 · ' + describe(pending[0].amount),
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
        <p v-if="rows.length > 1" class="hint settle-cross">
            这段计时跨了 {{ rows.length }} 天，点卡已按天切片，盈亏也按天分别记录。
        </p>
        <div v-for="row in rows" :key="row.date" class="settle-day">
            <p v-if="rows.length > 1" class="settle-day-head">{{ row.date }}</p>
            <dl class="settle-figures">
                <div>
                    <dt>速记金币</dt>
                    <dd>{{ U.fmtMoney(row.cash) }}</dd>
                </div>
                <div>
                    <dt>物品估值</dt>
                    <dd>{{ U.fmtMoney(row.items) }}</dd>
                </div>
                <div>
                    <dt>点卡消耗</dt>
                    <dd class="out">−{{ U.fmtMoney(row.cost) }}</dd>
                </div>
            </dl>
            <form :id="'settle-form-' + row.date" class="settle-form" @submit.prevent="save">
                <label>
                    记入账号账本的盈亏（万）
                    <BaseNumber
                        v-model="row.amount"
                        :name="'amount-' + row.date"
                        :min="-999999"
                        :step="0.01"
                    />
                </label>
            </form>
            <p class="hint settle-hint">{{ describe(row.amount) }}</p>
        </div>
        <p class="hint settle-hint">
            同一天只保留一条「游戏收益」：再结算一次会覆盖当天那条，不会叠加。
        </p>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">不记，只结束</button>
            <button class="btn primary" :disabled="app.busy" @click="save">
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
.settle-cross {
    margin: 0 0 10px;
    font-size: 12px;
}
.settle-day + .settle-day {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--line);
}
.settle-day-head {
    margin: 0 0 6px;
    color: var(--ink);
    font-size: 12.5px;
    font-weight: 600;
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
.settle-form {
    margin-top: 10px;
}
.settle-form label {
    display: block;
    gap: 4px;
    font-size: 12.5px;
}
.settle-hint {
    margin: 8px 0 0;
    font-size: 12px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
