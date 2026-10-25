'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const createDomain = require('./helpers/domain.cjs');

function domain() {
  const D = createDomain();
  D.state = D.normalize({ characters: [{ id: 'c1', name: '轻舟' }, { id: 'c2', name: '小号' }], equipment: [] });
  D.persist = async () => {};
  return D;
}
const weapon = '霜冷九州\n等级 120\n伤害 ＋520 命中 ＋600\n力量 +24\n敏捷 +20\n耐久度 420\n特技：破血狂攻\n特效：永不磨损\n锻炼等级 8\n镶嵌宝石 红玛瑙';
const jadeText = '上古玉魄·阳\n基础属性：伤害 +15\n附加属性：伤害 +8\n附加属性：物理暴击等级 +10\n灵尘总等级 8\n开光孔数 2\n孔一：野兽之力\n孔二：放下屠刀\n耐久 280/300';

test('截图文字保留原文与换行，识别全角符号、中文间距和重复属性，不推算数值', () => {
  const D = domain();
  const draft = D.parseEquipmentText(weapon);
  assert.equal(draft.name, '霜冷九州'); assert.equal(draft.slot, '武器'); assert.equal(draft.level, 120);
  assert.equal(draft.attributes, '伤害 +520 命中 +600\n力量 +24\n敏捷 +20');
  assert.equal(draft.special, '特技:破血狂攻\n特效:永不磨损');
  assert.match(draft.gems, /红玛瑙/); assert.match(draft.note, /耐久 420/); assert.equal(draft.ocrText, weapon);
  const ring = D.parseEquipmentText('名 称：九曜光华\n类 型：戒 指\n【等级】100\n伤害 +20\n伤害 +12\n伤害 +12');
  assert.equal(ring.name, '九曜光华'); assert.equal(ring.slot, '戒指'); assert.equal(ring.level, 100);
  assert.equal(ring.attributes, '伤害 +20\n伤害 +12\n伤害 +12');
  assert.equal(D.parseEquipmentText('星辰\n防御 +20').slot, '');
  assert.equal(D.parseEquipmentText('星辰').level, '');
  assert.equal(D.parseEquipmentText('星辰\n镶嵌宝石 红玛瑞').gems, '红玛瑞');
  assert.match(D.parseEquipmentText('星辰\n特技 破血狂攻').special, /破血狂攻/);
  const armor = D.parseEquipmentText('名称：金甲\n部位：铠甲\n基础属性\n防御 +200');
  assert.equal(armor.attributes, '防御 +200'); assert.equal(armor.slot, '衣服');
});

test('玉魄提取基础、两条附加与开光信息，未识别数值保持空白', () => {
  const D = domain(), draft = D.parseEquipmentText(jadeText);
  assert.equal(draft.slot, '玉魄·阳'); assert.equal(draft.jadeBase, '伤害 +15');
  assert.equal(draft.jadeExtra1, '伤害 +8'); assert.equal(draft.jadeExtra2, '物理暴击等级 +10');
  assert.equal(draft.dustLevel, 8); assert.equal(draft.holes, 2); assert.equal(draft.hole2, '放下屠刀');
  assert.equal(draft.durability, 280); assert.equal(D.equipmentImportError(draft, 'c1'), '');
  const missing = D.parseEquipmentText('上古玉魄·阳');
  assert.equal(missing.dustLevel, ''); assert.equal(missing.holes, ''); assert.equal(missing.durability, '');
  assert.match(D.equipmentImportError(missing, 'c1'), /属性/);
  draft.dustLevel = ''; assert.match(D.equipmentImportError(draft, 'c1'), /灵尘/);
});

