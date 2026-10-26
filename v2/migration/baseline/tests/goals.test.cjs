'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const domain = require('./helpers/domain.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));
function fixture() {
  const D = domain();
  D.state = D.normalize({ characters: [
    { id: 'c1', name: '主号', school: '大唐官府', level: 109, progress: {
      auxiliarySkills: [{ name: '强身术', level: 150 }, { name: '冥想', level: 60 }], training: { attack: 17 },
      petTraining: { attack: 12 }, schoolSkills: [{ name: '为官之道', level: 119 }], qianyuanPills: 3, potentialFruits: 100,
    } },
    { id: 'c2', name: '小号', school: '龙宫', progress: { auxiliarySkills: [{ name: '强身术', level: 100 }] } },
    { id: 'c3', name: '新号' },
    { id: 'c4', name: '零值', progress: { auxiliarySkills: [{ name: '强身术', level: 0 }] } },
  ], transactions: [] });
  D.persist = async () => {};
  return D;
}
const strong = { characterId: 'all', type: 'progress', target: 120, tracking: { category: 'auxiliarySkills', key: '强身术' } };

test('全角色目标逐个封顶、未知与零值分开，角色筛选不改变全体计算且读取不写状态', async () => {
  const D = fixture();
  const goal = await D.saveGoal(strong);
  await D.saveGoal({ ...strong, characterId: 'c1' });
  await D.saveGoal({ ...strong, characterId: 'c2' });
  assert.equal(goal.title, '全部角色 · 强身术达到 120级');
  assert.equal(goal.unit, '级');
  const snapshot = JSON.stringify(D.state);
  D.setCharFilter('c1');
  const summary = D.goalSummary(goal);
  assert.equal(summary.achieved, 1); assert.equal(summary.unknown, 1);
  assert.equal(summary.current, 220); assert.equal(summary.target, 480); assert.equal(summary.pct, 46);
  assert.equal(summary.status, 'active');
  assert.equal(summary.members.find((member) => member.id === 'c3').value, null);
  assert.equal(summary.members.find((member) => member.id === 'c4').value, 0);
  assert.equal(D.goalsFor().length, 2);
  D.setCharFilter('c3'); assert.equal(D.goalsFor().length, 1);
  assert.equal(D.goalSummary(goal).members.length, 4);
  assert.equal(JSON.stringify(D.state), snapshot);
});

test('档案修改自动达成、清空或调低自动恢复，未全部达标不会四舍五入为 100%', async () => {
  const D = fixture();
  const goal = await D.saveGoal({ ...strong, characterId: 'c2' });
  await D.saveCharacterProgress('c2', { auxiliarySkills: [{ name: '强身术', level: 120 }] });
  assert.equal(D.goalSummary(goal).status, 'done');
  await D.saveCharacterProgress('c2', { auxiliarySkills: [{ name: '强身术', level: null }] });
  assert.equal(D.goalSummary(goal).status, 'active'); assert.equal(D.goalSummary(goal).unknown, 1);
  const near = await D.saveGoal({ ...strong, characterId: 'c1', target: 1000 });
  await D.saveGoalGrowth(near.id, { c1: 999 });
  assert.equal(D.goalSummary(near).pct, 99);
  await assert.rejects(D.setGoalStatus(goal.id, 'done'), /自动/);
  await assert.rejects(D.saveGoalProgress(goal.id, { delta: 1, date: '2026-01-01' }), /养成进度/);
  await assert.rejects(D.removeGoalProgress(goal.id, 'x'), /养成记录/);
});

test('目标页批量更新绝对值，同时保存原有档案与养成记录，不产生双份手动进度', async () => {
  const D = fixture(), goal = await D.saveGoal(strong);
  const before = plain(D.charById('c1').progress);
  const count = await D.saveGoalGrowth(goal.id, { c1: 150, c2: 120, c3: 120, c4: 120 }, { date: '2026-01-02', note: '统一补强身' });
  assert.equal(count, 3); assert.equal(D.goalSummary(goal).status, 'done');
  assert.deepEqual(plain(D.charById('c1').progress), before);
  assert.equal(goal.logs.length, 0); assert.equal(D.charById('c1').growthHistory.length, 0);
  assert.equal(D.goalGrowthHistory(goal).length, 3);
  for (const entry of D.goalGrowthHistory(goal)) {
    assert.equal(entry.date, '2026-01-02'); assert.equal(entry.note, '统一补强身');
    assert.equal(entry.change.to, 120); assert.equal(entry.change.group, '辅助技能');
  }
  await D.saveGoalGrowth(goal.id, { c2: '' });
  assert.equal(D.goalSummary(goal).unknown, 1);
  assert.equal(D.goalSummary(goal).status, 'active');
  await assert.rejects(D.saveGoalGrowth(goal.id, { c1: 150 }), /没有需要更新/);
  await D.removeGoal(goal.id);
  assert.equal(D.charById('c2').growthHistory.length, 2);
});

