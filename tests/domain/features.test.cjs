'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('./helpers/domain.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
    const D = domain();
    D.state = D.normalize({
        characters: [
            { id: 'c1', name: '主号', school: '大唐官府' },
            { id: 'c2', name: '小号', school: '大唐官府' },
        ],
        transactions: [],
    });
    D.persist = async () => {};
    return D;
}
const loot = {
    ledger: 'earnings',
    recordType: 'item',
    kind: 'income',
    characterId: 'c1',
    date: '2026-01-01',
    currency: 'cash',
    category: '物品掉落',
    itemName: '宝石',
    quantity: 10,
    unitPrice: 5,
    status: 'held',
};

test('带成交关系的物品与库存保持一致，编辑与删除成交记录不走样', async () => {
    const D = fixture();
    const item = await D.saveTransaction(loot);
    const sale = await D.saveTransaction({
        ledger: 'earnings',
        recordType: 'money',
        kind: 'income',
        currency: 'cash',
        characterId: 'c1',
        date: '2026-01-02',
        amount: 18,
        itemRecordId: item.id,
        saleQuantity: 4,
    });
    const live = () => D.state.transactions.find((tx) => tx.id === item.id);
    assert.equal(D.itemRemaining(live()), 6);
    assert.equal(live().status, 'held');
    // 不记库存：统计只报物品标价合计，没有「持有估值」这回事。
    assert.equal(D.stats(D.earnings()).itemValue, 50);
    assert.equal(D.stats(D.earnings()).income, 18);
    // 改成交数量，剩余量跟着变；改到等于获得数量即视为卖完，改小又回到持有。
    await D.saveTransaction({ saleQuantity: 2 }, sale.id);
    assert.equal(D.itemRemaining(live()), 8);
    await D.saveTransaction({ saleQuantity: 10 }, sale.id);
    assert.equal(live().status, 'sold');
    await D.saveTransaction({ saleQuantity: 2 }, sale.id);
    assert.equal(live().status, 'held');
    // 获得数量不能少于已出售数量；成交数量不能超过可出售数量。
    await assert.rejects(D.saveTransaction({ quantity: 1 }, item.id), /少于/);
    await assert.rejects(D.saveTransaction({ saleQuantity: 11 }, sale.id), /可出售/);
    await D.commit(() => D.removeTransaction(sale.id));
    assert.equal(D.itemRemaining(live()), 10);
    assert.equal(D.stats(D.earnings()).income, 0);
});

test('旧整单出售迁移保留金额，增加获得数量后释放库存，序列化往返幂等', () => {
    const D = fixture();
    const input = {
        schemaVersion: 4,
        characters: [{ id: 'c1', name: '主号' }],
        transactions: [
            { ...loot, id: 'item', status: 'sold', saleId: 'sale' },
            {
                id: 'sale',
                ledger: 'earnings',
                recordType: 'money',
                kind: 'income',
                currency: 'cash',
                characterId: 'c1',
                itemRecordId: 'item',
                date: '2026-01-02',
                amount: 49,
            },
        ],
    };
    const snapshot = JSON.stringify(input);
    D.state = D.normalize(input);
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(D.state.transactions[1].saleQuantity, 10);
    assert.equal(D.stats(D.earnings()).income, 49);
    assert.equal(D.itemRemaining(D.state.transactions[0]), 0);
    assert.deepEqual(plain(D.normalize(D.state)), plain(D.state));
});

test('串行提交中首次保存失败会回滚，排队写入继续读取正确状态，重试不重复删除', async () => {
    const D = fixture();
    const first = await D.saveTransaction(loot);
    const second = await D.saveTransaction({ ...loot, itemName: '宝石二' });
    let calls = 0;
    D.persist = async () => {
        if (++calls === 1) throw new Error('磁盘写入失败');
    };
    const results = await Promise.allSettled([
        D.commit(() => D.removeTransaction(first.id)),
        D.commit(() => D.removeTransaction(second.id)),
    ]);
    assert.equal(results[0].status, 'rejected');
    assert.equal(results[1].status, 'fulfilled');
    assert.equal(D.state.transactions.length, 1, '回滚的那次不留痕，成功的那次才生效');
    await D.commit(() => D.removeTransaction(first.id));
    assert.equal(D.state.transactions.length, 0, '重试删除同一记录只生效一次');
});

