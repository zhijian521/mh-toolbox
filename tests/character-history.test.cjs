'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const createDomain = require('./helpers/domain.cjs');
const plain = (value) => JSON.parse(JSON.stringify(value));

async function domain() {
  const D = createDomain();
  D.state = D.normalize({});
  D.persist = async () => {};
  await D.saveCharacter({ name: '轻舟', level: 109, school: '大唐官府', progress: {
    schoolSkills: [{ name: '为官之道', level: 119 }, { name: '无双一击', level: null }],
    auxiliarySkills: [{ name: '强身术', level: 120 }], training: { attack: 17, magic: 0 },
    petTraining: { attack: 15 }, qianyuanPills: 3, potentialFruits: 100,
  } });
  await D.saveCharacter({ name: '山月', school: '大唐官府', progress: { qianyuanPills: 7 } });
  return D;
}

test('新建只建档，所有分区的实际变化保存成一次带日期说明的快照', async () => {
  const D = await domain(), character = D.state.characters[0];
  assert.equal(character.growthHistory.length, 0);
  const draft = { name: '轻舟', level: 129, school: '普陀山', progress: {
    schoolSkills: [{ name: '为官之道', level: 129 }, { name: '无双一击', level: 0 }, { name: '灵性', level: null }],
    auxiliarySkills: [], training: { attack: 20, magic: 0 }, petTraining: { attack: 16 }, qianyuanPills: 4, potentialFruits: 110,
  } };
  await D.saveCharacter(draft, character.id, { date: '2026-01-02', note: ' 周末提升 ' });
  const [entry] = D.charById(character.id).growthHistory;
  assert.equal(entry.date, '2026-01-02'); assert.equal(entry.note, '周末提升');
  assert.equal(entry.source, 'edit');
  const change = (group, label) => entry.changes.find((item) => item.group === group && item.label === label);
  assert.deepEqual(plain(change('基础信息', '等级')), { group: '基础信息', label: '等级', from: 109, to: 129, unit: '级', kind: 'increase' });
  assert.equal(change('基础信息', '门派').kind, 'changed');
  assert.equal(change('师门技能', '为官之道').kind, 'increase');
  assert.equal(change('师门技能', '无双一击').kind, 'recorded');
  assert.equal(change('师门技能', '无双一击').to, 0);
  assert.equal(change('师门技能', '灵性').kind, 'added');
  assert.equal(change('辅助技能', '强身术').kind, 'removed');
  assert.equal(change('人物修炼', '攻击修炼').from, 17);
  assert.equal(change('人物修炼', '法术修炼'), undefined);
  assert.equal(change('召唤兽修炼', '攻击控制力').to, 16);
  assert.equal(change('其他养成', '乾元丹').to, 4);
  assert.equal(change('其他养成', '潜能果').to, 110);
  draft.progress.schoolSkills[0].level = 999;
  assert.equal(change('师门技能', '为官之道').to, 129);
  assert.equal(D.state.characters[1].growthHistory.length, 0);
});

test('调低、清空和移除准确标注；新增未知技能与明确零值可区分', async () => {
  const D = await domain(), id = D.state.characters[0].id;
  await D.saveCharacterProgress(id, {
    schoolSkills: [{ name: '无双一击', level: null }, { name: '未点技能', level: 0 }],
    training: { attack: 0 }, qianyuanPills: '', potentialFruits: 90,
  });
  const changes = D.charById(id).growthHistory[0].changes;
  assert.equal(changes.find((item) => item.label === '为官之道').kind, 'removed');
  assert.equal(changes.find((item) => item.label === '未点技能').kind, 'added');
  assert.equal(changes.find((item) => item.label === '攻击修炼').kind, 'decrease');
  assert.equal(changes.find((item) => item.label === '攻击修炼').to, 0);
  assert.equal(changes.find((item) => item.label === '法术修炼').kind, 'cleared');
  assert.equal(changes.find((item) => item.label === '乾元丹').kind, 'cleared');
  assert.equal(changes.find((item) => item.label === '潜能果').kind, 'decrease');
  assert.equal(changes.some((item) => item.label === '无双一击'), false);
});

test('无变化、技能排序、备注、昵称、服务器及拖动排序不产生养成噪声', async () => {
  const D = await domain(), id = D.state.characters[0].id;
  await D.saveCharacter({ name: '新昵称', server: '紫禁城' }, id);
  await D.saveCharacterProgress(id, { note: '养成计划', schoolSkills: D.charById(id).progress.schoolSkills.slice().reverse() });
  const other = D.state.characters.find(character => character.id !== id).id;
  await D.saveCharacterOrder(id, { targetId: other, position: 'after' });
  await D.saveCharacterOrder(id, { targetId: other, position: 'before' });
  await D.saveCharacter({ progress: plain(D.charById(id).progress) }, id, { date: '2026-01-01', note: '只写说明' });
  assert.equal(D.charById(id).growthHistory.length, 0);
});

test('写入失败连同历史一起回滚，重试一次且串行保存读取最新原值', async () => {
  const D = await domain(), id = D.state.characters[0].id;
  const before = JSON.stringify(D.state);
  D.persist = async () => { throw new Error('模拟失败'); };
  await assert.rejects(D.saveCharacterProgress(id, { qianyuanPills: 4 }), /模拟失败/);
  assert.equal(JSON.stringify(D.state), before);
  D.persist = async () => {};
  await Promise.all([
    D.saveCharacterProgress(id, { qianyuanPills: 4 }), D.saveCharacterProgress(id, { qianyuanPills: 5 }),
  ]);
  const entries = D.charById(id).growthHistory;
  assert.deepEqual(plain(entries.map((entry) => [entry.changes[0].from, entry.changes[0].to])), [[3, 4], [4, 5]]);
  await D.saveCharacterProgress(id, { qianyuanPills: 5 });
  assert.equal(D.charById(id).growthHistory.length, 2);
});

