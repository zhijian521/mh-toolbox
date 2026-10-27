// @ts-check
// Migrated from the immutable v1 baseline; see migration/baseline.json.

/** @typedef {Partial<Domain> & ThisType<Domain>} MigrationMixin */

/**
 * 列表项一律先收敛成普通对象：磁盘数据可能被手工改坏或由别的版本写入，
 * 只要有一条 null / 字符串 / 数组，后面的 Object.assign 与属性访问就会抛错，
 * 而 normalize 一旦抛错，整份 data.json 就打不开了。非对象项直接丢弃，其余原样保留。
 *
 * @param {any} value
 * @returns {any[]}
 */
function objects(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (item) => item !== null && typeof item === 'object' && !Array.isArray(item),
    );
}

/**
 * 数值化并吞掉无法转换的输入：`Number({})` 之类在 hostile 数据上可能抛 TypeError，
 * 旧值按 fallback 处理即可，不必让一份坏数据中断启动。
 *
 * @param {any} value
 * @param {number} [fallback]
 * @returns {number}
 */
function number(value, fallback = 0) {
    try {
        return Number(value);
    } catch (_error) {
        return fallback;
    }
}

/**
 * 只读文本字段：非字符串一律按空串处理，避免正则与 startsWith 触发隐式转换。
 *
 * @param {any} value
 * @returns {string}
 */
function text(value) {
    return typeof value === 'string' ? value : '';
}

