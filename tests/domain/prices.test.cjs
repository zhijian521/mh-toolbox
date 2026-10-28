'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDomain } = require('../../src/renderer/domain/create-domain.js');

/**
 * 物价卡片是独立集合：这里只验证它自己的读写与降级，不涉及角色、账本与装备。
 * 写入走真实的 commit 队列，因此需要一个能返回成功的 gateway 桩。
 */
function make() {
    return createDomain({
        gateway: {
            loadData: async () => ({ ok: true, data: {} }),
            saveData: async () => ({ ok: true }),
        },
        preferences: { getItem: () => null, setItem() {} },
    });
}

test('读取路径：坏数据无损降级，未知字段与条目都保留', () => {
    const D = make();
    const state = D.normalize({
        prices: [
            {
                id: 'p1',
                name: ' 高级兽决 ',
                extra: 'keep-me',
                logs: [
                    { id: 'l1', date: '2026-10-01', price: '150000', note: '  ' },
                    { date: 'not-a-date', price: -5 },
                    null,
                    'oops',
                ],
            },
            { name: '' },
            { id: 'p3', logs: 'broken' },
            null,
        ],
    });
    assert.equal(state.prices.length, 3);
    const first = state.prices[0];
    assert.equal(first.name, '高级兽决');
    assert.equal(first.extra, 'keep-me');
    assert.equal(first.logs.length, 2);
    assert.equal(first.logs[0].price, 150000);
    assert.equal(first.logs[0].note, '');
    // 坏日期退成空串、负价归零，条目不丢：读不出来的内容留给用户自己修。
    assert.equal(first.logs[1].date, '');
    assert.equal(first.logs[1].price, 0);
    assert.ok(first.logs[1].id);
    assert.equal(state.prices[1].name, '未命名物品');
    assert.equal(state.prices[1].category, '其他');
    assert.ok(state.prices[1].id);
    assert.deepEqual(state.prices[2].logs, []);
});

test('新建物品：可选初始价，名称与同名都会被拦下', async () => {
    const D = make();
    D.state = D.normalize({});
    const item = await D.savePriceItem({
        name: '高级兽决',
        category: '兽决',
        note: '紫禁城',
        price: 120000,
        date: '2026-10-20',
    });
    assert.equal(item.name, '高级兽决');
    // 界面不再填计价单位，新建统一记「个」。
    assert.equal(item.unit, '个');
    assert.equal(item.logs.length, 1);
    assert.equal(item.logs[0].price, 120000);
    assert.equal(item.logs[0].date, '2026-10-20');
    // 当前价由历史派生，卡片上不再单独存一份。
    assert.equal(D.priceCurrent(item).price, 120000);

    const bare = await D.savePriceItem({ name: '无价格' });
    assert.deepEqual(bare.logs, []);
    assert.equal(D.priceCurrent(bare), null);

    // 编辑不覆盖旧数据里的单位：早先版本记过「本」，界面上不再露出这个字段。
    const legacy = D.normalize({
        prices: [{ id: 'old', name: '旧卡片', unit: '本', logs: [] }],
    }).prices[0];
    D.state.prices.push(legacy);
    await D.savePriceItem({ name: '旧卡片改名', category: '兽决' }, 'old');
    assert.equal(legacy.unit, '本');
    assert.equal(legacy.name, '旧卡片改名');

    await assert.rejects(() => D.savePriceItem({ name: ' 高级兽决 ' }), /同名/);
    await assert.rejects(() => D.savePriceItem({ name: '   ' }), /名称/);
});

test('记价：同一天连记两条也能分出先后，涨跌与上一条不同日期的记录比', async () => {
    const D = make();
    D.state = D.normalize({});
    const item = await D.savePriceItem({ name: '金刚石', price: 100000, date: '2026-10-01' });
    await D.savePriceLog(item.id, { date: '2026-10-02', price: 110000 });
    await D.savePriceLog(item.id, { date: '2026-10-02', price: 120000 });

    const logs = D.priceLogsSorted(item);
    assert.equal(logs.length, 3);
    assert.equal(logs[0].price, 120000, '同一天后记的排在前面');
    assert.equal(logs[1].price, 110000);

    const change = D.priceChange(item);
    assert.equal(change.to, 120000);
    assert.equal(change.from, 100000, '基准取上一条不同日期的记录，同一天改价不算一次涨跌');
    assert.equal(change.delta, 20000);
    assert.equal(change.pct, 0.2);
    assert.equal(change.since, '2026-10-01');
});

