'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('./helpers/domain.cjs');
function fixture() {
    return {
        characters: [{ id: 'c1' }, { id: 'c2' }],
        transactions: [
            {
                id: 'e1',
                characterId: 'c1',
                date: '2026-10-01',
                kind: 'income',
                amount: 100,
                currency: 'cash',
                category: '捉鬼',
            },
            {
                id: 'e2',
                characterId: 'c1',
                date: '2026-10-02',
                kind: 'expense',
                amount: 20,
                currency: 'cash',
                category: '点卡',
            },
            {
                id: 'q1',
                characterId: 'c1',
                date: '2026-10-02',
                kind: 'income',
                amount: 150,
                currency: 'cash',
                category: '物品掉落',
                source: 'quick',
                itemId: 8,
                note: '金刚石',
            },
            {
                id: 'q2',
                characterId: 'c1',
                date: '2026-10-02',
                kind: 'income',
                amount: 10,
                currency: 'cash',
                category: '物品掉落',
                source: 'quick',
                itemId: 99,
                note: '金币',
            },
            {
                id: 'g1',
                characterId: 'c1',
                date: '2026-10-02',
                kind: 'expense',
                amount: 620,
                currency: 'cash',
                category: '装备购入',
                note: '装备「测试刀」购入',
            },
            {
                id: 'g2',
                characterId: 'c2',
                date: '2026-10-02',
                ledger: 'account',
                kind: 'expense',
                amount: 100,
                currency: 'rmb',
                category: '点卡充值',
                fee: 2,
            },
            {
                id: 'g3',
                characterId: 'c1',
                date: '2026-10-02',
                ledger: 'account',
                kind: 'income',
                amount: 300,
                currency: 'rmb',
                category: '装备交易',
                fee: 15,
            },
        ],
        equipment: [{ id: 'eq', characterId: 'c1', name: '测试刀', status: 'active' }],
        gearLogs: [
            {
                id: 'log',
                equipmentId: 'eq',
                characterId: 'c1',
                date: '2026-10-02',
                action: 'buy',
                amount: 620,
            },
        ],
    };
}
test('旧数据按账本迁移，金额和原始备份对象不变，重复迁移幂等', () => {
    const D = domain(),
        original = fixture(),
        before = JSON.stringify(original);
    const first = D.normalize(original);
    assert.equal(JSON.stringify(original), before);
    assert.equal(first.schemaVersion, D.schemaVersion);
    assert.equal(first.transactions.find((t) => t.id === 'g1').ledger, 'account');
    assert.equal(first.transactions.find((t) => t.id === 'g1').amount, 620);
    assert.equal(first.transactions.find((t) => t.id === 'q1').recordType, 'item');
    assert.equal(first.transactions.find((t) => t.id === 'q2').recordType, 'money');
    assert.equal(first.transactions.find((t) => t.id === 'g1').equipmentId, 'eq');
    assert.equal(first.gearLogs[0].transactionId, 'g1');
    assert.equal(JSON.stringify(D.normalize(first)), JSON.stringify(first));
});
test('实际收益、物品估值、人民币及梦幻币账号收支分别统计', () => {
    const D = domain();
    D.state = D.normalize(fixture());
    const st = D.stats(D.earnings());
    assert.equal(st.income, 110);
    assert.equal(st.expense, 20);
    assert.equal(st.net, 90);
    // 记账口径：数量 × 单价，和卖没卖无关（旧记录没有单价时按金额折算）。
    assert.equal(st.itemValue, 150);
    assert.equal(st.itemQty, 1);
    const rmb = D.accountStats(D.accounts(), 'rmb');
    assert.equal(rmb.income, 285);
    assert.equal(rmb.expense, 102);
    assert.equal(rmb.net, 183);
    assert.equal(D.accountStats(D.accounts(), 'cash').expense, 620);
    assert.equal(D.txIn('c1', '2026-10-02', '2026-10-02').length, 3);
    assert.equal(D.txIn('c2', '', '', 'account').length, 1);
});
test('出售物品只按成交额计入收入，禁止重复出售，删除成交恢复持有', () => {
    const D = domain();
    D.state = D.normalize(fixture());
    const item = D.state.transactions.find((t) => t.id === 'q1');
    assert.throws(() => D.settleItem(item, { date: '2026-09-30', amount: 145 }));
    const sale = D.settleItem(item, { date: '2026-10-03', amount: 145 });
    assert.equal(D.stats(D.earnings()).income, 255);
    assert.equal(D.stats(D.earnings()).itemValue, 150, '卖出不改变物品标价合计');
    assert.throws(() => D.settleItem(item, { date: '2026-10-04', amount: 145 }));
    D.removeTransaction(sale.id);
    assert.equal(item.status, 'held');
    assert.equal(D.stats(D.earnings()).income, 110);
    D.settleItem(item, { date: '2026-10-04', amount: 140 });
    D.removeTransaction(item.id);
    assert.equal(
        D.state.transactions.some((t) => t.itemRecordId === item.id),
        false,
    );
    assert.equal(D.stats(D.earnings()).income, 110);
});
test('装备双向关联不会重复记账，编辑替换时间线，删除收支恢复装备状态', () => {
    const D = domain();
    D.state = D.normalize(fixture());
    const tx = {
        id: 'sale',
        equipmentId: 'eq',
        characterId: 'c1',
        ledger: 'account',
        recordType: 'money',
        date: '2026-10-10',
        kind: 'income',
        currency: 'rmb',
        amount: 400,
        fee: 20,
        createdAt: 2,
    };
    D.state.transactions.push(tx);
    D.syncAccountEquipment(tx);
    assert.equal(D.state.equipment[0].status, 'sold');
    tx.amount = 450;
    D.syncAccountEquipment(tx);
    assert.equal(D.state.gearLogs.filter((l) => l.transactionId === tx.id).length, 1);
    assert.equal(D.state.gearLogs.find((l) => l.transactionId === tx.id).amount, 450);
    D.removeTransaction(tx.id);
    assert.equal(D.state.equipment[0].status, 'active');
    assert.equal(
        D.state.gearLogs.some((l) => l.transactionId === tx.id),
        false,
    );
});
test('新备份往返保留物品结算关系、币种、手续费及装备关联', () => {
    const D = domain();
    D.state = D.normalize(fixture());
    const item = D.state.transactions.find((t) => t.id === 'q1');
    const sale = D.settleItem(item, { date: '2026-10-03', amount: 145 });
    D.state = D.normalize(JSON.parse(JSON.stringify(D.state)));
    assert.equal(D.state.transactions.find((t) => t.id === item.id).saleId, sale.id);
    assert.equal(D.accountStats(D.accounts(), 'rmb').net, 183);
    D.removeTransaction(sale.id);
    assert.equal(
        D.state.transactions.find((t) => t.id === item.id).status,
        'held',
        '删除成交后物品回到持有',
    );
});