test('游戏内等级、灵饰类型和混合宝石行可解析，稀有装备名纠正限定部位等级', () => {
  const D = domain();
  const draft = D.parseEquipmentText('明月档\n【装备条件 等级80\n【灵饰类型 耳饰\n法术防御+16\n精炼等级4\n治疗能力+7[+12]\n治疗能力+10[+12]\n特效:回春之术(4级)');
  assert.equal(draft.name, '明月珰'); assert.equal(draft.slot, '耳饰'); assert.equal(draft.level, 80);
  assert.equal(draft.gems, '精炼等级4'); assert.match(draft.attributes, /治疗能力\+7\[\+12\]/);
  assert.equal(D.parseEquipmentText('明月档\n部位:耳饰\n等级100').name, '明月档');
  assert.equal(D.parseEquipmentText('明月档\n部位:戒指\n等级80').name, '明月档');
  const accessory = D.parseEquipmentText('明月档\n部位:耳饰\n等级80\n物理暴击等级20\n精炼等级4');
  assert.equal(accessory.level, 80); assert.match(accessory.attributes, /物理暴击等级20/);
  const weapon = D.parseEquipmentText('飞龙在天\n等级130五行木\n命中+660伤害+466\n锻炼等级4镶嵌宝石红玛瑙\n体质+37');
  assert.equal(weapon.level, 130); assert.equal(weapon.slot, '武器'); assert.match(weapon.gems, /红玛瑙/);
});

test('批量保存只补空位：同名不同属性独立建档，完全相同复用，角色隔离且无财务流水', async () => {
  const D = domain(), first = D.parseEquipmentText(weapon), second = { ...first, attributes: '伤害 +550' };
  const result = await D.importEquipment([first, second], { characterId: 'c1', index: 1 });
  assert.equal(result.created, 2); assert.equal(result.equipped, 1); assert.equal(result.stored, 1);
  const id = D.charById('c1').equipmentSets[1].slots['武器'];
  assert.equal(id, D.state.equipment[0].id);
  const repeated = await D.importEquipment([first, second], { characterId: 'c1', index: 1 });
  assert.equal(repeated.created, 0); assert.equal(repeated.reused, 2); assert.equal(D.state.equipment.length, 2);
  assert.equal(D.charById('c1').equipmentSets[1].slots['武器'], id);
  await D.importEquipment([first], { characterId: 'c2', index: null });
  assert.equal(D.state.equipment.length, 3); assert.equal(D.charById('c2').equipmentSets[0].slots['武器'], undefined);
  assert.equal(D.state.equipment[0].ocrText, weapon); assert.equal(D.state.transactions.length, 0); assert.equal(D.state.gearLogs.length, 0);
});

test('未解锁玉魄只入仓库，已解锁可填空位；现有装备和其他方案保留', async () => {
  const D = domain(), draft = D.parseEquipmentText(jadeText);
  const stored = await D.importEquipment([draft], { characterId: 'c1', index: 0 });
  assert.equal(stored.stored, 1); assert.equal(stored.equipped, 0);
  D.charById('c1').soulJade.unlocked = true;
  D.state = D.normalize(JSON.parse(JSON.stringify(D.state)));
  const equipped = await D.importEquipment([draft], { characterId: 'c1', index: 2 });
  assert.equal(equipped.reused, 1); assert.equal(equipped.equipped, 1);
  assert.equal(D.charById('c1').equipmentSets[0].slots['玉魄·阳'], undefined);
  assert.equal(D.state.equipment[0].jade.enchantments.join(), '野兽之力,放下屠刀');
});

test('后续行校验和落盘失败均整体回滚，重试不重复；无效等级、方案或角色拒绝', async () => {
  const D = domain(), draft = D.parseEquipmentText(weapon), before = JSON.stringify(D.state);
  await assert.rejects(D.importEquipment([draft, { ...draft, slot: '' }], { characterId: 'c1', index: 0 }), /第 2 件/);
  assert.equal(JSON.stringify(D.state), before);
  D.persist = async () => { throw new Error('disk full'); };
  await assert.rejects(D.importEquipment([draft], { characterId: 'c1', index: 0 }), /disk full/);
  assert.equal(JSON.stringify(D.state), before);
  D.persist = async () => {};
  await D.importEquipment([draft], { characterId: 'c1', index: 0 });
  assert.equal(D.state.equipment.length, 1);
  for (const level of [-1, 1000, 1.5, NaN, '120']) assert.match(D.equipmentImportError({ ...draft, level }, 'c1'), /等级/);
  await assert.rejects(D.importEquipment([draft], { characterId: 'c1', index: 3 }), /方案/);
  await assert.rejects(D.importEquipment([draft], { characterId: 'missing', index: 0 }), /角色/);
  await assert.rejects(D.importEquipment([], { characterId: 'c1', index: 0 }), /截图/);
});
