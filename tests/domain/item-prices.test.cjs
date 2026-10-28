'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('./helpers/domain.cjs');
const { fixedItemMeta } = require('../../src/renderer/game-data/quick-catalog.js');

/**
 * 单价表的 CSV 导入导出。
 *
 * 这块的关键不在「能不能写进去」，而在**留空的语义**：用户从导出文件里删掉几个数
 * 再导回来是很自然的操作，如果空单元格被当成 0，一次导入就能把没改的那些价清空。
 * 所以下面每个用例都围着这条边界转。
 */
function fixture() {
    const D = domain();
    D.state = D.normalize({ characters: [], transactions: [] });
    D.persist = async () => {};
    return D;
}

/** 把 CSV 拆成行，方便断言，不依赖被测的解析器。 */
function lines(text) {
    return text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');
}

test('导出：全部固定价物品都在，未设价的留空', () => {
    const D = fixture();
    D.state.itemPrices = { 1: 15000, 2: 20000 };
    const rows = lines(D.itemPriceCsv());
    assert.equal(rows[0], '"物品ID","物品名称","单价（万）"');
    assert.equal(rows.length, fixedItemMeta.length + 1);
    assert.equal(rows[1], '"1","60武器","1.5"');
    assert.equal(rows[2], '"2","70武器","2"');
    assert.equal(rows[3], '"3","80武器",""');
    // 不固定价格的组不该出现在这张表里。
    assert.ok(!rows.some((row) => row.startsWith('"99"')));
});

test('导入：填数写入、填 0 清除、留空保持原值', async () => {
    const D = fixture();
    D.state.itemPrices = { 1: 15000, 2: 20000, 3: 8888 };
    const csv = ['物品ID,物品名称,单价（万）', '1,60武器,2.5', '2,70武器,0', '3,80武器,'].join(
        '\n',
    );
    const result = await D.importItemPriceCsv(csv);
    assert.equal(result.updated, 1);
    assert.equal(result.cleared, 1);
    assert.equal(result.skipped, 0);
    assert.equal(D.state.itemPrices['1'], 25000);
    assert.equal('2' in D.state.itemPrices, false);
    assert.equal(D.state.itemPrices['3'], 8888);
});

test('导入：未知 ID 与重复行计入跳过，并给出可读原因', async () => {
    const D = fixture();
    D.state.itemPrices = {};
    const csv = ['1,60武器,1', '999,不存在,3', '1,60武器,5', '7,特赦令牌,abc'].join('\n');
    const result = await D.importItemPriceCsv(csv);
    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 2);
    assert.equal(D.state.itemPrices['1'], 10000, '重复行只认第一条');
    assert.ok(!('999' in D.state.itemPrices));
    assert.equal(result.problems.length, 2);
    assert.match(result.problems[0], /没有 ID 999/);
    assert.match(result.problems[1], /重复/);
});

test('导入：带 BOM、CRLF、引号与千分位的表格文件也能读', async () => {
    const D = fixture();
    D.state.itemPrices = {};
    const csv = '\uFEFF"物品ID","物品名称","单价（万）"\r\n"8","金刚石","1,200"\r\n';
    const result = await D.importItemPriceCsv(csv);
    assert.equal(result.updated, 1);
    // "1,200" 是 Excel 里的千分位写法，去掉逗号后按 1200 万记。
    assert.equal(D.state.itemPrices['8'], 12000000);
});

test('导入：引号内的逗号不会切断单元格', async () => {
    const D = fixture();
    D.state.itemPrices = {};
    // 名称里带逗号时 Excel 会用引号包起来，切错列就会把单价读到名称列去。
    const result = await D.importItemPriceCsv('1,"60武器, 附魔","1"');
    assert.equal(result.updated, 1);
    assert.equal(D.state.itemPrices['1'], 10000);
});

test('导入：没有任何可用单价时明确报错，不动现有数据', async () => {
    const D = fixture();
    D.state.itemPrices = { 1: 15000 };
    const result = await D.importItemPriceCsv('物品ID,物品名称,单价（万）\n1,60武器,');
    assert.equal(result.updated, 0);
    assert.equal(result.cleared, 0);
    assert.match(result.problems[0], /没有可用/);
    assert.equal(D.state.itemPrices['1'], 15000);
});

test('估值跟当前单价走，没设价才退回记录里的单价', () => {
    const D = fixture();
    const tx = {
        id: 't1',
        ledger: 'earnings',
        recordType: 'item',
        kind: 'income',
        characterId: 'c1',
        date: '2026-01-01',
        itemId: 1,
        quantity: 3,
        // 记这条时的价是 5 万，后来物价表里改成了 8 万。
        unitPrice: 5,
    };
    D.state.transactions = [tx];
    D.state.itemPrices = {};
    assert.equal(D.itemUnitPrice(tx), 5);
    assert.equal(D.itemValue(tx), 15);

    // 设了当前价：单价与估值都换成 8 万，历史记录不改也能跟上。
    D.state.itemPrices = { 1: 80000 };
    assert.equal(D.itemUnitPrice(tx), 8);
    assert.equal(D.itemValue(tx), 24);
    assert.equal(D.stats([tx]).itemValue, 24);

    // 不固定价格的物品不在单价表里，只能退回记录时那一笔。
    const variable = { ...tx, itemId: 106, quantity: 2, unitPrice: 30 };
    assert.equal(D.itemUnitPrice(variable), 30);
    assert.equal(D.itemValue(variable), 60);
});