function onlineDomain() {
    const D = domain();
    D.state = D.normalize({ characters: [{ id: 'c1' }, { id: 'c2' }] });
    D.persist = async () => {};
    return D;
}
const onlineInput = {
    characterId: 'c1',
    mode: 'duration',
    date: '2020-02-28',
    minutes: 180,
    accounts: 5,
    cardPrice: 15000,
};

test('旧在线记录迁移保留原金额，不推测起止和价格，备份往返幂等', () => {
    const D = domain();
    const original = {
        schemaVersion: 2,
        characters: [{ id: 'c1' }],
        transactions: [
            {
                id: 'old',
                characterId: 'c1',
                ledger: 'earnings',
                recordType: 'money',
                source: 'quick',
                category: '点卡',
                kind: 'expense',
                date: '2020-02-28',
                minutes: 90,
                amount: 77.77,
            },
            {
                id: 'manual',
                characterId: 'c1',
                ledger: 'earnings',
                category: '点卡',
                kind: 'expense',
                date: '2020-02-28',
                minutes: 90,
                amount: 50,
            },
        ],
    };
    const before = JSON.stringify(original);
    D.state = D.normalize(original);
    assert.equal(JSON.stringify(original), before);
    assert.equal(D.state.sessions.length, 1);
    const session = D.state.sessions[0];
    assert.equal(session.mode, 'legacy');
    assert.equal(session.cost, 77.77);
    assert.equal(session.minutes, 90);
    assert.equal(session.accounts, null);
    assert.equal(session.startAt, undefined);
    assert.equal(
        JSON.stringify(D.normalize(JSON.parse(JSON.stringify(D.state)))),
        JSON.stringify(D.state),
    );
});