test('涨跌：全部记录都落在同一天时退回上一条，不再返回 null', async () => {
    const D = make();
    D.state = D.normalize({});
    const item = await D.savePriceItem({
        name: '垃圾内丹',
        price: 110000,
        date: '2026-10-28',
    });
    await D.savePriceLog(item.id, { date: '2026-10-28', price: 100000 });

    // 一天内记两次价是常态，之前只认不同日期，这里会拿到 null、卡片没有徽章。
    const change = D.priceChange(item);
    assert.notEqual(change, null, '同一天记两次价也要能看到涨跌');
    assert.equal(change.to, 100000);
    assert.equal(change.from, 110000);
    assert.equal(change.delta, -10000);
    assert.equal(change.since, '2026-10-28');

    // 同一天两条价格一样时给 delta = 0（卡片显示「持平」），同样不是 null。
    await D.savePriceLog(item.id, { date: '2026-10-28', price: 100000 });
    assert.equal(D.priceChange(item).delta, 0);
});

test('涨跌：不足两条返回 null，跌价给出负值', async () => {
    const D = make();
    D.state = D.normalize({});
    const item = await D.savePriceItem({ name: '夜明珠', price: 300000, date: '2026-10-01' });
    assert.equal(D.priceChange(item), null);

    await D.savePriceLog(item.id, { date: '2026-10-05', price: 240000 });
    const change = D.priceChange(item);
    assert.equal(change.delta, -60000);
    assert.ok(Math.abs(change.pct + 0.2) < 1e-9);
});

test('价格显示口径：满万折万、满亿折亿，未记录给破折号', () => {
    const D = make();
    assert.deepEqual(D.priceLabel(15000), { value: '1.5', unit: '万' });
    assert.deepEqual(D.priceLabel(100000), { value: '10', unit: '万' });
    assert.deepEqual(D.priceLabel(120000000), { value: '1.2', unit: '亿' });
    assert.deepEqual(D.priceLabel(8000), { value: '8000', unit: '' });
    assert.deepEqual(D.priceLabel(0), { value: '—', unit: '' });
    assert.deepEqual(D.priceLabel(null), { value: '—', unit: '' });
});

test('改动只落物价集合：删记录与删卡片都不碰其他数据', async () => {
    const D = make();
    D.state = D.normalize({ transactions: [{ id: 't1', amount: 100 }], characters: [] });
    const before = JSON.stringify({ transactions: D.state.transactions });
    const item = await D.savePriceItem({ name: '定魂珠', price: 80000, date: '2026-10-01' });
    await D.savePriceLog(item.id, { date: '2026-10-03', price: 90000 });

    const logId = D.priceLogsSorted(item)[0].id;
    await D.removePriceLog(item.id, logId);
    assert.equal(D.priceCurrent(item).price, 80000);
    await assert.rejects(() => D.removePriceLog(item.id, logId), /已不存在/);

    await D.removePriceItem(item.id);
    assert.equal(D.state.prices.length, 0);
    assert.equal(JSON.stringify({ transactions: D.state.transactions }), before);

    // 全局角色筛选与物价无关，切换后列表不变。
    const other = await D.savePriceItem({ name: '龙鳞', price: 50000, date: '2026-10-01' });
    assert.ok(other.id);
    D.setCharFilter('c1');
    assert.equal(D.orderedPrices().length, 1);
});

test('排序：最近更新的在前，时间相同按名称', () => {
    const D = make();
    D.state = D.normalize({
        prices: [
            { id: 'a', name: 'b-item', updatedAt: 5, logs: [] },
            { id: 'b', name: 'c-item', updatedAt: 9, logs: [] },
            { id: 'c', name: 'a-item', updatedAt: 5, logs: [] },
        ],
    });
    assert.deepEqual(
        D.orderedPrices().map((item) => item.id),
        ['b', 'c', 'a'],
    );
});
