'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const createDomain = require('./helpers/domain.cjs');
function domain() {
  const D = createDomain();
  D.state = D.normalize({ schemaVersion: 4, characters: [{ id: 'c1', name: '轻舟', level: 109 }, { id: 'c2', name: '山月' }],
    equipment: [{ id: 'sword', characterId: 'c1', slot: '武器', name: '测试刀', status: 'stored' }] });
  D.persist = async () => {};
  return D;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('旧角色养成为空，未知等级与明确录入的 0 分开，归一化不修改输入', () => {
  const D = domain();
  assert.equal(D.charById('c1').progress.training.attack, null);
  assert.equal(D.charById('c1').progress.qianyuanPills, null);
  const original = { schemaVersion: 4, characters: [{ id: 'c3', name: '空档案', progress: {
    schoolSkills: [{ name: ' 技能一 ', level: '0' }, { name: '', level: 1 }, { name: '未知', level: -1 }],
    auxiliarySkills: '旧错误数据', training: { attack: 0, magic: 1.2, defense: true }, qianyuanPills: '', potentialFruits: 0,
  } }] };
  const snapshot = JSON.stringify(original);
  const state = D.normalize(original);
  assert.equal(JSON.stringify(original), snapshot);
  const progress = state.characters[0].progress;
  assert.deepEqual(plain(progress.schoolSkills), [{ name: '技能一', level: 0 }, { name: '未知', level: null }]);
  assert.deepEqual(plain(progress.auxiliarySkills), []);
  assert.equal(progress.training.attack, 0); assert.equal(progress.training.magic, null); assert.equal(progress.training.defense, null);
  assert.equal(progress.qianyuanPills, null); assert.equal(progress.potentialFruits, 0);
  assert.deepEqual(plain(D.normalize(state)), plain(state));
});

test('技能、人物与召唤兽修炼、养成数量独立保存，备份往返完整保留', async () => {
  const D = domain();
  const other = JSON.stringify(D.charById('c2'));
  const input = { schoolSkills: [{ name: '为官之道', level: 119 }, { name: '未点技能', level: '' }],
    auxiliarySkills: [{ name: '自定义辅助技能', level: 0 }], training: { attack: 17, hunting: 0 },
    petTraining: { attack: 15, resistance: 10 }, qianyuanPills: 3, potentialFruits: 100, note: '经脉：浴血豪侠\n坐骑成长 2.3' };
  await D.saveCharacterProgress('c1', input);
  input.schoolSkills[0].level = 999;
  assert.equal(D.charById('c1').progress.schoolSkills[0].level, 119);
  assert.equal(D.charById('c1').progress.schoolSkills[1].level, null);
  assert.equal(D.charById('c1').progress.auxiliarySkills[0].level, 0);
  assert.equal(D.charById('c1').progress.training.attack, 17);
  assert.equal(D.charById('c1').progress.petTraining.attack, 15);
  assert.equal(JSON.stringify(D.charById('c2')), other);
  await D.saveCharacterProgress('c1', { qianyuanPills: 0, potentialFruits: '' });
  assert.equal(D.charById('c1').progress.qianyuanPills, 0);
  assert.equal(D.charById('c1').progress.potentialFruits, null);
  assert.equal(D.charById('c1').progress.schoolSkills.length, 2);
  const backup = plain(D.state);
  assert.deepEqual(plain(D.normalize(backup)), backup);
});

test('角色编辑保留养成、装备方案及修炼，技能清空只影响本角色本分区', async () => {
  const D = domain();
  D.assignEquipment('c1', 0, '武器', 'sword');
  await D.saveCharacterProgress('c1', { schoolSkills: [{ name: '为官之道', level: 119 }], auxiliarySkills: [{ name: '强身术', level: 120 }] });
  await D.saveCharacter({ name: ' 新昵称 ', level: 129, school: '大唐官府', server: '紫禁城' }, 'c1');
  assert.equal(D.charById('c1').name, '新昵称');
  assert.equal(D.charById('c1').equipmentSets[0].slots['武器'], 'sword');
  assert.equal(D.charById('c1').progress.schoolSkills[0].level, 119);
  await D.saveCharacterProgress('c1', { schoolSkills: [] });
  assert.equal(D.charById('c1').progress.schoolSkills.length, 0);
  assert.equal(D.charById('c1').progress.auxiliarySkills[0].name, '强身术');
  const created = await D.saveCharacter({ name: '新角色', level: '', school: '普陀山' });
  assert.equal(created.level, null); assert.equal(created.equipmentSets.length, 3);
});

test('拒绝负数、小数、重复或空技能名，不改变原档案', async () => {
  const D = domain();
  const snapshot = JSON.stringify(D.state);
  for (const changes of [
    { schoolSkills: [{ name: '', level: 1 }] }, { auxiliarySkills: [{ name: '强身术', level: -1 }] },
    { schoolSkills: [{ name: '同名', level: 1 }, { name: ' 同名 ', level: 2 }] },
    { training: { attack: 1.5 } }, { petTraining: { attack: true } },
    { potentialFruits: -1 }, { qianyuanPills: Infinity }, { qianyuanPills: Number.MAX_SAFE_INTEGER + 1 }, { unknown: 1 },
  ]) {
    await assert.rejects(D.saveCharacterProgress('c1', changes));
    assert.equal(JSON.stringify(D.state), snapshot);
  }
  await assert.rejects(D.saveCharacter({ name: '  ' }, 'c1'), /昵称/);
  await assert.rejects(D.saveCharacter({ level: 1.5 }, 'c1'), /整数/);
  await assert.rejects(D.saveCharacterProgress('missing', { qianyuanPills: 1 }), /不存在/);
});

test('角色新建和养成保存写入失败回滚，重试不重复新建或丢失其他分区', async () => {
  const D = domain();
  const snapshot = JSON.stringify(D.state);
  D.persist = async () => { throw new Error('模拟写入失败'); };
  await assert.rejects(D.saveCharacter({ name: '重试角色' }), /写入失败/);
  await assert.rejects(D.saveCharacterProgress('c1', { qianyuanPills: 3 }), /写入失败/);
  assert.equal(JSON.stringify(D.state), snapshot);
  D.persist = async () => {};
  await D.saveCharacter({ name: '重试角色' });
  await D.saveCharacterProgress('c1', { qianyuanPills: 3 });
  assert.equal(D.state.characters.filter((character) => character.name === '重试角色').length, 1);
  assert.equal(D.charById('c1').progress.qianyuanPills, 3);
});

test('删除角色失败恢复全部关联，成功删除仅清理该角色与未结束计时', async () => {
  const D = domain();
  D.state.transactions = [{ id: 't1', characterId: 'c1' }, { id: 't2', characterId: 'c2' }];
  D.state.sessions = [{ id: 's1', characterId: 'c1' }];
  D.state.goals = [{ id: 'g1', characterId: 'c1' }];
  D.state.gearLogs = [{ id: 'l1', equipmentId: 'sword', characterId: 'c1' }];
  D.state.activeSession = { id: 'active', characterId: 'c1' };
  const snapshot = JSON.stringify(D.state);
  D.persist = async () => { throw new Error('模拟删除失败'); };
  await assert.rejects(D.removeCharacter('c1'), /删除失败/);
  assert.equal(JSON.stringify(D.state), snapshot);
  D.persist = async () => {};
  await D.removeCharacter('c1');
  assert.equal(D.state.characters.length, 1); assert.equal(D.state.characters[0].id, 'c2');
  assert.equal(D.state.transactions.length, 1); assert.equal(D.state.transactions[0].id, 't2');
  for (const key of ['equipment', 'gearLogs', 'sessions', 'goals']) assert.equal(D.state[key].length, 0);
  assert.equal(D.state.activeSession, null);
});

test('统一档案一次保存基础与全部养成，非法数据和写入失败均整体回滚', async () => {
  const D = domain();
  const before = JSON.stringify(D.state);
  const data = { name: '统一编辑', level: 129, school: '大唐官府', server: '紫禁城', progress: {
    schoolSkills: [{ name: '为官之道', level: 139 }], auxiliarySkills: [{ name: '强身术', level: 0 }],
    training: { attack: 17 }, petTraining: { attack: 15 }, qianyuanPills: 3, potentialFruits: 100, note: '完整档案',
  } };
  await assert.rejects(D.saveCharacter({ ...data, progress: { ...data.progress, potentialFruits: -1 } }, 'c1'), /整数/);
  assert.equal(JSON.stringify(D.state), before);
  D.persist = async () => { throw new Error('写入失败'); };
  await assert.rejects(D.saveCharacter(data, 'c1'), /写入失败/);
  assert.equal(JSON.stringify(D.state), before);
  let writes = 0;
  D.persist = async () => { writes++; };
  await D.saveCharacter(data, 'c1');
  assert.equal(writes, 1);
  assert.equal(D.charById('c1').name, '统一编辑');
  assert.equal(D.charById('c1').progress.schoolSkills[0].level, 139);
  assert.equal(D.charById('c1').progress.auxiliarySkills[0].level, 0);
  assert.equal(D.charById('c1').progress.petTraining.attack, 15);
  assert.equal(D.charById('c1').progress.potentialFruits, 100);
});

test('旧顺序保持，新角色加入普通组首位，置顶和组内排序在备份恢复后保留', async () => {
  const D = domain();
  D.charById('c1').createdAt = 1; D.charById('c2').createdAt = 2;
  const ids = () => D.orderedCharacters().map((item) => item.id).join(',');
  assert.equal(ids(), 'c2,c1');
  const third = await D.saveCharacter({ name: '第三位' });
  assert.equal(ids(), third.id + ',c2,c1');
  await D.saveCharacterOrder('c1', { pinned: true });
  await D.saveCharacterOrder('c2', { pinned: true });
  assert.equal(ids(), 'c2,c1,' + third.id);
  await D.saveCharacterOrder('c1', { position: 0 });
  assert.equal(ids(), 'c1,c2,' + third.id);
  await D.saveCharacter({ name: '改名' }, 'c2');
  assert.equal(ids(), 'c1,c2,' + third.id);
  D.state = D.normalize(plain(D.state));
  assert.equal(ids(), 'c1,c2,' + third.id);
  await D.saveCharacterOrder('c1', { pinned: false });
  assert.equal(ids(), 'c2,c1,' + third.id);
  await D.saveCharacterOrder('c1', { position: 1 });
  assert.equal(ids(), 'c2,' + third.id + ',c1');
  const fourth = await D.saveCharacter({ name: '第四位' });
  assert.equal(ids(), 'c2,' + fourth.id + ',' + third.id + ',c1');
  assert.deepEqual(plain(D.normalize(plain(D.state))), plain(D.state));
});

test('置顶排序校验及写入失败均恢复原顺序、档案和装备', async () => {
  const D = domain();
  const before = JSON.stringify(D.state);
  for (const change of [{ position: -1 }, { position: 2 }, { position: 0.5 }, { pinned: 'true' }]) {
    await assert.rejects(D.saveCharacterOrder('c1', change));
    assert.equal(JSON.stringify(D.state), before);
  }
  await assert.rejects(D.saveCharacterOrder('missing', { position: 0 }), /不存在/);
  D.persist = async () => { throw new Error('排序写入失败'); };
  await assert.rejects(D.saveCharacterOrder('c1', { pinned: true }), /排序写入失败/);
  assert.equal(JSON.stringify(D.state), before);
  D.persist = async () => {};
  await D.saveCharacterOrder('c1', { pinned: true });
  assert.equal(D.orderedCharacters()[0].id, 'c1');
  assert.equal(D.state.equipment[0].id, 'sword');
});

test('编辑与养成保存不执行新建角色的排序计算', async () => {
  const D = domain();
  D.orderedCharacters = () => { throw new Error('不应重排角色'); };
  await D.saveCharacter({ name: '更新昵称' }, 'c1');
  await D.saveCharacterProgress('c1', { qianyuanPills: 3 });
  assert.equal(D.charById('c1').progress.qianyuanPills, 3);
});

test('复制预览跳过未记录项，保留同名等级和目标独有技能，明确的零值正常复制', async () => {
  const D = domain();
  await D.saveCharacter({ school: '大唐官府', progress: { qianyuanPills: 3, potentialFruits: 100, note: '保留备注',
    training: { attack: 17, defense: 12 }, petTraining: { attack: 15 },
    schoolSkills: [{ name: '为官之道', level: 119 }, { name: '自定义', level: 0 }],
    auxiliarySkills: [{ name: '强身术', level: 120 }] } }, 'c1');
  await D.saveCharacter({ school: '大唐官府', progress: { potentialFruits: 0, training: { attack: 0 },
    schoolSkills: [{ name: '无双一击', level: 119 }, { name: '为官之道', level: '' }] } }, 'c2');
  const snapshot = JSON.stringify(D.state);
  const keys = ['qianyuanPills', 'potentialFruits', 'training', 'petTraining', 'schoolSkills', 'auxiliarySkills', 'note'];
  const changes = D.characterCopyChanges('c1', 'c2', keys, true);
  assert.equal(JSON.stringify(D.state), snapshot, '预览不修改数据');
  assert.equal(Object.hasOwn(changes, 'qianyuanPills'), false);
  assert.equal(Object.hasOwn(changes, 'note'), false);
  assert.equal(changes.potentialFruits, 0);
  assert.equal(changes.training.attack, 0); assert.equal(changes.training.defense, 12);
  assert.deepEqual(plain(changes.schoolSkills), [{ name: '无双一击', level: 119 }, { name: '为官之道', level: 119 }, { name: '自定义', level: 0 }]);
  await D.copyCharacterProgress('c1', 'c2', keys);
  assert.equal(D.charById('c1').progress.qianyuanPills, 3);
  assert.equal(D.charById('c1').progress.potentialFruits, 0);
  assert.equal(D.charById('c1').progress.petTraining.attack, 15);
  assert.equal(D.charById('c1').progress.auxiliarySkills[0].level, 120);
  assert.equal(D.charById('c1').progress.note, '保留备注');
});

test('完整覆盖支持清空，复制失败回滚，限制同门派且在提交时读取最新来源', async () => {
  const D = domain();
  await D.saveCharacter({ school: '大唐官府', progress: { qianyuanPills: 3, training: { attack: 17 } } }, 'c1');
  await D.saveCharacter({ school: '普陀山' }, 'c2');
  assert.throws(() => D.characterCopyChanges('c1', 'c2', ['schoolSkills'], true), /相同门派/);
  assert.throws(() => D.characterCopyChanges('c1', 'missing', ['training'], true), /不存在/);
  assert.throws(() => D.characterCopyChanges('c1', 'c1', ['training'], true), /其他来源/);
  assert.throws(() => D.characterCopyChanges('c1', 'c2', [], true), /选择/);
  await assert.rejects(D.copyCharacterProgress('c1', 'c2', ['qianyuanPills']), /没有可复制/);
  const before = JSON.stringify(D.state);
  D.persist = async () => { throw new Error('复制写入失败'); };
  await assert.rejects(D.copyCharacterProgress('c1', 'c2', ['qianyuanPills', 'training'], false), /复制写入失败/);
  assert.equal(JSON.stringify(D.state), before);
  D.persist = async () => {};
  await D.copyCharacterProgress('c1', 'c2', ['qianyuanPills', 'training'], false);
  assert.equal(D.charById('c1').progress.qianyuanPills, null);
  assert.equal(D.charById('c1').progress.training.attack, null);
  await D.saveCharacterProgress('c2', { qianyuanPills: 1 });
  const sourceUpdate = D.saveCharacterProgress('c2', { qianyuanPills: 2 });
  const copy = D.copyCharacterProgress('c1', 'c2', ['qianyuanPills']);
  await Promise.all([sourceUpdate, copy]);
  assert.equal(D.charById('c1').progress.qianyuanPills, 2);
});
