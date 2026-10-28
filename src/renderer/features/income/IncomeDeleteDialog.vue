<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Transaction } from '../../app/types';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';

/**
 * 删除一条收益记录前的确认。
 *
 * 抽成组件是因为删除入口有三处（记录弹窗的行内、收益页最近记录的 ✕、编辑弹窗里），
 * 而每类记录「删了会连带什么」的说明很长——三处各写一遍必然漂移，其中一处迟早
 * 说漏连带删除，用户就会丢数据。
 *
 * 三类连带关系：
 * - 点卡流水（`sessionId`）：由在线记录算出来，只删费用会留下「时长还在、成本没了」的错账，
 *   所以连带会话；跨天计时拆出的多行流水一起消失。
 * - 物品记录：挂在它上面的成交一起删，否则成交变成无主收入。
 * - 成交记录（`itemRecordId`）：物品退回「持有」，成交收入从汇总扣除。
 */
const props = defineProps<{ tx: Transaction }>();
const emit = defineEmits<{ close: []; deleted: [dates: string[]] }>();
const app = useApplication();
const rules = app.rules();
const error = ref('');

const isItem = computed(() => props.tx.recordType === 'item');
/** 删除后要重新同步账号的那些日期——同步动作在页面侧做，这里只负责算出范围。 */
const dates = computed(() => {
    const tx = props.tx;
    if (!tx.sessionId) return [tx.date];
    const rows = rules.state.transactions.filter((item) => item.sessionId === tx.sessionId);
    return [...new Set(rows.map((item) => item.date).filter(Boolean))];
});
const title = computed(() => {
    const tx = props.tx;
    if (tx.sessionId) return '删除点卡记录';
    if (isItem.value) return '删除物品记录';
    if (tx.itemRecordId) return '删除成交记录';
    return '删除收益记录';
});
const subject = computed(() => props.tx.itemName || props.tx.note || props.tx.category || '这一条');
const amountText = computed(() => {
    const tx = props.tx;
    const sign = tx.kind === 'income' ? '+' : '−';
    return isItem.value
        ? U.fmtMoney(rules.itemValue(tx))
        : sign + U.fmtMoney(Number(tx.amount) || 0);
});
const note = computed(() => {
    const tx = props.tx;
    if (tx.sessionId) {
        const session = rules.state.sessions.find((item) => item.id === tx.sessionId);
        const minutes = Number(session?.minutes);
        const rows = dates.value.length;
        const when =
            Number.isFinite(minutes) && minutes > 0 ? '在线 ' + U.fmtMinutes(minutes) : '这段计时';
        return (
            '这段计时（' +
            when +
            '）会一并删除：点卡由在线记录算出来，只删费用会让时长和成本对不上' +
            (rows > 1 ? '；跨天拆出的 ' + rows + ' 个日期的点卡也会一起消失' : '') +
            '。'
        );
    }
    if (tx.itemRecordId) return '这件物品会回到「持有」，成交收入从汇总里扣除。';
    if (isItem.value) {
        const sales = rules.state.transactions.filter((item) => item.itemRecordId === tx.id);
        if (!sales.length) return '物品估值与汇总会重新计算，且无法恢复。';
        const total = sales.reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0);
        return (
            '它已有 ' +
            sales.length +
            ' 条成交记录（合计 ' +
            U.fmtMoney(total) +
            '），会一并删除：成交挂在物品上，单独留着就是无主收入。'
        );
    }
    return '当天的合计与净收益会重新计算，且无法恢复。';
});

async function confirm() {
    if (app.busy) return;
    error.value = '';
    const tx = props.tx;
    const affected = dates.value;
    try {
        // removeTransaction / removeSession 都只改内存，必须自己套一层 commit 才会落盘。
        await app.execute((domain) =>
            domain.commit(() =>
                tx.sessionId ? domain.removeSession(tx.sessionId) : domain.removeTransaction(tx.id),
            ),
        );
        emit('deleted', affected);
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <BaseModal :title="title" :busy="app.busy" @close="emit('close')">
        <p>确定删除 {{ tx.date }} 的「{{ subject }}」吗？</p>
        <p>
            金额
            <b>{{ amountText }}</b>
            ，{{ note }}
        </p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <template #footer>
            <button class="btn" :disabled="app.busy" @click="emit('close')">取消</button>
            <button class="btn primary" :disabled="app.busy" @click="confirm">
                {{ app.busy ? '删除中…' : '确认删除' }}
            </button>
        </template>
    </BaseModal>
</template>
