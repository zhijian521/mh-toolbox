// @ts-check
// Migrated from the immutable v1 baseline; see migration/baseline.json.

/** @typedef {Partial<Domain> & ThisType<Domain>} LedgerMixin */

/**
 * @param {Domain} D
 * @param {any} U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, U, _gateway, _localStorage) {
    /* 收益、物品库存与装备关联账本。 */
    Object.assign(
        D,
        /** @type {LedgerMixin} */ ({
            /**
             * @this {Domain}
             * @param {any} item
             * @param {any[]} [list]
             * @returns {any[]}
             */
            itemSales(item, list) {
                // 默认值不能写成 list = this.state.transactions：默认参数表达式里的 this
                // 拿不到 @this 标注，会退化成 any。这里在函数体内取。
                if (!list) list = this.state.transactions;
                const id = typeof item === 'string' ? item : item.id;
                if (this._saleList !== list || this._saleCount !== list.length) {
                    /** @type {Map<string, any[]>} */
                    const index = new Map();
                    list.forEach(
                        /** @param {any} tx */ (tx) => {
                            if (!tx.itemRecordId) return;
                            const bucket = index.get(tx.itemRecordId) || [];
                            bucket.push(tx);
                            index.set(tx.itemRecordId, bucket);
                        },
                    );
                    this._saleList = list;
                    this._saleCount = list.length;
                    this._salesIndex = index;
                }
                return (this._salesIndex || new Map()).get(id) || [];
            },

            /** @this {Domain} @param {any} item @returns {number} */
            itemSoldQuantity(item) {
                return this.itemSales(item).reduce(
                    /** @param {number} sum @param {any} sale */
                    (sum, sale) =>
                        sum + (sale.saleQuantity == null ? item.quantity : sale.saleQuantity),
                    0,
                );
            },

            /** @this {Domain} @param {any} item @returns {number} */
            itemRemaining(item) {
                const sales = this.itemSales(item);
                if (!sales.length && item.status === 'sold') return 0;
                return Math.max(0, item.quantity - this.itemSoldQuantity(item));
            },

            /** @this {Domain} @param {any} item @returns {number} */
            itemHoldingValue(item) {
                return item.status === 'held' ? this.itemValue(item, this.itemRemaining(item)) : 0;
            },

            /** @this {Domain} @param {string} id */
            syncItem(id) {
                const item = this.state.transactions.find(
                    /** @param {any} tx */
                    (tx) => tx.id === id && tx.recordType === 'item',
                );
                if (!item) return;
                const sales = this.itemSales(item);
                const quantity = sales.reduce(
                    /** @param {number} sum @param {any} sale */
                    (sum, sale) => sum + sale.saleQuantity,
                    0,
                );
                if (quantity > item.quantity) throw new Error('成交数量不能超过获得数量');
                if (sales.length) {
                    item.status = quantity === item.quantity ? 'sold' : 'held';
                    item.saleId = sales[sales.length - 1].id;
                } else {
                    if (item.status === 'sold') item.status = 'held';
                    delete item.saleId;
                }
            },

            /**
             * 把指定日期的日常产出同步成账号账本里的「游戏收益」。
             *
             * 收益页与账号页是两本独立的账，唯一打通的就是这一步：每天每角色在账号里留
             * 一条「游戏收益」，金额 = 速记金币 + 物品估值 − 点卡（含正在计时的那一段）。
             * 速记、删记录、补/删在线时长之后随时调用，所以不需要等到结束游戏。
             *
             * 同一天同角色只留一条：命中已有记录就原地改写，金额为 0 时把那条删掉——
             * 留着一条 0 元记录只会让人以为当天记过账。`source` 统一为 settle，方便和
             * 账号页手记的收支区分；`note` 记当时的在线时长，便于回看。
             *
             * 只算 `source === 'quick'` 的速记：摆摊卖货那类成交收入属于账号里另记的账，
             * 混进来会和用户自己记的「装备交易」重复。
             *
             * 写操作自己 commit，可直接放进 `app.execute`。
             *
             * @this {Domain}
             * @param {string[]} dates
             * @returns {Promise<Array<{ date: string, characterId: string, amount: number }>>}
             */
            syncAccountEarnings(dates) {
                const list = Array.from(
                    new Set(
                        (dates || []).filter(
                            /** @param {string} date */
                            (date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date)),
                        ),
                    ),
                );
                if (!list.length) return Promise.resolve([]);
                const round2 = (/** @type {number} */ value) => Math.round(value * 100) / 100;
                return this.commit(() => {
                    /** @type {Array<{ date: string, characterId: string, amount: number }>} */
                    const entries = [];
                    list.forEach(
                        /** @param {string} date */ (date) => {
                            /** @type {Set<string>} */
                            const owners = new Set();
                            this.state.transactions.forEach(
                                /** @param {any} tx */ (tx) => {
                                    if (tx.date !== date) return;
                                    if (tx.ledger === 'earnings' || tx.source === 'settle')
                                        owners.add(tx.characterId);
                                },
                            );
                            /* 计时中的会话也要算进来：它还没有流水，但当天的点卡已经在涨，
                               实时同步要把它算成负数，否则账号里的数字会比收益页好看。 */
                            const active = this.state.activeSession;
                            this.state.sessions
                                .concat(
                                    active
                                        ? [
                                              this.makeSession(
                                                  Object.assign({}, active, {
                                                      mode: 'range',
                                                      endAt: Date.now(),
                                                  }),
                                              ),
                                          ]
                                        : [],
                                )
                                .forEach(
                                    /** @param {any} session */ (session) => {
                                        if (
                                            this.sessionSlices(session).some(
                                                (/** @type {any} */ slice) =>
                                                    slice.date === date && slice.minutes > 0,
                                            )
                                        )
                                            owners.add(session.characterId);
                                    },
                                );
                            owners.forEach(
                                /** @param {string} characterId */ (characterId) => {
                                    let cash = 0;
                                    let items = 0;
                                    this.state.transactions.forEach(
                                        /** @param {any} tx */ (tx) => {
                                            if (
                                                tx.ledger !== 'earnings' ||
                                                tx.characterId !== characterId ||
                                                tx.date !== date ||
                                                tx.source !== 'quick' ||
                                                tx.kind !== 'income'
                                            )
                                                return;
                                            if (tx.recordType === 'item')
                                                items +=
                                                    (Number(tx.quantity) || 0) *
                                                    (Number(tx.unitPrice) || 0);
                                            else cash += Number(tx.amount) || 0;
                                        },
                                    );
                                    const online = this.onlineStats(characterId, date, date, true);
                                    const amount = round2(cash + items - online.cost);
                                    const note =
                                        online.minutes > 0
                                            ? '在线 ' +
                                              (online.minutes / 60).toFixed(2) +
                                              ' 小时产出'
                                            : '游戏日常产出';
                                    /* 按分类匹配而不是按 source：用户可能在账号页手记过一条
                                       「游戏收益」，再按 source 找就会并存两条、汇总翻倍。 */
                                    const matches = this.state.transactions.filter(
                                        /** @param {any} tx */
                                        (tx) =>
                                            tx.ledger === 'account' &&
                                            tx.date === date &&
                                            tx.characterId === characterId &&
                                            tx.category === '游戏收益' &&
                                            tx.recordType !== 'item' &&
                                            !tx.itemRecordId &&
                                            !tx.equipmentId,
                                    );
                                    const existing = matches[0] || null;
                                    // 已经并存的多条（手记一条 + 早先同步一条）顺手收成一条。
                                    if (matches.length > 1) {
                                        const extras = matches.slice(1);
                                        this.state.transactions = this.state.transactions.filter(
                                            /** @param {any} tx */ (tx) => !extras.includes(tx),
                                        );
                                    }
                                    if (amount === 0) {
                                        if (existing)
                                            this.state.transactions =
                                                this.state.transactions.filter(
                                                    /** @param {any} tx */ (tx) => tx !== existing,
                                                );
                                        return;
                                    }
                                    const kind = amount > 0 ? 'income' : 'expense';
                                    const value = Math.abs(amount);
                                    if (existing) {
                                        // 金额没变就不动它，省掉一次无意义的改写。
                                        existing.kind = kind;
                                        existing.amount = value;
                                        existing.currency = 'cash';
                                        existing.fee = 0;
                                        existing.minutes = 0;
                                        existing.source = 'settle';
                                        if (existing.note !== note) existing.note = note;
                                    } else
                                        this.state.transactions.push({
                                            id: U.uid(),
                                            ledger: 'account',
                                            recordType: 'money',
                                            characterId,
                                            date,
                                            kind,
                                            currency: 'cash',
                                            category: '游戏收益',
                                            channel: '游戏内',
                                            amount: value,
                                            fee: 0,
                                            minutes: 0,
                                            source: 'settle',
                                            note,
                                            createdAt: Date.now(),
                                        });
                                    entries.push({ date, characterId, amount });
                                },
                            );
                        },
                    );
                    return entries;
                });
            },

            /** 收益、账号和速记共用写入口，事务中重新取档案，避免失败重试引用旧对象。 */
            /**
             * @this {Domain}
             * @param {any} input
             * @param {string} [id]
             * @returns {Promise<any>}
             */
            saveTransaction(input, id) {
                return this.commit(() => {
                    const previous =
                        id &&
                        this.state.transactions.find(/** @param {any} tx */ (tx) => tx.id === id);
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
                                /** @param {any} sale */
                                (sale) =>
                                    sale.characterId !== record.characterId ||
                                    sale.date < record.date,
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
                            /** @param {any} tx */
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
                            .filter(/** @param {any} sale */ (sale) => sale.id !== record.id)
                            .reduce(
                                /** @param {number} sum @param {any} sale */
                                (sum, sale) => sum + sale.saleQuantity,
                                0,
                            );
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

            /**
             * @this {Domain}
             * @param {any} item
             * @param {any} data
             * @returns {any}
             */
            settleItem(item, data) {
                item = this.state.transactions.find(
                    /** @param {any} tx */
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

            /** @this {Domain} @param {string} id */
            removeTransaction(id) {
                const tx = this.state.transactions.find(/** @param {any} t */ (t) => t.id === id);
                if (!tx) return;
                if (tx.sessionId) {
                    this.removeSession(tx.sessionId);
                    return;
                }
                this.state.transactions = this.state.transactions.filter(
                    /** @param {any} t */
                    (t) => t.id !== id && t.itemRecordId !== id,
                );
                if (tx.itemRecordId) this.syncItem(tx.itemRecordId);
                this.state.gearLogs = this.state.gearLogs.filter(
                    /** @param {any} l */
                    (l) => l.transactionId !== id,
                );
                if (tx.equipmentId) this.syncEquipmentStatus(tx.equipmentId);
            },

            /** @this {Domain} @param {string} id */
            syncEquipmentStatus(id) {
                const eq = this.state.equipment.find(/** @param {any} e */ (e) => e.id === id);
                if (!eq) return;
                const trade = this.gearLogsOf(id).find(
                    /** @param {any} l */
                    (l) => ['buy', 'sell'].includes(l.action),
                );
                eq.status = trade
                    ? trade.action === 'sell'
                        ? 'sold'
                        : 'active'
                    : eq.tradeBaseStatus || eq.status;
                if (eq.status === 'sold') this.clearEquipmentReferences(id);
            },

            /** @this {Domain} @param {any} tx */
            syncAccountEquipment(tx) {
                const eq =
                    tx.equipmentId &&
                    this.state.equipment.find(/** @param {any} e */ (e) => e.id === tx.equipmentId);
                if (tx.equipmentId && (!eq || eq.characterId !== tx.characterId))
                    throw new Error('关联装备必须属于所选角色');
                this.state.gearLogs = this.state.gearLogs.filter(
                    /** @param {any} l */
                    (l) => l.transactionId !== tx.id,
                );
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
        }),
    );
}
