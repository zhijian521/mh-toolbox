// Migrated from the immutable v1 baseline; see migration/baseline.json.
export default function install(D, U, gateway, localStorage) {
    /* 导出复用列表筛选结果，金额列明确单位，文本避免被表格软件当作公式执行。 */
    D.recordsCsv = function (records) {
        const cell = (value) => {
            let text = String(value == null ? '' : value);
            if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
            return '"' + text.replace(/"/g, '""') + '"';
        };
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
                '剩余数量',
                '出售数量',
                '物品单价（万）',
                '剩余估值（万）',
                '渠道',
                '备注',
            ],
        ];
        records.forEach((tx) => {
            const item = tx.recordType === 'item';
            rows.push([
                tx.date,
                this.charName(tx.characterId),
                tx.ledger === 'account' ? '账号账本' : '收益',
                item ? '物品' : '资金',
                tx.kind === 'income' ? '收入' : '支出',
                tx.category,
                !item && tx.currency === 'cash' ? tx.amount : '',
                !item && tx.currency === 'reserve' ? tx.amount : '',
                !item && tx.currency === 'rmb' ? tx.amount : '',
                tx.fee || 0,
                item ? tx.itemName : '',
                item ? tx.quantity : '',
                item ? this.itemRemaining(tx) : '',
                tx.saleQuantity || '',
                item ? tx.unitPrice : '',
                item ? this.itemHoldingValue(tx) : '',
                tx.channel || '',
                tx.note || '',
            ]);
        });
        return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
    };
}