test('手动在线生成唯一点卡成本，在线小时不乘角色数，活动耗时不重复计入时薪', async () => {
    const D = onlineDomain();
    assert.equal(D.earningsStats('all', '', '').hourly, null);
    const session = await D.saveSession(onlineInput);
    assert.equal(session.cost, 135);
    assert.equal(D.state.transactions.length, 1);
    D.state.transactions.push({
        id: 'earned',
        ledger: 'earnings',
        recordType: 'money',
        date: onlineInput.date,
        characterId: 'c1',
        kind: 'income',
        amount: 300,
        minutes: 900,
        currency: 'cash',
    });
    const stats = D.earningsStats('c1', onlineInput.date, onlineInput.date);
    assert.equal(stats.onlineMinutes, 180);
    assert.equal(stats.net, 165);
    assert.equal(stats.hourly, 55);
    await D.saveSession(Object.assign({}, session, { minutes: 120 }));
    assert.equal(D.state.sessions.length, 1);
    assert.equal(D.state.transactions.filter((t) => t.sessionId === session.id).length, 1);
    assert.equal(D.state.transactions.find((t) => t.sessionId === session.id).amount, 90);
});

test('跨天在线按本地日期分摊，费用舍入守恒；编辑归属和日期重建流水，删除无残留', async () => {
    const D = onlineDomain();
    const session = await D.saveSession(
        Object.assign({}, onlineInput, {
            mode: 'range',
            startAt: new Date(2020, 1, 28, 23, 30).getTime(),
            endAt: new Date(2020, 1, 29, 1, 30).getTime(),
        }),
    );
    const first = D.onlineStats('c1', '2020-02-28', '2020-02-28');
    const second = D.onlineStats('c1', '2020-02-29', '2020-02-29');
    assert.equal(first.minutes, 30);
    assert.equal(first.cost, 22.5);
    assert.equal(second.minutes, 90);
    assert.equal(second.cost, 67.5);
    assert.equal(D.stats(D.txIn('c1', '2020-02-28', '2020-02-28')).expense, first.cost);
    const uneven = await D.saveSession(
        Object.assign({}, session, {
            cardPrice: 12345,
            endAt: new Date(2020, 1, 29, 1, 31, 17).getTime(),
        }),
    );
    const sum = D.state.transactions
        .filter((t) => t.sessionId === session.id)
        .reduce((total, t) => total + Math.round(t.amount * 100), 0);
    assert.equal(sum, Math.round(uneven.cost * 100));
    await D.saveSession(
        Object.assign({}, session, {
            characterId: 'c2',
            startAt: new Date(2020, 2, 1, 1).getTime(),
            endAt: new Date(2020, 2, 1, 2).getTime(),
        }),
    );
    assert.equal(D.txIn('c1', '', '').length, 0);
    assert.equal(D.txIn('c2', '', '').length, 1);
    D.removeTransaction(D.state.transactions[0].id);
    assert.equal(D.state.sessions.length, 0);
    assert.equal(D.state.transactions.length, 0);
});

test('在线校验阻止重叠、反向、未来及无效时长，邻接时段可保存', async () => {
    const D = onlineDomain();
    const range = Object.assign({}, onlineInput, {
        mode: 'range',
        startAt: new Date(2020, 1, 28, 10).getTime(),
        endAt: new Date(2020, 1, 28, 11).getTime(),
    });
    await D.saveSession(range);
    await assert.rejects(D.saveSession(range), /重叠/);
    await assert.rejects(
        D.saveSession(Object.assign({}, range, { startAt: range.endAt + 1000 })),
        /时长|结束时间/,
    );
    await assert.rejects(
        D.saveSession(Object.assign({}, range, { startAt: Date.now(), endAt: Date.now() + 10000 })),
        /当前时间/,
    );
    await assert.rejects(D.saveSession(Object.assign({}, onlineInput, { minutes: 0 })), /时长/);
    await assert.rejects(
        D.saveSession(Object.assign({}, onlineInput, { minutes: 1441 })),
        /24 小时/,
    );
    await assert.rejects(
        D.saveSession(Object.assign({}, onlineInput, { date: '2020-02-30' })),
        /日期/,
    );
    await D.saveSession(
        Object.assign({}, range, { startAt: range.endAt, endAt: range.endAt + 3600000 }),
    );
    assert.equal(D.state.sessions.length, 2);
});

