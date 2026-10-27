// Migrated from the immutable v1 baseline; see migration/baseline.json.
export default function install(D, U, _gateway, _localStorage) {
    /* 收益、物品库存与装备关联账本。 */
    Object.assign(D, {
        itemSales(item, list = this.state.transactions) {
            const id = typeof item === 'string' ? item : item.id;
            if (this._saleList !== list || this._saleCount !== list.length) {
                this._saleList = list;
                this._saleCount = list.length;
                this._salesIndex = new Map();
                list.forEach((tx) => {
                    if (!tx.itemRecordId) return;
                    if (!this._salesIndex.has(tx.itemRecordId))
                        this._salesIndex.set(tx.itemRecordId, []);
                    this._salesIndex.get(tx.itemRecordId).push(tx);
                });
            }
            return this._salesIndex.get(id) || [];
        },

        itemSoldQuantity(item) {
            return this.itemSales(item).reduce(
                (sum, sale) =>
                    sum + (sale.saleQuantity == null ? item.quantity : sale.saleQuantity),
                0,
            );
        },

        itemRemaining(item) {
            const sales = this.itemSales(item);
            if (!sales.length && item.status === 'sold') return 0;
            return Math.max(0, item.quantity - this.itemSoldQuantity(item));
        },

        itemHoldingValue(item) {
            return item.status === 'held' ? this.itemValue(item, this.itemRemaining(item)) : 0;
        },

        syncItem(id) {
            const item = this.state.transactions.find(
                (tx) => tx.id === id && tx.recordType === 'item',
            );
            if (!item) return;
            const sales = this.itemSales(item);
            const quantity = sales.reduce((sum, sale) => sum + sale.saleQuantity, 0);
            if (quantity > item.quantity) throw new Error('成交数量不能超过获得数量');
            if (sales.length) {
                item.status = quantity === item.quantity ? 'sold' : 'held';
                item.saleId = sales[sales.length - 1].id;
            } else {
                if (item.status === 'sold') item.status = 'held';
                delete item.saleId;
            }
        },

        /** 收益、账号和速记共用写入口，事务中重新取档案，避免失败重试引用旧对象。 */
        saveTransaction(input, id) {
            return this.commit(() => {
                const previous = id && this.state.transactions.find((tx) => tx.id === id);
                if (id && !previous) throw new Error('记录不存在');
                const record = Object.assign(
                    {},
                    previous || { id: U.uid(), createdAt: Date.now() },
                    input,
                );
                record.id = previous ? previous.id : record.id;
                if (previous && previous.itemRecordId !== record.itemRecordId)
                    throw new Error('不能更改成交记录的原物品关联');
                if (!this.charById(record.characterId)) throw new Error('请选择有效角色');
                if (
                    !['earnings', 'account'].includes(record.ledger) ||
                    !['income', 'expense'].includes(record.kind)
                )
                    throw new Error('无效的账本或收支方向');
                if (
                    !['cash', 'reserve', 'rmb'].includes(record.currency) ||
                    (record.ledger === 'earnings' && record.currency === 'rmb')
                )
                    throw new Error('无效的记账币种');
                if (
                    !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
                    U.fmtDate(U.parseDate(record.date)) !== record.date
                )
                    throw new Error('请选择有效日期');
                if (record.recordType === 'item') {
                    if (
                        !String(record.itemName || '').trim() ||
                        !Number.isSafeInteger(record.quantity) ||
                        record.quantity < 1 ||
                        !Number.isFinite(record.unitPrice) ||
                        record.unitPrice < 0
                    )
                        throw new Error('请填写物品名称、正整数数量和有效单价');
                    const sales = this.itemSales(record);
                    if (
                        sales.some(
                            (sale) =>
                                sale.characterId !== record.characterId || sale.date < record.date,
                        ) ||
                        (previous &&
                            sales.length &&
                            (record.itemName !== previous.itemName || record.status === 'self'))
                    ) {
                        throw new Error(
                            '已有成交的物品需保留原名称和角色，获得日期不能晚于成交日期',
                        );
                    }
                    if (record.quantity < this.itemSoldQuantity(record))
                        throw new Error('获得数量不能少于已出售数量');
                    record.amount = this.itemValue(record);
                }
                if (
                    !Number.isFinite(record.amount) ||
                    record.amount < 0 ||
                    !Number.isFinite(record.fee || 0) ||
                    (record.fee || 0) < 0
                )
                    throw new Error('请填写有效金额与手续费');
                if (
                    record.ledger === 'account' &&
                    record.kind === 'income' &&
                    (record.fee || 0) > record.amount
                )
                    throw new Error('手续费不能超过收入金额');
                if (record.itemRecordId) {
                    const item = this.state.transactions.find(
                        (tx) => tx.id === record.itemRecordId && tx.recordType === 'item',
                    );
                    if (
                        !item ||
                        record.ledger !== 'earnings' ||
                        record.kind !== 'income' ||
                        record.currency !== 'cash' ||
                        record.characterId !== item.characterId ||
                        record.date < item.date
                    )
                        throw new Error('成交记录需保留原物品归属和游戏币收入');
                    const others = this.itemSales(item)
                        .filter((sale) => sale.id !== record.id)
                        .reduce((sum, sale) => sum + sale.saleQuantity, 0);
                    if (
                        !Number.isSafeInteger(record.saleQuantity) ||
                        record.saleQuantity < 1 ||
                        record.saleQuantity + others > item.quantity
                    )
                        throw new Error('成交数量需为正整数，且不能超过可出售数量');
                }
                const previousEquipment = previous && previous.equipmentId;
                if (record.ledger === 'earnings') {
                    delete record.equipmentId;
                    delete record.gearAction;
                    if (previous) {
                        delete previous.equipmentId;
                        delete previous.gearAction;
                    }
                }
                if (previous) Object.assign(previous, record);
                else this.state.transactions.push(record);
                this.syncAccountEquipment(record);
                if (previousEquipment && previousEquipment !== record.equipmentId)
                    this.syncEquipmentStatus(previousEquipment);
                if (record.recordType === 'item' && this.itemSales(record).length)
                    this.syncItem(record.id);
                if (record.itemRecordId) this.syncItem(record.itemRecordId);
                return previous || record;
            });
        },

        settleItem(item, data) {
            item = this.state.transactions.find(
                (tx) => tx.id === item.id && tx.recordType === 'item',
            );
            if (!item) throw new Error('物品记录不存在');
            if (item.recordType !== 'item' || item.status === 'sold')
                throw new Error('该物品无法重复出售');
            if (
                !Number.isFinite(data.amount) ||
                data.amount < 0 ||
                !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
                U.fmtDate(U.parseDate(data.date)) !== data.date ||
                data.date < item.date
            )
                throw new Error('请填写有效成交金额，出售日期不能早于获得日期');
            const quantity = data.quantity == null ? this.itemRemaining(item) : data.quantity;
            if (
                !Number.isSafeInteger(quantity) ||
                quantity < 1 ||
                quantity > this.itemRemaining(item)
            )
                throw new Error('出售数量需为正整数，且不能超过剩余数量');
            const sale = {
                id: U.uid(),
                ledger: 'earnings',
                recordType: 'money',
                characterId: item.characterId,
                date: data.date,
                kind: 'income',
                currency: 'cash',
                category: '摆摊卖货',
                amount: data.amount,
                minutes: 0,
                note:
                    item.itemName +
                    ' ×' +
                    quantity +
                    ' 出售' +
                    (data.note ? ' · ' + data.note : ''),
                itemRecordId: item.id,
                saleQuantity: quantity,
                createdAt: Date.now(),
            };
            this.state.transactions.push(sale);
            this.syncItem(item.id);
            return sale;
        },

        removeTransaction(id) {
            const tx = this.state.transactions.find((t) => t.id === id);
            if (!tx) return;
            if (tx.sessionId) {
                this.removeSession(tx.sessionId);
                return;
            }
            this.state.transactions = this.state.transactions.filter(
                (t) => t.id !== id && t.itemRecordId !== id,
            );
            if (tx.itemRecordId) this.syncItem(tx.itemRecordId);
            this.state.gearLogs = this.state.gearLogs.filter((l) => l.transactionId !== id);
            if (tx.equipmentId) this.syncEquipmentStatus(tx.equipmentId);
        },

        syncEquipmentStatus(id) {
            const eq = this.state.equipment.find((e) => e.id === id);
            if (!eq) return;
            const trade = this.gearLogsOf(id).find((l) => ['buy', 'sell'].includes(l.action));
            eq.status = trade
                ? trade.action === 'sell'
                    ? 'sold'
                    : 'active'
                : eq.tradeBaseStatus || eq.status;
            if (eq.status === 'sold') this.clearEquipmentReferences(id);
        },

        syncAccountEquipment(tx) {
            const eq = tx.equipmentId && this.state.equipment.find((e) => e.id === tx.equipmentId);
            if (tx.equipmentId && (!eq || eq.characterId !== tx.characterId))
                throw new Error('关联装备必须属于所选角色');
            this.state.gearLogs = this.state.gearLogs.filter((l) => l.transactionId !== tx.id);
            if (!eq) return;
            if (!eq.tradeBaseStatus) eq.tradeBaseStatus = eq.status;
            this.state.gearLogs.push({
                id: U.uid(),
                transactionId: tx.id,
                equipmentId: eq.id,
                characterId: tx.characterId,
                date: tx.date,
                action: tx.gearAction || (tx.kind === 'income' ? 'sell' : 'buy'),
                amount: tx.amount,
                currency: tx.currency,
                fee: tx.fee || 0,
                note: tx.note || '',
                synced: true,
                createdAt: tx.createdAt,
            });
            this.syncEquipmentStatus(eq.id);
        },
    });
}