test('无效或未来的变更日期拒绝整个提交，历史按实际日期筛选和排序', async () => {
  const D = await domain(), id = D.state.characters[0].id;
  const before = JSON.stringify(D.state);
  for (const date of ['', '2026-02-30', '2026-1-2', '2099-01-01']) {
    await assert.rejects(D.saveCharacter({ level: 129 }, id, { date }), /变更日期/);
    assert.equal(JSON.stringify(D.state), before);
  }
  await D.saveCharacterProgress(id, { qianyuanPills: 4 }, { date: '2026-01-05' });
  await D.saveCharacterProgress(id, { qianyuanPills: 5 }, { date: '2026-01-02' });
  assert.deepEqual(plain(D.characterGrowthHistory(id).map((entry) => entry.date)), ['2026-01-05', '2026-01-02']);
  assert.equal(D.characterGrowthHistory(id, { from: '2026-01-02', to: '2026-01-02' }).length, 1);
  assert.equal(D.characterGrowthHistory(id, { from: '2026-01-06' }).length, 0);
});

test('同毫秒的连续变更按最后保存优先，查询不改写历史保存顺序', async () => {
  const D = await domain(), id = D.state.characters[0].id;
  await D.saveCharacterProgress(id, { qianyuanPills: 4 });
  await D.saveCharacterProgress(id, { qianyuanPills: 5 });
  const history = D.charById(id).growthHistory;
  history[1].createdAt = history[0].createdAt;
  history[0].id = 'same-time-z'; history[1].id = 'same-time-a';
  const before = JSON.stringify(D.state);
  assert.deepEqual(plain(D.characterGrowthHistory(id).map((entry) => entry.changes[0].to)), [5, 4]);
  assert.equal(JSON.stringify(D.state), before);
});

test('备份中的非字符串与无效日历日期被过滤，有效记录保留且可查询', async () => {
  const D = await domain(), id = D.state.characters[0].id;
  await D.saveCharacterProgress(id, { qianyuanPills: 4 }, { date: '2026-01-02' });
  const backup = plain(D.state), character = backup.characters[0], valid = character.growthHistory[0];
  for (const [index, date] of [[0, ['2026-01-02']], [1, '2026-02-30'], [2, '2026-00-01']]) {
    character.growthHistory.push({ ...valid, id: 'invalid-' + index, date });
  }
  const before = JSON.stringify(backup);
  D.state = D.normalize(backup);
  assert.equal(JSON.stringify(backup), before);
  assert.equal(D.charById(id).growthHistory.length, 1);
  assert.equal(D.characterGrowthHistory(id)[0].date, '2026-01-02');
});

test('旧复制记录在载入后保留独立快照及来源名称，之后修改不改写旧记录', async () => {
  const D = await domain(), [target, source] = D.state.characters;
  await D.saveCharacterProgress(source.id, { qianyuanPills: 8 });
  const backup = plain(D.state), legacy = backup.characters.find((character) => character.id === target.id);
  legacy.progress.qianyuanPills = 8;
  legacy.growthHistory = [{ id: 'legacy-copy', date: '2026-01-02', createdAt: 1, source: 'copy', sourceName: '山月', note: '',
    changes: [{ group: '其他养成', label: '乾元丹', from: 3, to: 8, unit: '个', kind: 'increase' }] }];
  D.state = D.normalize(backup);
  const entry = D.charById(target.id).growthHistory[0];
  assert.equal(entry.source, 'copy'); assert.equal(entry.sourceName, '山月');
  assert.equal(entry.changes[0].from, 3); assert.equal(entry.changes[0].to, 8);
  const snapshot = JSON.stringify(entry);
  await D.saveCharacter({ name: '改名后' }, source.id);
  await D.saveCharacterProgress(target.id, { qianyuanPills: 9 });
  assert.equal(JSON.stringify(D.charById(target.id).growthHistory[0]), snapshot);
  assert.equal(D.charById(source.id).growthHistory.length, 1);
});

test('历史随备份深拷贝往返，删除角色只删除本角色历史且失败整体恢复', async () => {
  const D = await domain(), [target, source] = D.state.characters;
  await D.saveCharacterProgress(target.id, { qianyuanPills: 4 });
  await D.saveCharacterProgress(source.id, { qianyuanPills: 8 });
  const backup = plain(D.state), normalized = D.normalize(backup);
  assert.deepEqual(plain(normalized), backup);
  normalized.characters[0].growthHistory[0].changes[0].to = 999;
  assert.equal(backup.characters[0].growthHistory[0].changes[0].to, 4);
  const before = JSON.stringify(D.state);
  D.persist = async () => { throw new Error('删除失败'); };
  await assert.rejects(D.removeCharacter(target.id), /删除失败/);
  assert.equal(JSON.stringify(D.state), before);
  D.persist = async () => {};
  await D.removeCharacter(target.id);
  assert.equal(D.characterGrowthHistory().length, 1);
  assert.equal(D.characterGrowthHistory()[0].characterId, source.id);
});