test('角色数上限写不进参数表，但历史超范围的会话仍能结算', async () => {
    const D = onlineDomain();
    assert.throws(() => D.setQuickSettings({ accounts: 30, cardPrice: 15000 }), /1-20/);
    // 旧版本允许存 30：读取保留、结束计时也必须能结算，否则 activeSession 永远清不掉。
    D.state.quickSettings = { accounts: 30, cardPrice: 15000 };
    const active = await D.startSession('c1');
    assert.equal(active.accounts, 30);
    await D.adjustSessionStart(Date.now() - 3600000);
    const session = await D.saveSession(
        Object.assign({}, D.state.activeSession, { mode: 'range', endAt: Date.now() }),
        active.id,
    );
    assert.ok(session.cost > 0);
    assert.equal(D.state.activeSession, null);
});

test('删掉一段在线记录会带走它按天拆出的全部点卡流水，不影响别的会话', async () => {
    const D = onlineDomain();
    // 23:00 打到次日 02:00：跨天会拆成两行点卡，删一行等于整段删掉。
    const first = await D.saveSession({
        characterId: 'c1',
        mode: 'range',
        startAt: new Date(2020, 1, 28, 23, 0).getTime(),
        endAt: new Date(2020, 1, 29, 2, 0).getTime(),
        accounts: 5,
        cardPrice: 15000,
        source: 'timer',
    });
    const second = await D.saveSession(Object.assign({}, onlineInput, { date: '2020-02-27' }));
    assert.equal(D.state.transactions.filter((t) => t.sessionId === first.id).length, 2);
    D.removeSession(first.id);
    assert.equal(
        D.state.sessions.some((s) => s.id === first.id),
        false,
        '会话一并删除',
    );
    assert.equal(
        D.state.transactions.filter((t) => t.sessionId === first.id).length,
        0,
        '该会话的点卡流水全部删除',
    );
    assert.equal(
        D.state.transactions.filter((t) => t.sessionId === second.id).length,
        1,
        '别的会话不受影响',
    );
});

test('计时保存参数快照、调整开始时间；结束失败可恢复重试且不重复结算', async () => {
    const D = onlineDomain();
    const active = await D.startSession('c1');
    D.state.quickSettings = { accounts: 1, cardPrice: 20000 };
    D.setCharFilter('c2');
    assert.equal(active.accounts, 5);
    assert.equal(active.cardPrice, 15000);
    assert.equal(active.characterId, 'c1');
    await assert.rejects(D.startSession('c2'), /未结束/);
    await D.adjustSessionStart(Date.now() - 7200000);
    const endAt = D.state.activeSession.startAt + 7200000;
    const input = Object.assign({}, D.state.activeSession, {
        mode: 'range',
        endAt,
        source: 'timer',
    });
    D.persist = async () => {
        throw new Error('磁盘写入失败');
    };
    await assert.rejects(D.saveSession(input, active.id), /磁盘/);
    assert.equal(D.state.activeSession.id, active.id);
    assert.equal(D.state.sessions.length, 0);
    assert.equal(D.state.transactions.length, 0);
    D.persist = async () => {};
    const session = await D.saveSession(input, active.id);
    assert.equal(session.cost, 90);
    assert.equal(session.characterId, 'c1');
    assert.equal(D.state.activeSession, null);
    await assert.rejects(D.saveSession(input, active.id), /已结束/);
    assert.equal(D.state.sessions.length, 1);
    D.state = D.normalize(JSON.parse(JSON.stringify(D.state)));
    assert.equal(D.state.sessions[0].id, session.id);
});