test('目标历史编辑、删除保留旧基础进度，完成日期独立，失败可重试', async () => {
    const D = fixture();
    D.state.goals = D.normalize({
        goals: [
            {
                id: 'g',
                characterId: 'c1',
                title: '修炼',
                target: 20,
                current: 12,
                unit: '级',
                status: 'active',
                logs: [{ id: 'old', date: '2026-01-01', delta: 2 }],
            },
        ],
    }).goals;
    const goal = () => D.state.goals[0];
    assert.equal(goal().baseProgress, 10);
    const entry = await D.saveGoalProgress('g', { date: '2026-01-02', delta: 3.5, note: '补记' });
    assert.equal(goal().current, 15.5);
    await D.saveGoalProgress('g', { date: '2026-01-02', delta: 4.5 }, entry.id);
    assert.equal(goal().current, 16.5);
    await D.removeGoalProgress('g', 'old');
    assert.equal(goal().current, 14.5);
    const snapshot = JSON.stringify(D.state);
    D.persist = async () => {
        throw new Error('失败');
    };
    await assert.rejects(D.saveGoalProgress('g', { date: '2026-01-03', delta: 1 }), /失败/);
    assert.equal(JSON.stringify(D.state), snapshot);
    D.persist = async () => {};
    await D.setGoalStatus('g', 'done');
    assert.equal(goal().current, 20);
    assert.match(goal().doneAt, /^\d{4}-\d{2}-\d{2}$/);
    const done = goal().logs.at(-1);
    await D.removeGoalProgress('g', done.id);
    assert.equal(goal().status, 'active');
    assert.equal(goal().doneAt, undefined);
    await assert.rejects(D.saveGoalProgress('g', { date: '2026-02-30', delta: 1 }));
    await D.saveGoalProgress('g', { date: '2026-01-03', delta: -99 });
    assert.equal(goal().current, 0);
    const created = await D.saveGoal({
        characterId: 'c2',
        title: ' 新目标 ',
        target: 10,
        unit: '个',
    });
    assert.equal(created.title, '新目标');
    await D.removeGoal(created.id);
    assert.equal(D.state.goals.length, 1);
});

test('门派模板保留自定义技能与 0 等级，技能列表保存不共享数组引用', async () => {
    const D = fixture();
    for (const school of D.schools.filter((name) => name !== '其他'))
        assert.equal(D.schoolSkillNames[school].length, 7, school);
    const filled = D.fillSchoolSkills('大唐官府', [
        { name: '为官之道', level: 0 },
        { name: '自定义', level: 20 },
    ]);
    assert.equal(filled.length, 8);
    assert.equal(filled[0].level, 0);
    assert.equal(filled.at(-1).level, null);
    assert.equal(D.fillSchoolSkills('大唐官府', filled).length, 8);
    await D.saveCharacterProgress('c1', { schoolSkills: filled });
    await D.saveCharacterProgress('c2', { schoolSkills: D.charById('c1').progress.schoolSkills });
    D.charById('c1').progress.schoolSkills[0].level = 150;
    assert.equal(D.charById('c2').progress.schoolSkills[0].level, 0);
});

test('备份边界拒绝单价文件和未来版本；替换失败保留活动计时，成功携带覆盖前备份选项', async () => {
    const D = fixture();
    D.state.activeSessions = [{ id: 'active', characterId: 'c1', startAt: Date.now() }];
    const snapshot = JSON.stringify(D.state);
    for (const invalid of [
        { 1: 1000 },
        { schemaVersion: 99, characters: [], transactions: [] },
        { characters: [{ id: 'a' }, { id: 'a' }], transactions: [] },
    ])
        await assert.rejects(D.replaceState(invalid));
    assert.equal(JSON.stringify(D.state), snapshot);
    D.persist = async () => {
        throw new Error('保存失败');
    };
    await assert.rejects(D.replaceState({ characters: [], transactions: [] }));
    assert.equal(JSON.stringify(D.state), snapshot);
    let options;
    D.persist = async (value) => {
        options = value;
    };
    await D.replaceState({ characters: [], transactions: [] });
    assert.equal(D.state.activeSessions.length, 0);
    assert.equal(options.backupReason, 'import');
});

test('CSV 包含 BOM、单位、引号换行与公式防护，物品不带库存列', async () => {
    const D = fixture();
    D.charById('c1').name = '=SUM(A1:A2)';
    const item = await D.saveTransaction({ ...loot, note: '文字,"引号"\n第二行' });
    await D.saveTransaction({
        ledger: 'earnings',
        recordType: 'money',
        kind: 'income',
        currency: 'cash',
        characterId: 'c1',
        date: '2026-01-02',
        amount: 6,
        itemRecordId: item.id,
        saleQuantity: 2,
    });
    const csv = D.recordsCsv(D.state.transactions);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.ok(csv.includes('"梦幻币（万）"'));
    assert.ok(csv.includes('"\'=SUM(A1:A2)"'));
    assert.ok(csv.includes('"文字,""引号""\n第二行"'));
    // 获得数量 → 出售数量 → 单价；「剩余数量」「剩余估值」两列随库存概念一起去掉了。
    assert.ok(csv.includes('"10","","5"'));
    assert.equal(csv.includes('剩余数量'), false);
    assert.equal(csv.includes('剩余估值'), false);
});

test('活动在线汇总不修改缓存值；角色及日期筛选生效', async () => {
    const D = fixture();
    await D.startSessions(['c1']);
    D.state.activeSessions[0].startAt -= 3600000;
    const settled = D.earningsStats('all', '', '');
    const snapshot = JSON.stringify(settled);
    const active = D.includeActiveEarnings(settled, 'all', '', '');
    assert.equal(JSON.stringify(settled), snapshot);
    assert.ok(active.onlineMinutes >= 60 && active.cardCost > 0);
    assert.equal(D.includeActiveEarnings(settled, 'c2', '', '').onlineMinutes, 0);
    assert.equal(D.includeActiveEarnings(settled, 'all', '', '2000-01-01').onlineMinutes, 0);
});
