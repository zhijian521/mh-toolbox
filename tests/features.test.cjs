'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('./helpers/domain.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const D = domain();
  D.state = D.normalize({ characters: [{ id: 'c1', name: '主号', school: '大唐官府' }, { id: 'c2', name: '小号', school: '大唐官府' }], transactions: [] });
  D.persist = async () => {};
  return D;
}
const loot = { ledger: 'earnings', recordType: 'item', kind: 'income', characterId: 'c1', date: '2026-01-01',
  currency: 'cash', category: '物品掉落', itemName: '宝石', quantity: 10, unitPrice: 5, status: 'held' };

test('分次出售、超卖校验、成交编辑和删除保持库存与实际收益一致', async () => {
  const D = fixture();
  const item = await D.saveTransaction(loot);
  const first = await D.commit(() => D.settleItem(item, { date: '2026-01-02', amount: 18, quantity: 4 }));
  assert.equal(D.itemRemaining(item), 6);
  assert.equal(D.stats(D.earnings()).itemEstimate, 30);
  assert.equal(D.stats(D.earnings()).income, 18);
  const second = await D.commit(() => D.settleItem(item, { date: '2026-01-03', amount: 30, quantity: 6 }));
  assert.equal(item.status, 'sold');
  await assert.rejects(D.commit(() => D.settleItem(item, { date: '2026-01-04', amount: 1, quantity: 1 })), /重复/);
  await D.saveTransaction({ saleQuantity: 2, amount: 9 }, first.id);
  let current = D.state.transactions.find((tx) => tx.id === item.id);
  assert.equal(D.itemRemaining(current), 2);
  assert.equal(current.status, 'held');
  await assert.rejects(D.saveTransaction({ quantity: 7 }, current.id), /少于/);
  await assert.rejects(D.saveTransaction({ saleQuantity: 5 }, first.id), /可出售/);
  await D.commit(() => D.removeTransaction(second.id));
  current = D.state.transactions.find((tx) => tx.id === item.id);
  assert.equal(D.itemRemaining(current), 8);
  assert.equal(D.stats(D.earnings()).income, 9);
  await D.commit(() => D.removeTransaction(item.id));
  assert.equal(D.state.transactions.length, 0);
});

test('旧整单出售迁移保留金额，增加获得数量后释放库存，序列化往返幂等', () => {
  const D = fixture();
  const input = { schemaVersion: 4, characters: [{ id: 'c1', name: '主号' }], transactions: [
    { ...loot, id: 'item', status: 'sold', saleId: 'sale' },
    { id: 'sale', ledger: 'earnings', recordType: 'money', kind: 'income', currency: 'cash', characterId: 'c1',
      itemRecordId: 'item', date: '2026-01-02', amount: 49 },
  ] };
  const snapshot = JSON.stringify(input);
  D.state = D.normalize(input);
  assert.equal(JSON.stringify(input), snapshot);
  assert.equal(D.state.transactions[1].saleQuantity, 10);
  assert.equal(D.stats(D.earnings()).income, 49);
  assert.equal(D.itemRemaining(D.state.transactions[0]), 0);
  assert.deepEqual(plain(D.normalize(D.state)), plain(D.state));
});

test('串行提交中首次保存失败会回滚，排队写入继续读取正确状态，重试不重复成交', async () => {
  const D = fixture();
  const item = await D.saveTransaction(loot);
  let calls = 0;
  D.persist = async () => { if (++calls === 1) throw new Error('磁盘写入失败'); };
  const results = await Promise.allSettled([
    D.commit(() => D.settleItem(item, { date: '2026-01-02', amount: 10, quantity: 3 })),
    D.commit(() => D.settleItem(item, { date: '2026-01-02', amount: 20, quantity: 4 })),
  ]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[1].status, 'fulfilled');
  assert.equal(D.itemRemaining(D.state.transactions[0]), 6);
  assert.equal(D.state.transactions.length, 2);
  await D.commit(() => D.settleItem(item, { date: '2026-01-02', amount: 10, quantity: 3 }));
  assert.equal(D.itemRemaining(D.state.transactions[0]), 3);
});