test('收益实时同步成账号「游戏收益」：一天一条、覆盖前值、为 0 时删掉', async () => {
    const D = onlineDomain();
    const date = '2020-02-28';
    const quick = (id, patch) =>
        Object.assign(
            {
                id,
                ledger: 'earnings',
                recordType: 'money',
                source: 'quick',
                characterId: 'c1',
                date,
                kind: 'income',
                currency: 'cash',
                category: '物品掉落',
                amount: 0,
            },
            patch,
        );
    const findSettle = () =>
        D.state.transactions.filter((t) => t.ledger === 'account' && t.category === '游戏收益');
    // 180 分钟 × 5 角色 × 15000 / 点 = 135 万，与收益账本里的点卡流水一致。
    await D.saveSession(onlineInput);
    D.state.transactions.push(
        quick('q1', { amount: 300 }),
        quick('q2', {
            recordType: 'item',
            itemName: '金刚石',
            quantity: 2,
            unitPrice: 50,
            status: 'held',
        }),
    );
    let entries = await D.syncAccountEarnings([date]);
    assert.deepEqual(entries, [{ date, characterId: 'c1', amount: 265 }]);
    let settled = findSettle();
    assert.equal(settled.length, 1, '一天一条');
    assert.equal(settled[0].kind, 'income');
    assert.equal(settled[0].source, 'settle');
    assert.equal(settled[0].currency, 'cash');
    assert.equal(settled[0].amount, 265, '300 + 2 × 50 − 135');

    // 再速记一笔，改的是原来那条，不新增。
    const firstId = settled[0].id;
    D.state.transactions.push(quick('q3', { amount: 35 }));
    await D.syncAccountEarnings([date]);
    settled = findSettle();
    assert.equal(settled.length, 1);
    assert.equal(settled[0].id, firstId);
    assert.equal(settled[0].amount, 300);

    // 账号页手记过同分类的「游戏收益」也被接管，不会并存第二条。
    D.state.transactions.push({
        id: 'manual',
        ledger: 'account',
        recordType: 'money',
        characterId: 'c1',
        date,
        kind: 'income',
        currency: 'cash',
        category: '游戏收益',
        amount: 999,
    });
    await D.syncAccountEarnings([date]);
    assert.equal(findSettle().length, 1, '手记的那条被接管而不是并存');
    assert.equal(findSettle()[0].amount, 300);

    // 去掉速记与在线，金额归零，那条记录也要消失，不留 0 元空账。
    D.state.transactions = D.state.transactions.filter(
        (t) => t.ledger !== 'earnings' && t.id !== 'manual',
    );
    D.state.sessions.forEach((session) => D.removeSession(session.id));
    entries = await D.syncAccountEarnings([date]);
    assert.deepEqual(entries, []);
    assert.equal(findSettle().length, 0, '金额为 0 时删掉那条');
});

test('同步按角色分开算，跨天会话只补自己那一天', async () => {
    const D = onlineDomain();
    const c2 = await D.saveSession(
        Object.assign({}, onlineInput, {
            characterId: 'c2',
            mode: 'range',
            startAt: new Date(2020, 1, 28, 23, 30).getTime(),
            endAt: new Date(2020, 1, 29, 1, 30).getTime(),
        }),
    );
    assert.equal(c2.cost, 90, '两小时 × 5 角色 × 15000 / 点');
    D.state.transactions.push({
        id: 'q1',
        ledger: 'earnings',
        recordType: 'money',
        source: 'quick',
        characterId: 'c1',
        date: '2020-02-29',
        kind: 'income',
        currency: 'cash',
        category: '物品掉落',
        amount: 80,
    });
    const entries = await D.syncAccountEarnings(['2020-02-28', '2020-02-29']);
    const byKey = {};
    entries.forEach((entry) => (byKey[entry.date + entry.characterId] = entry.amount));
    // 28 日：c2 有半小时在线（22.5 万），没有速记，所以是亏损。
    assert.equal(byKey['2020-02-28c2'], -22.5);
    // 29 日：c2 还有 90 分钟在线（67.5 万），c1 只有一笔速记。
    assert.equal(byKey['2020-02-29c2'], -67.5);
    assert.equal(byKey['2020-02-29c1'], 80);
    const rows = D.state.transactions.filter(
        (t) => t.ledger === 'account' && t.category === '游戏收益',
    );
    assert.equal(rows.length, 3, '三天次、两个角色各一条');
    assert.equal(
        rows.find((t) => t.date === '2020-02-28').kind,
        'expense',
        '亏的那天记支出，不塞进收入',
    );
});

