// Migrated from the immutable v1 baseline; see migration/baseline.json.
export default function install(D, U, gateway, localStorage) {
    /* 收益与账号账本的统计口径。 */
    Object.assign(D, {
        stats(txs) {
            const r = {
                income: 0,
                expense: 0,
                net: 0,
                cashNet: 0,
                reserveNet: 0,
                reserveIncome: 0,
                minutes: 0,
                count: txs.length,
                itemEstimate: 0,
                itemCount: 0,
            };
            txs.forEach(function (t) {
                if (t.ledger === 'account') return;
                if (t.recordType === 'item') {
                    if (t.status === 'held') {
                        r.itemEstimate += D.itemHoldingValue(t);
                        r.itemCount += D.itemRemaining(t);
                    }
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

        accountStats(txs, currency) {
            const r = { income: 0, expense: 0, net: 0, fees: 0, count: 0 };
            txs.forEach((t) => {
                if (
                    t.ledger !== 'account' ||
                    (t.currency !== currency && !(currency === 'cash' && t.currency === 'reserve'))
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
    });
}
