import type { Transaction } from '../../app/types';
import { U } from '../../domain/util.js';

/**
 * 账号账本的展示口径。
 *
 * 页面与记录弹窗必须逐字一致：同一个币种两种说法、同一个金额两种算法，
 * 用户就会以为两处统计对不上。规则本身仍在领域 `accountStats`，这里只做格式化。
 */

/** 币种短名：明细、汇总卡、筛选共用一个说法。 */
export function currencyText(currency: string) {
    return currency === 'rmb' ? '人民币' : currency === 'reserve' ? '储备金' : '梦幻币';
}

/** 实收 / 实付：收入扣手续费，支出加手续费，与 `accountStats` 同一口径。 */
export function netAmount(tx: Transaction) {
    const fee = Number(tx.fee) || 0;
    return tx.kind === 'income' ? tx.amount - fee : tx.amount + fee;
}

export function signedAmount(tx: Transaction) {
    return (tx.kind === 'income' ? '+' : '−') + U.fmtAmount(netAmount(tx), tx.currency);
}
