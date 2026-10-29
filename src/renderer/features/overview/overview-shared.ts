import type { DateRangeValue, Domain, Transaction } from '../../app/types';
import { U } from '../../domain/util.js';

/** 一段趋势图上的一个点：`ratio` 是相对峰值的比例，画柱子高度用。 */
export interface TrendPoint {
    date: string;
    value: number;
    ratio: number;
}

/** 区间文案：单日不写成「X 至 X」，只设一头时说清是「截至」还是「起」。 */
export function rangeText(value: DateRangeValue) {
    if (!value.from && !value.to) return '全部时间';
    // 清空开始日期时留空表示「从最早」，不能把空串拼成「 起」。
    if (!value.from) return '截至 ' + value.to;
    if (!value.to) return value.from + ' 起';
    // 单日区间（默认的「本日」）写成「X 至 X」纯属自找阅读负担。
    return value.from === value.to ? value.from : value.from + ' 至 ' + value.to;
}

/**
 * 趋势窗口：截至该区间结束日的 14 天，结束日晚于今天时按今天算。
 *
 * 两个账本各算各的——收益图和账号图用的是各自区间的结束日。共用一份窗口的话，
 * 改账号的日期会莫名其妙地把收益图挪走，两次改动互相牵连。
 */
export function trendDaysOf(range: DateRangeValue) {
    const today = U.today();
    const end = range.to && range.to < today ? range.to : today;
    const days: string[] = [];
    for (let index = 13; index >= 0; index--) days.push(U.addDays(end, -index));
    return days;
}

/**
 * 按天累加净额。
 *
 * 一次遍历分桶再对齐日期，避免「14 天 × 全表过滤」那种平方级的写法；窗口外的流水
 * 直接跳过，几千条流水也只有一遍。
 */
export function dailySeries(
    list: Transaction[],
    net: (tx: Transaction) => number,
    days: string[],
): TrendPoint[] {
    const window = new Set(days);
    const bucket = new Map<string, number>();
    list.forEach((tx) => {
        if (!window.has(tx.date)) return;
        bucket.set(tx.date, (bucket.get(tx.date) || 0) + net(tx));
    });
    const values = days.map((date) => U.round2(bucket.get(date) || 0));
    const peak = Math.max(...values.map((value) => Math.abs(value))) || 1;
    return days.map((date, index) => ({ date, value: values[index], ratio: values[index] / peak }));
}

export function trendTotal(series: Array<{ value: number }>) {
    return U.round2(series.reduce((sum, point) => sum + point.value, 0));
}

/** 金额列：物品走领域的 `itemValue`，其余按币种带上正负号与手续费。 */
export function amountText(tx: Transaction, rules: Domain) {
    // 物品价值走领域的 `itemValue`：页面上再乘一遍就是第二份口径，改算法时必漏。
    if (tx.recordType === 'item') return '估值 ' + U.fmtMoney(rules.itemValue(tx));
    const fee = Number(tx.fee) || 0;
    const value =
        tx.kind === 'income' ? (Number(tx.amount) || 0) - fee : (Number(tx.amount) || 0) + fee;
    return (tx.kind === 'income' ? '+' : '−') + U.fmtAmount(value, tx.currency);
}

export function rowTitle(tx: Transaction) {
    return tx.recordType === 'item'
        ? (tx.itemName || '物品') + ' ×' + (tx.quantity ?? 0)
        : tx.note || tx.category;
}

export function rowTone(tx: Transaction) {
    if (tx.recordType === 'item') return 'item';
    return tx.kind;
}