test('批量后续角色校验失败或落盘失败整体回滚，重试不会重复养成历史', async () => {
  const D = fixture(), goal = await D.saveGoal(strong);
  const snapshot = JSON.stringify(D.state);
  await assert.rejects(D.saveGoalGrowth(goal.id, { c2: 120, c3: 120.5 }), /整数/);
  assert.equal(JSON.stringify(D.state), snapshot);
  await assert.rejects(D.saveGoalGrowth(goal.id, { c2: 120, missing: 120 }), /角色已变更/);
  assert.equal(JSON.stringify(D.state), snapshot);
  await assert.rejects(D.saveGoalGrowth(goal.id, { c2: 120 }, { date: '2099-01-01' }), /晚于今天/);
  assert.equal(JSON.stringify(D.state), snapshot);
  D.persist = async () => { throw new Error('写入失败'); };
  await assert.rejects(D.saveGoalGrowth(goal.id, { c2: 120, c3: 120 }), /写入失败/);
  assert.equal(JSON.stringify(D.state), snapshot);
  D.persist = async () => {};
  await D.saveGoalGrowth(goal.id, { c2: 120, c3: 120 });
  assert.equal(D.goalGrowthHistory(goal).length, 2);
});

test('等级、师门、两类修炼与数量目标只更新对应项目，历史按项目筛选', async () => {
  const D = fixture();
  for (const [category, key, target] of [
    ['level', '', 129], ['schoolSkills', '为官之道', 130], ['training', 'attack', 20],
    ['petTraining', 'attack', 18], ['qianyuanPills', '', 6], ['potentialFruits', '', 150],
  ]) {
    const goal = await D.saveGoal({ characterId: 'c1', type: 'progress', target, tracking: { category, key } });
    await D.saveGoalGrowth(goal.id, { c1: target });
    assert.equal(D.goalSummary(goal).status, 'done', category);
    assert.equal(D.goalGrowthHistory(goal).length, 1, category);
  }
  assert.equal(D.charById('c1').progress.training.attack, 20);
  assert.equal(D.charById('c1').progress.petTraining.attack, 18);
  assert.equal(D.charById('c1').progress.auxiliarySkills[1].level, 60);
  assert.equal(D.charById('c1').school, '大唐官府');
});

test('全体目标动态包含新增角色，删除角色后重新计算；没有成员时不会误判达成', async () => {
  const D = fixture(), goal = await D.saveGoal(strong);
  await D.saveGoalGrowth(goal.id, { c2: 120, c3: 120, c4: 120 });
  assert.equal(D.goalSummary(goal).status, 'done');
  const created = await D.saveCharacter({ name: '新建角色' });
  assert.equal(D.goalSummary(goal).members.length, 5);
  assert.equal(D.goalSummary(goal).status, 'active');
  await D.removeCharacter(created.id);
  assert.equal(D.goalSummary(goal).status, 'done');
  for (const id of ['c1', 'c2', 'c3', 'c4']) await D.removeCharacter(id);
  assert.equal(D.state.goals.length, 1);
  assert.equal(D.goalSummary(goal).status, 'active'); assert.equal(D.goalSummary(goal).pct, 0);
});

test('全体存钱共同累计，不乘角色数；小数进度与记录编辑删除继续生效', async () => {
  const D = fixture();
  const goal = await D.saveGoal({ characterId: 'all', type: 'money', target: 1000, unit: '万' });
  const log = await D.saveGoalProgress(goal.id, { date: '2026-01-01', delta: 250.5 });
  assert.equal(D.goalSummary(goal).pct, 25); assert.equal(D.goalSummary(goal).target, 1000);
  assert.equal(D.goalsFor('c3').length, 1);
  await D.saveGoalProgress(goal.id, { date: '2026-01-01', delta: 500 }, log.id);
  assert.equal(D.goalSummary(goal).pct, 50);
  await D.removeGoalProgress(goal.id, log.id); assert.equal(goal.current, 0);
});

