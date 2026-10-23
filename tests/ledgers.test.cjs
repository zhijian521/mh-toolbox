'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function domain() {
  const context = vm.createContext({ window: {}, localStorage: { getItem() { return null; }, setItem() {} } });
  for (const file of ['util', 'data']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/core/' + file + '.js'), 'utf8'), context);
  return context.window.D;
}
function fixture() {
  return { characters: [{ id: 'c1' }, { id: 'c2' }], transactions: [
    { id: 'e1', characterId: 'c1', date: '2026-10-01', kind: 'income', amount: 100, currency: 'cash', category: '捉鬼' },
    { id: 'e2', characterId: 'c1', date: '2026-10-02', kind: 'expense', amount: 20, currency: 'cash', category: '点卡' },
    { id: 'q1', characterId: 'c1', date: '2026-10-02', kind: 'income', amount: 150, currency: 'cash', category: '物品掉落', source: 'quick', itemId: 8, note: '金刚石' },
    { id: 'q2', characterId: 'c1', date: '2026-10-02', kind: 'income', amount: 10, currency: 'cash', category: '物品掉落', source: 'quick', itemId: 99, note: '金币' },
    { id: 'g1', characterId: 'c1', date: '2026-10-02', kind: 'expense', amount: 620, currency: 'cash', category: '装备购入', note: '装备「测试刀」购入' },
    { id: 'g2', characterId: 'c2', date: '2026-10-02', ledger: 'account', kind: 'expense', amount: 100, currency: 'rmb', category: '点卡充值', fee: 2 },
    { id: 'g3', characterId: 'c1', date: '2026-10-02', ledger: 'account', kind: 'income', amount: 300, currency: 'rmb', category: '装备交易', fee: 15 }
  ], equipment: [{ id: 'eq', characterId: 'c1', name: '测试刀', status: 'active' }],
  gearLogs: [{ id: 'log', equipmentId: 'eq', characterId: 'c1', date: '2026-10-02', action: 'buy', amount: 620 }] };
}
test('旧数据按账本迁移，金额和原始备份对象不变，重复迁移幂等', () => {
  const D = domain(), original = fixture(), before = JSON.stringify(original);
  const first = D.normalize(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.transactions.find(t => t.id === 'g1').ledger, 'account');
  assert.equal(first.transactions.find(t => t.id === 'g1').amount, 620);
  assert.equal(first.transactions.find(t => t.id === 'q1').recordType, 'item');
  assert.equal(first.transactions.find(t => t.id === 'q2').recordType, 'money');
  assert.equal(first.transactions.find(t => t.id === 'g1').equipmentId, 'eq');
  assert.equal(first.gearLogs[0].transactionId, 'g1');
  assert.equal(JSON.stringify(D.normalize(first)), JSON.stringify(first));
});
test('实际收益、物品估值、人民币及梦幻币账号收支分别统计', () => {
  const D = domain(); D.state = D.normalize(fixture());
  const st = D.stats(D.earnings());
  assert.equal(st.income, 110); assert.equal(st.expense, 20); assert.equal(st.net, 90); assert.equal(st.itemEstimate, 150);
  const rmb = D.accountStats(D.accounts(), 'rmb');
  assert.equal(rmb.income, 285); assert.equal(rmb.expense, 102); assert.equal(rmb.net, 183);
  assert.equal(D.accountStats(D.accounts(), 'cash').expense, 620);
  assert.equal(D.txIn('c1', '2026-10-02', '2026-10-02').length, 3);
  assert.equal(D.txIn('c2', '', '', 'account').length, 1);
});
test('出售物品只按成交额计入收入，禁止重复出售，删除成交恢复持有', () => {
  const D = domain(); D.state = D.normalize(fixture());
  const item = D.state.transactions.find(t => t.id === 'q1');
  assert.throws(() => D.settleItem(item, { date: '2026-09-30', amount: 145 }));
  const sale = D.settleItem(item, { date: '2026-10-03', amount: 145 });
  assert.equal(D.stats(D.earnings()).income, 255);
  assert.equal(D.stats(D.earnings()).itemEstimate, 0);
  assert.throws(() => D.settleItem(item, { date: '2026-10-04', amount: 145 }));
  D.removeTransaction(sale.id);
  assert.equal(item.status, 'held'); assert.equal(D.stats(D.earnings()).income, 110);
  D.settleItem(item, { date: '2026-10-04', amount: 140 });
  D.removeTransaction(item.id);
  assert.equal(D.state.transactions.some(t => t.itemRecordId === item.id), false);
  assert.equal(D.stats(D.earnings()).income, 110);
});
test('装备双向关联不会重复记账，编辑替换时间线，删除收支恢复装备状态', () => {
  const D = domain(); D.state = D.normalize(fixture());
  const tx = { id: 'sale', equipmentId: 'eq', characterId: 'c1', ledger: 'account', recordType: 'money', date: '2026-10-10', kind: 'income', currency: 'rmb', amount: 400, fee: 20, createdAt: 2 };
  D.state.transactions.push(tx); D.syncAccountEquipment(tx);
  assert.equal(D.state.equipment[0].status, 'sold');
  tx.amount = 450; D.syncAccountEquipment(tx);
  assert.equal(D.state.gearLogs.filter(l => l.transactionId === tx.id).length, 1);
  assert.equal(D.state.gearLogs.find(l => l.transactionId === tx.id).amount, 450);
  D.removeTransaction(tx.id);
  assert.equal(D.state.equipment[0].status, 'active');
  assert.equal(D.state.gearLogs.some(l => l.transactionId === tx.id), false);
});
test('新备份往返保留物品结算关系、币种、手续费及装备关联', () => {
  const D = domain(); D.state = D.normalize(fixture());
  const item = D.state.transactions.find(t => t.id === 'q1');
  const sale = D.settleItem(item, { date: '2026-10-03', amount: 145 });
  D.state = D.normalize(JSON.parse(JSON.stringify(D.state)));
  assert.equal(D.state.transactions.find(t => t.id === item.id).saleId, sale.id);
  assert.equal(D.accountStats(D.accounts(), 'rmb').net, 183);
  D.removeTransaction(sale.id);
  assert.equal(D.stats(D.earnings()).itemEstimate, 150);
});
