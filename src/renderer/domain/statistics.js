// @ts-check
// Migrated from the immutable v1 baseline; see docs/SYNC.md.

/** @typedef {Partial<Domain> & ThisType<Domain>} StatisticsMixin */

/**
 * @param {Domain} D
 * @param {unknown} _U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, _U, _gateway, _localStorage) {
    /* 收益与账号账本的统计口径。 */
    Object.assign(
        D,
        /** @type {StatisticsMixin} */ ({
            /** @param {any[]} txs */
            stats(txs) {
                const self = this;
                const r = {
                    income: 0,
                    expense: 0,
                    net: 0,
                    cashNet: 0,
                    reserveNet: 0,
                    reserveIncome: 0,
                    minutes: 0,
                    count: txs.length,
                    /* 记账口径：范围内每条物品记录按当前单价折算，与卖没卖无关。 */
                    itemValue: 0,
                    itemQty: 0,
                };
                txs.forEach(function (t) {
                    if (t.ledger === 'account') return;
                    if (t.recordType === 'item') {
                        // 价值按「当前单价」算，卖没卖不影响：这里要的是「打了多少东西、值多少」。
                        r.itemValue += self.itemValue(t);
                        r.itemQty += Number(t.quantity) || 0;
                        return;
                    }
                    const amt = Number(t.amount) || 0;
                    if (t.kind === 'income') r.income += amt;
                    else r.expense += amt;
                    if (t.kind === 'income' && t.currency === 'reserve') r.reserveIncome += amt;
                    if (t.currency === 'reserve') r.reserveNet += t.kind === 'income' ? amt : -amt;
                    else r.cashNet += t.kind === 'income' ? amt : -amt;
                    if (t.minutes && !t.sessionId) r.minutes += t.minutes;
                });
                r.net = r.income - r.expense;
                return r;
            },

            /**
             * @param {any[]} txs
             * @param {string} currency
             */
            accountStats(txs, currency) {
                const r = { income: 0, expense: 0, net: 0, fees: 0, count: 0 };
                txs.forEach((t) => {
                    if (
                        t.ledger !== 'account' ||
                        (t.currency !== currency &&
                            !(currency === 'cash' && t.currency === 'reserve'))
                    )
                        return;
                    const fee = Number(t.fee) || 0;
                    if (t.kind === 'income') r.income += t.amount - fee;
                    else r.expense += t.amount + fee;
                    r.fees += fee;
                    r.count++;
                });
                r.net = r.income - r.expense;
                return r;
            },
        }),
    );
}
