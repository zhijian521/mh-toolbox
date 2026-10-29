// @ts-check

/**
 * 记录导出：把筛选后的流水渲染成 CSV。
 * @typedef {object} ExportDomain 只用到下列成员，其余由领域对象在运行时提供
 * @property {(id: string) => string} charName
 * @property {(records: Tx[]) => string} recordsCsv
 * @typedef {object} Tx 流水记录，物品与资金共用一张表
 * @property {string} [date]
 * @property {string} [characterId]
 * @property {string} [recordType]
 * @property {string} [ledger]
 * @property {string} [kind]
 * @property {string} [category]
 * @property {string} [currency]
 * @property {number | string} [amount]
 * @property {number | string} [fee]
 * @property {string} [itemName]
 * @property {number | string} [quantity]
 * @property {number | string} [saleQuantity]
 * @property {number | string} [unitPrice]
 * @property {string} [channel]
 * @property {string} [note]
 */

/** @param {ExportDomain} D @param {any} U @param {unknown} _gateway @param {unknown} _localStorage */
export default function install(D, U, _gateway, _localStorage) {
    /* 导出复用列表筛选结果，金额列明确单位，文本避免被表格软件当作公式执行。 */
    /**
     * @this {ExportDomain}
     * @param {Tx[]} records
     * @returns {string} 带 BOM 的 CRLF 文本
     */
    D.recordsCsv = function (records) {
        /** @type {Array<Array<string | number>>} */
        const rows = [
            [
                '日期',
                '角色',
                '账本',
                '记录类型',
                '收支',
                '分类',
                '梦幻币（万）',
                '储备金（万）',
                '人民币（元）',
                '手续费（原币种）',
                '物品名称',
                '获得数量',
                '出售数量',
                '物品单价（万）',
                '渠道',
                '备注',
            ],
        ];
        records.forEach((tx) => {
            const item = tx.recordType === 'item';
            rows.push([
                tx.date || '',
                this.charName(tx.characterId || ''),
                tx.ledger === 'account' ? '账号账本' : '收益',
                item ? '物品' : '资金',
                tx.kind === 'income' ? '收入' : '支出',
                tx.category || '',
                !item && tx.currency === 'cash' ? tx.amount || '' : '',
                !item && tx.currency === 'reserve' ? tx.amount || '' : '',
                !item && tx.currency === 'rmb' ? tx.amount || '' : '',
                tx.fee || 0,
                item ? tx.itemName || '' : '',
                item ? tx.quantity || '' : '',
                tx.saleQuantity || '',
                item ? tx.unitPrice || '' : '',
                tx.channel || '',
                tx.note || '',
            ]);
        });
        return U.csvText(rows);
    };
}