/**
 * @param {Domain} D
 * @param {unknown} _U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, _U, _gateway, _localStorage) {
    /* 版本迁移与导入边界校验。 */
    Object.assign(
        D,
        /** @type {MigrationMixin} */ ({
            normalizeCardOrder(items) {
                // 旧置顶按原显示顺序并入同一列表，只读取克隆后的记录。
                if (items.some((item) => item.pinned === true)) {
                    items
                        .slice()
                        .sort(
                            (a, b) =>
                                Number(b.pinned === true) - Number(a.pinned === true) ||
                                (this.characterNumber(a.sortOrder) ?? Infinity) -
                                    (this.characterNumber(b.sortOrder) ?? Infinity) ||
                                (b.createdAt || 0) - (a.createdAt || 0),
                        )
                        .forEach((item, index) => {
                            item.sortOrder = index;
                        });
                }
                items.forEach((item) => {
                    delete item.pinned;
                });
            },

            validateBackup(data) {
                if (
                    !data ||
                    typeof data !== 'object' ||
                    Array.isArray(data) ||
                    !Array.isArray(data.characters) ||
                    !['transactions', 'equipment', 'goals'].some((key) => Array.isArray(data[key]))
                ) {
                    throw new Error(
                        '这不是应用备份文件，请选择完整数据备份；物品单价请在收益页导入',
                    );
                }
                if (
                    data.schemaVersion != null &&
                    (!Number.isInteger(data.schemaVersion) ||
                        data.schemaVersion > this.schemaVersion)
                ) {
                    throw new Error('备份版本高于当前应用或版本格式不正确，请使用兼容版本');
                }
                for (const key of [
                    'characters',
                    'transactions',
                    'equipment',
                    'goals',
                    'sessions',
                    'gearLogs',
                ]) {
                    if (data[key] == null) continue;
                    if (
                        !Array.isArray(data[key]) ||
                        data[key].some(
                            (item) =>
                                !item ||
                                typeof item !== 'object' ||
                                typeof item.id !== 'string' ||
                                !item.id.trim(),
                        )
                    )
                        throw new Error('备份中的「' + key + '」格式不正确');
                    if (new Set(data[key].map((item) => item.id)).size !== data[key].length)
                        throw new Error('备份中存在重复记录 ID：' + key);
                }
            },

            /** @this {Domain} @param {any} rawData @returns {DomainState} */
            normalize(rawData) {
                // 输入来自磁盘或导入文件，形状不可信，这里刻意保持 any 再逐字段收窄。
                let data = /** @type {any} */ (rawData);
                data = data && typeof data === 'object' ? data : {};
                if (data.schemaVersion > this.schemaVersion)
                    throw new Error('数据版本高于当前应用，请升级应用后打开');
                /**
                 * 这里只组装到 gearLogs，sessions/activeSession 由 normalizeOnline 补上，
                 * 所以中途不能标成完整的 DomainState。
                 * @type {any}
                 */
                const s = {
                    schemaVersion: this.schemaVersion,
                    characters: objects(data.characters).map(
                        /** @param {any} c */ (c) =>
                            Object.assign({}, c, {
                                pinned: c.pinned === true,
                                sortOrder: this.characterNumber(c.sortOrder),
                                progress: this.normalizeCharacterProgress(c.progress),
                                growthHistory: this.normalizeCharacterHistory(c.growthHistory),
                            }),
                    ),
                    transactions: objects(data.transactions).map(
                        /** @param {any} t */ (t) => Object.assign({}, t),
                    ),
                    goals: objects(data.goals).map(
                        /** @param {any} g */ (g) => Object.assign({}, g),
                    ),
                    equipment: objects(data.equipment).map(
                        /** @param {any} e */ (e) => Object.assign({}, e),
                    ),
                    gearLogs: objects(data.gearLogs).map(
                        /** @param {any} l */ (l) => Object.assign({}, l),
                    ),
                };
                s.transactions.forEach(
                    /** @param {any} t */ (t) => {
                        t.amount = number(t.amount) || 0;
                        t.minutes = number(t.minutes) || 0;
                        if (!['earnings', 'account'].includes(t.ledger)) {
                            const gear =
                                ['装备购入', '打造费用'].includes(t.category) ||
                                /^装备「/.test(text(t.note));
                            const topup = ['点卡充值', '充值点卡', '充值'].includes(t.category);
                            t.ledger =
                                gear || topup || t.currency === 'rmb' ? 'account' : 'earnings';
                            if (gear)
                                t.category = t.category === '打造费用' ? '养成投入' : '装备交易';
                            if (topup) t.category = '点卡充值';
                            // 旧版金额单位保持不变，不能把“万梦幻币”直接解释为人民币。
                        }
                        t.recordType =
                            t.ledger === 'earnings' &&
                            !(t.source === 'quick' && t.itemId === 99) &&
                            (t.recordType === 'item' ||
                                (!t.recordType &&
                                    t.source === 'quick' &&
                                    t.kind === 'income' &&
                                    t.itemId &&
                                    t.itemId !== 99))
                                ? 'item'
                                : 'money';
                        if (t.recordType === 'item') {
                            t.quantity = Math.max(1, number(t.quantity) || 1);
                            t.unitPrice = Math.max(
                                0,
                                number(t.unitPrice == null ? t.amount / t.quantity : t.unitPrice) ||
                                    0,
                            );
                            t.itemName = text(t.itemName) || text(t.note) || '物品';
                            t.status = Object.hasOwn(this.itemStatuses, t.status)
                                ? t.status
                                : 'held';
                            t.amount = this.itemValue(t);
                        }
                        t.fee = Math.max(0, number(t.fee) || 0);
                        t.channel = t.channel || '游戏内';
                    },
                );
                // 旧版装备同步流水没有外键：仅在装备名、日期、动作、金额都吻合时补关联。
                s.transactions
                    .filter(
                        /** @param {any} t */
                        (t) =>
                            t.ledger === 'account' &&
                            !t.equipmentId &&
                            /^装备「/.test(text(t.note)),
                    )
                    .forEach(
                        /** @param {any} t */ (t) => {
                            const note = text(t.note);
                            const eq = s.equipment.find(
                                /** @param {any} e */
                                (e) =>
                                    e.characterId === t.characterId &&
                                    note.startsWith('装备「' + text(e.name) + '」'),
                            );
                            if (!eq) return;
                            const log = s.gearLogs.find(
                                /** @param {any} l */
                                (l) =>
                                    !l.transactionId &&
                                    l.equipmentId === eq.id &&
                                    l.date === t.date &&
                                    number(l.amount) === t.amount &&
                                    (t.kind === 'income'
                                        ? l.action === 'sell'
                                        : ['buy', 'craft', 'gem'].includes(l.action)),
                            );
                            if (log) {
                                t.equipmentId = eq.id;
                                t.gearAction = log.action;
                                log.transactionId = t.id;
                                log.synced = true;
                                if (!eq.tradeBaseStatus)
                                    eq.tradeBaseStatus =
                                        eq.status === 'sold' && log.action === 'sell'
                                            ? 'active'
                                            : eq.status;
                            }
                        },
                    );
                s.goals.forEach(
                    /** @param {any} g */ (g) => {
                        g.sortOrder = this.characterNumber(g.sortOrder);
                        const tracking =
                            g.tracking && typeof g.tracking === 'object' ? g.tracking : null;
                        const metric =
                            g.type === 'progress' &&
                            tracking &&
                            this.growthCategory(tracking.category);
                        g.tracking = metric
                            ? {
                                  category: metric.v,
                                  key:
                                      ['skills', 'training'].includes(metric.kind) &&
                                      typeof tracking.key === 'string'
                                          ? tracking.key.trim()
                                          : '',
                              }
                            : null;
                        if (metric) g.unit = metric.unit;
                        g.target = number(g.target) || 0;
                        g.current = number(g.current) || 0;
                        g.logs = objects(g.logs).map(
                            /** @param {any} log */ (log) =>
                                Object.assign({}, log, { delta: number(log.delta) || 0 }),
                        );
                        if (!Number.isFinite(g.baseProgress))
                            g.baseProgress =
                                g.current -
                                g.logs.reduce(
                                    /** @param {number} sum @param {any} log */
                                    (sum, log) => sum + (number(log.delta) || 0),
                                    0,
                                );
                    },
                );
                this.normalizeCardOrder(s.characters);
                this.normalizeCardOrder(s.goals);
                // 快捷设置与物品单价都是冻结模块的数据，只保证「非普通对象时退回默认值」，
                // 合法数据原样保留，不在这里做任何格式统一。
                /**
                 * @param {any} value
                 * @returns {boolean}
                 */
                const plain = (value) =>
                    value !== null && typeof value === 'object' && !Array.isArray(value);
                const quick = plain(data.quickSettings) ? data.quickSettings : {};
                s.quickSettings = {
                    accounts: number(quick.accounts) || 5,
                    cardPrice: number(quick.cardPrice) || 15000,
                };
                s.itemPrices = plain(data.itemPrices) ? Object.assign({}, data.itemPrices) : {};
                s.transactions
                    .filter(/** @param {any} tx */ (tx) => tx.itemRecordId)
                    .forEach(
                        /** @param {any} sale */ (sale) => {
                            const item = s.transactions.find(
                                /** @param {any} tx */
                                (tx) => tx.id === sale.itemRecordId && tx.recordType === 'item',
                            );
                            if (item && sale.saleQuantity == null)
                                sale.saleQuantity = item.quantity;
                        },
                    );
                this.normalizeEquipment(s, data);
                return this.normalizeOnline(s, data);
            },
        }),
    );
}