test('多开计时把点卡按在线角色平摊，合计仍等于整段成本', async () => {
    const D = onlineDomain();
    D.state.characters.push({ id: 'c3' });
    // 7 分钟 × 3 个号 × 13777 游戏币/点 = 2.89 万，除不尽，正好验证尾差守恒。
    const session = await D.saveSession({
        characterId: 'c1',
        roster: ['c1', 'c2', 'c3'],
        mode: 'duration',
        date: '2020-02-28',
        minutes: 7,
        cardPrice: 13777,
    });
    assert.equal(session.cost, 2.89);
    assert.equal(session.accounts, 3, '角色数取勾选人数');
    const cards = D.state.transactions.filter((t) => t.sessionId === session.id);
    assert.equal(cards.length, 3, '每个在线角色各一条点卡');
    const sum = cards.reduce((total, t) => total + Math.round(t.amount * 100), 0);
    assert.equal(sum, 289, '分摊后合计与整段成本一致，不多不少一分');
    assert.equal(new Set(cards.map((t) => t.characterId)).size, 3, '三个角色都拿到了点卡');
    // 单角色视角只看自己那一份，「全部角色」看整段——不能按人头翻倍。
    assert.equal(D.onlineStats('c2', '2020-02-28', '2020-02-28').cost, 0.96);
    assert.equal(D.onlineStats('c2', '2020-02-28', '2020-02-28').minutes, 7);
    const all = D.onlineStats('all', '2020-02-28', '2020-02-28');
    assert.equal(all.cost, 2.89);
    assert.equal(all.minutes, 7);
});

test('速记按在线角色均分，尾差守恒；物品整条归主角色', async () => {
    const D = onlineDomain();
    D.state.characters.push({ id: 'c3' });
    const base = {
        ledger: 'earnings',
        date: '2026-10-28',
        kind: 'income',
        currency: 'cash',
        category: '物品掉落',
        channel: '游戏内',
        minutes: 0,
        note: '金币',
        source: 'quick',
        itemId: 99,
    };
    const money = await D.saveQuickLoot(
        Object.assign({}, base, {
            recordType: 'money',
            characterIds: ['c1', 'c2', 'c3'],
            amount: 30.01,
        }),
    );
    assert.equal(money.length, 3, '三个在线角色各一条');
    assert.equal(
        money.reduce((total, t) => total + Math.round(t.amount * 100), 0),
        3001,
        '均分后合计与原金额一致',
    );
    assert.deepEqual(
        money.map((t) => t.amount),
        [10.01, 10, 10],
        '尾差落在第一份',
    );
    const item = await D.saveQuickLoot(
        Object.assign({}, base, {
            recordType: 'item',
            characterIds: ['c2', 'c3'],
            amount: 5,
            itemName: '光芒石',
            quantity: 1,
            unitPrice: 5,
            status: 'held',
        }),
    );
    assert.equal(item.length, 1, '物品数量不可拆，只写一条');
    assert.equal(item[0].characterId, 'c2', '归主角色');
    assert.equal(item[0].amount, 5);
    await assert.rejects(D.saveQuickLoot(Object.assign({}, base, { characterIds: [] })), /角色/);
});

test('多开后两个号各自结算出净值，不会一个吃收益、另一个只剩点卡', async () => {
    const D = onlineDomain();
    const base = {
        ledger: 'earnings',
        recordType: 'money',
        date: '2026-10-28',
        kind: 'income',
        currency: 'cash',
        category: '物品掉落',
        channel: '游戏内',
        minutes: 0,
        note: '金币',
        source: 'quick',
        itemId: 99,
    };
    await D.saveQuickLoot(Object.assign({}, base, { characterIds: ['c1'], amount: 30 }));
    await D.saveQuickLoot(Object.assign({}, base, { characterIds: ['c2'], amount: 20 }));
    // 两个号同时在线 1 小时：点卡 18 万，各摊 9 万。
    await D.saveSession({
        characterId: 'c1',
        roster: ['c1', 'c2'],
        mode: 'duration',
        date: '2026-10-28',
        minutes: 60,
        cardPrice: 15000,
    });
    assert.equal(D.onlineStats('c1', '2026-10-28', '2026-10-28').cost, 9);
    const entries = await D.syncAccountEarnings(['2026-10-28']);
    const byChar = {};
    entries.forEach((entry) => (byChar[entry.characterId] = entry));
    assert.equal(entries.length, 2, '两个在线的号各一条');
    assert.equal(byChar.c1.amount, 21, '30 − 9');
    assert.equal(byChar.c2.amount, 11, '20 − 9，不再是孤立的一条点卡支出');
    const rows = D.state.transactions.filter(
        (t) => t.ledger === 'account' && t.category === '游戏收益',
    );
    assert.equal(
        rows.every((t) => t.kind === 'income'),
        true,
        '两个号的净额都是正的',
    );
});
