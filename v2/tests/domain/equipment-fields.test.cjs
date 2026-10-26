'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const createDomain = require('./helpers/domain.cjs');
const samples = require('./fixtures/equipment-ocr/samples.json');
const plain = (value) => JSON.parse(JSON.stringify(value));
function domain() {
    const D = createDomain();
    D.state = D.normalize({ characters: [{ id: 'c', name: '轻舟' }], equipment: [] });
    D.persist = async () => {};
    return D;
}
test('12 个真实截图的文字按部位拆分，保留负数、重复词条、混镶与玉魄百分比', () => {
    const D = domain(),
        details = {};
    for (const sample of samples) {
        const draft = D.parseEquipmentText(sample.text);
        assert.equal(draft.slot, sample.slot, sample.file);
        assert.equal(draft.name, sample.name);
        const record = D.equipmentImportRecord(draft, 'c');
        D.validateEquipmentDetails(record.slot, record.level, record.details);
        details[sample.slot] = record.details;
    }
    assert.equal(details.衣服.extra.find((row) => row.key === 'agility').value, -5);
    assert.equal(details.头盔.bonus[0].value, 40);
    assert.deepEqual(plain(details.戒指.extra.map((row) => row.value)), [8, 8, 7]);
    assert.deepEqual(plain(details.耳饰.extra.map((row) => row.boost)), [12, 12, 16]);
    assert.match(details.耳饰.suit, /治疗能力\+24/);
    assert.equal(details.耳饰.legacy, '');
    assert.equal(details.腰带.gems.length, 2);
    assert.equal(details.腰带.gems[0].level, null);
    assert.equal(details['玉魄·阳'].jade.chance, 0.5);
    assert.equal(details['玉魄·阴'].extra[1].boost, 18);
});
test('领域层拒绝错误部位、非法负值、重复双加、互斥特效和三种宝石，数值零有效', () => {
    const D = domain(),
        detail = D.emptyEquipmentDetails();
    const row = (key, value, boost = null) => ({ key, value, boost });
    detail.base = [row('damage', 0), row('hit', 600)];
    detail.extra = [row('strength', 24), row('agility', -5)];
    D.validateEquipmentDetails('武器', 130, detail);
    assert.throws(() => D.validateEquipmentDetails('鞋子', 130, detail), /部位/);
    for (const bad of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        const value = plain(detail);
        value.base[0].value = bad;
        assert.throws(() => D.validateEquipmentDetails('武器', 130, value), /整数/);
    }
    const repeated = plain(detail);
    repeated.extra[1].key = 'strength';
    assert.throws(() => D.validateEquipmentDetails('武器', 130, repeated), /重复/);
    const effects = plain(detail);
    effects.effects = ['永不磨损', '坚固'];
    assert.throws(() => D.validateEquipmentDetails('武器', 130, effects), /同时/);
    const gems = plain(detail);
    gems.gems = ['太阳石', '红玛瑙', '神秘石'].map((type) => ({ type, level: null }));
    assert.throws(() => D.validateEquipmentDetails('武器', 130, gems), /两种/);
});
test('旧文本适配只读，无法识别的内容保留，结构化字段及备份不共享引用', async () => {
    const D = domain(),
        old = {
            id: 'legacy',
            characterId: 'c',
            slot: '武器',
            name: '旧武器',
            status: 'stored',
            attributes: '伤害 +466 命中 +660\n体质 +37\n历史手写说明 <b>保留</b>',
            special: '尚未收录的特效',
            gems: '红玛瑙 ×4',
        };
    const before = JSON.stringify(old),
        details = D.equipmentDetails(old);
    assert.equal(JSON.stringify(old), before);
    assert.match(details.legacy, /历史手写/);
    assert.match(details.legacy, /尚未收录/);
    await D.commitEquipment(() => D.saveEquipment({ ...old, details }));
    details.base[0].value = 999;
    assert.equal(D.state.equipment[0].details.base[0].value, 466);
    const backup = plain(D.state),
        normalized = D.normalize(backup);
    assert.deepEqual(plain(normalized), backup);
    normalized.equipment[0].details.extra[0].value = 999;
    assert.equal(backup.equipment[0].details.extra[0].value, 37);
});
test('结构化批量导入幂等，保存失败整体回滚，重复词条和原文重启后仍保留', async () => {
    const D = domain(),
        drafts = samples.map((sample) => D.parseEquipmentText(sample.text));
    const before = JSON.stringify(D.state);
    D.persist = async () => {
        throw new Error('失败');
    };
    await assert.rejects(D.importEquipment(drafts, { characterId: 'c', index: null }), /失败/);
    assert.equal(JSON.stringify(D.state), before);
    D.persist = async () => {};
    const result = await D.importEquipment(drafts, { characterId: 'c', index: null });
    assert.equal(result.created, 12);
    const again = await D.importEquipment(drafts, { characterId: 'c', index: null });
    assert.equal(again.reused, 12);
    const restored = D.normalize(plain(D.state));
    assert.equal(restored.equipment.find((eq) => eq.slot === '戒指').details.extra.length, 3);
    assert.equal(restored.equipment[0].ocrText, samples[0].text);
});