test('目标历史编辑、删除保留旧基础进度，完成日期独立，失败可重试', async () => {
  const D = fixture();
  D.state.goals = D.normalize({ goals: [{ id: 'g', characterId: 'c1', title: '修炼', target: 20, current: 12,
    unit: '级', status: 'active', logs: [{ id: 'old', date: '2026-01-01', delta: 2 }] }] }).goals;
  const goal = () => D.state.goals[0];
  assert.equal(goal().baseProgress, 10);
  const entry = await D.saveGoalProgress('g', { date: '2026-01-02', delta: 3.5, note: '补记' });
  assert.equal(goal().current, 15.5);
  await D.saveGoalProgress('g', { date: '2026-01-02', delta: 4.5 }, entry.id);
  assert.equal(goal().current, 16.5);
  await D.removeGoalProgress('g', 'old');
  assert.equal(goal().current, 14.5);
  const snapshot = JSON.stringify(D.state);
  D.persist = async () => { throw new Error('失败'); };
  await assert.rejects(D.saveGoalProgress('g', { date: '2026-01-03', delta: 1 }), /失败/);
  assert.equal(JSON.stringify(D.state), snapshot);
  D.persist = async () => {};
  await D.setGoalStatus('g', 'done');
  assert.equal(goal().current, 20); assert.match(goal().doneAt, /^\d{4}-\d{2}-\d{2}$/);
  const done = goal().logs.at(-1);
  await D.removeGoalProgress('g', done.id);
  assert.equal(goal().status, 'active'); assert.equal(goal().doneAt, undefined);
  await assert.rejects(D.saveGoalProgress('g', { date: '2026-02-30', delta: 1 }));
  await D.saveGoalProgress('g', { date: '2026-01-03', delta: -99 });
  assert.equal(goal().current, 0);
  const created = await D.saveGoal({ characterId: 'c2', title: ' 新目标 ', target: 10, unit: '个' });
  assert.equal(created.title, '新目标');
  await D.removeGoal(created.id); assert.equal(D.state.goals.length, 1);
});

test('门派模板保留自定义技能与 0 等级，复制配置不共享数组引用', async () => {
  const D = fixture();
  for (const school of D.schools.filter((name) => name !== '其他')) assert.equal(D.schoolSkillNames[school].length, 7, school);
  const filled = D.fillSchoolSkills('大唐官府', [{ name: '为官之道', level: 0 }, { name: '自定义', level: 20 }]);
  assert.equal(filled.length, 8); assert.equal(filled[0].level, 0);
  assert.equal(filled.at(-1).level, null);
  assert.equal(D.fillSchoolSkills('大唐官府', filled).length, 8);
  await D.saveCharacterProgress('c1', { schoolSkills: filled });
  await D.saveCharacterProgress('c2', { schoolSkills: D.charById('c1').progress.schoolSkills });
  D.charById('c1').progress.schoolSkills[0].level = 150;
  assert.equal(D.charById('c2').progress.schoolSkills[0].level, 0);
});

test('备份边界拒绝单价文件和未来版本；替换失败保留活动计时，成功携带覆盖前备份选项', async () => {
  const D = fixture();
  D.state.activeSession = { id: 'active', characterId: 'c1', startAt: Date.now() };
  const snapshot = JSON.stringify(D.state);
  for (const invalid of [{ 1: 1000 }, { schemaVersion: 99, characters: [], transactions: [] },
    { characters: [{ id: 'a' }, { id: 'a' }], transactions: [] }]) await assert.rejects(D.replaceState(invalid));
  assert.equal(JSON.stringify(D.state), snapshot);
  D.persist = async () => { throw new Error('保存失败'); };
  await assert.rejects(D.replaceState({ characters: [], transactions: [] }));
  assert.equal(JSON.stringify(D.state), snapshot);
  let options;
  D.persist = async (value) => { options = value; };
  await D.replaceState({ characters: [], transactions: [] });
  assert.equal(D.state.activeSession, null); assert.equal(options.backupReason, 'import');
});

test('CSV 包含 BOM、单位、引号换行与公式防护，物品按剩余库存导出', async () => {
  const D = fixture();
  D.charById('c1').name = '=SUM(A1:A2)';
  const item = await D.saveTransaction({ ...loot, note: '文字,"引号"\n第二行' });
  await D.commit(() => D.settleItem(item, { date: '2026-01-02', amount: 6, quantity: 2 }));
  const csv = D.recordsCsv(D.state.transactions);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"梦幻币（万）"'));
  assert.ok(csv.includes('"\'=SUM(A1:A2)"'));
  assert.ok(csv.includes('"文字,""引号""\n第二行"'));
  assert.ok(csv.includes('"10","8","","5","40"'));
});

test('活动在线汇总不修改缓存值；角色及日期筛选生效', async () => {
  const D = fixture();
  await D.startSession('c1');
  D.state.activeSession.startAt -= 3600000;
  const settled = D.earningsStats('all', '', '');
  const snapshot = JSON.stringify(settled);
  const active = D.includeActiveEarnings(settled, 'all', '', '');
  assert.equal(JSON.stringify(settled), snapshot);
  assert.ok(active.onlineMinutes >= 60 && active.cardCost > 0);
  assert.equal(D.includeActiveEarnings(settled, 'c2', '', '').onlineMinutes, 0);
  assert.equal(D.includeActiveEarnings(settled, 'all', '', '2000-01-01').onlineMinutes, 0);
});