test('目标边界拒绝无效范围、零目标、小数养成和错误日期，备份深拷贝保留跟随配置', async () => {
  const D = fixture();
  for (const input of [
    { ...strong, characterId: 'missing' }, { ...strong, target: 0 }, { ...strong, target: 1.5 },
    { ...strong, target: Infinity }, { ...strong, deadline: '2026-02-30' },
    { ...strong, tracking: { category: 'training', key: 'missing' } },
    { ...strong, tracking: { category: 'auxiliarySkills', key: '' } },
  ]) await assert.rejects(D.saveGoal(input));
  const goal = await D.saveGoal(strong);
  const source = plain(D.state), snapshot = JSON.stringify(source);
  const restored = D.normalize(source);
  assert.equal(JSON.stringify(source), snapshot);
  assert.deepEqual(plain(restored), plain(D.state));
  restored.goals[0].tracking.key = '冥想';
  assert.equal(goal.tracking.key, '强身术');
});

test('目标自由拖动顺序保存，编辑不重排，新目标在首位', async () => {
  const D = fixture(), a = await D.saveGoal({ ...strong, title: 'A' });
  const b = await D.saveGoal({ ...strong, title: 'B' }), c = await D.saveGoal({ ...strong, title: 'C' });
  const order = () => D.orderedGoals().map((goal) => goal.title).join('');
  assert.equal(order(), 'CBA');
  await D.saveGoalOrder(a.id, { targetId: c.id, position: 'before' }); assert.equal(order(), 'ACB');
  await D.saveGoalOrder(b.id, { targetId: a.id, position: 'before' }); assert.equal(order(), 'BAC');
  await D.saveGoalOrder(a.id, { targetId: b.id, position: 'before' }); assert.equal(order(), 'ABC');
  await D.saveGoalOrder(c.id, { targetId: a.id, position: 'after' }); assert.equal(order(), 'ACB');
  await D.saveGoal({ ...strong, title: 'A' }, a.id); assert.equal(order(), 'ACB');
  await D.saveGoal({ ...strong, title: 'D' }); assert.equal(order(), 'DACB');
  assert.equal(D.goalSummary(a).achieved, 1); assert.equal(D.goalGrowthHistory(a).length, 0);
  const restored = D.normalize(plain(D.state));
  assert.equal(D.orderedGoals(restored.goals).map((goal) => goal.title).join(''), 'DACB');
});

test('筛选及自动排序拖动保留隐藏目标的相对顺序，异常位置和落盘失败整体回滚', async () => {
  const D = fixture(), a = await D.saveGoal({ ...strong, title: 'A' });
  const hidden = await D.saveGoal({ ...strong, title: 'H', characterId: 'c2' });
  const b = await D.saveGoal({ ...strong, title: 'B' }), c = await D.saveGoal({ ...strong, title: 'C' });
  await D.saveGoalOrder(c.id, { targetId: a.id, position: 'after', visibleIds: [a.id, b.id, c.id] });
  assert.equal(D.orderedGoals().map((goal) => goal.title).join(''), 'ACBH');
  const snapshot = JSON.stringify(D.state);
  for (const changes of [
    { targetId: c.id, position: 'before' }, { targetId: 'missing', position: 'before' }, { targetId: a.id, position: 'invalid' },
    { targetId: a.id, position: 'after', visibleIds: [a.id, a.id, c.id] },
    { targetId: a.id, position: 'after', visibleIds: [a.id, 'missing', c.id] },
  ]) {
    await assert.rejects(D.saveGoalOrder(c.id, changes));
    assert.equal(JSON.stringify(D.state), snapshot);
  }
  D.persist = async () => { throw new Error('排序写入失败'); };
  await assert.rejects(D.saveGoalOrder(c.id, { targetId: a.id, position: 'before' }), /写入失败/);
  assert.equal(JSON.stringify(D.state), snapshot);
  D.persist = async () => {};
  await D.saveGoalOrder(c.id, { targetId: a.id, position: 'before' });
  assert.equal(D.orderedGoals().map(goal => goal.title).join(''), 'CABH');
  assert.equal(D.state.goals.find((goal) => goal.id === hidden.id).characterId, 'c2');
});
