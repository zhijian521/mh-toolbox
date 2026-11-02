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
test('标签与数值之间夹了标点也归位：换档复跑出来的那行头盔属性', () => {
    /*
     * 真机那张「七彩花环」在 2 倍档下识别成 `魔法+80防御+43`（没有空格）与
     * `伤害、+48`（多一个顿号）。前者靠 `\s*` 就能过，后者在改之前会让整条词条
     * 退化成「原有属性」——识别已经对了，不能死在解析上。
     */
    const D = domain(),
        parsed = D.parseEquipmentStats('魔法+80防御+43\n伤害、+48');
    assert.deepEqual(plain(parsed.rows), [
        { key: 'mp', value: 80, boost: null },
        { key: 'defense', value: 43, boost: null },
        { key: 'damage', value: 48, boost: null },
    ]);
    assert.deepEqual(parsed.unknown, []);
    const detail = D.equipmentDetails({
        slot: '头盔',
        level: 80,
        attributes: '魔法+80防御+43',
        gems: '锻炼等级 6 镶嵌宝石太阳石',
    });
    assert.deepEqual(plain(detail.base.map((row) => row.key)), ['mp', 'defense']);
    assert.equal(detail.forge, 6);
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
test('按属性词条反推部位：11 份真机文本各自指向自己的部位，分差都不低于 2', () => {
    /*
     * 玉魄靠名字与「基础属性/附加属性」的结构判，不参与反推（它的词条池与灵饰重叠），
     * 所以这里跳过两份玉魄样本。
     */
    const D = domain();
    for (const sample of samples) {
        if (sample.slot.startsWith('玉魄')) continue;
        const guess = D.inferEquipmentSlot(sample.text);
        assert.ok(guess, sample.file);
        assert.equal(guess.slot, sample.slot, sample.file);
        assert.ok(guess.margin >= 2, `${sample.file} 分差只有 ${guess.margin}`);
    }
});
test('名字认不出时靠属性认部位：七彩花环换成「测试装备」照样是头盔', () => {
    const D = domain();
    const text = [
        '测试装备',
        '装备条件 等级80',
        '装备角色 女',
        '等级 80',
        '魔法+80防御+43',
        '耐久度661',
        '锻炼等级 6 镶嵌宝石太阳石',
        '伤害、+48',
    ].join('\n');
    const draft = D.parseEquipmentText(text);
    assert.equal(draft.slot, '头盔', '魔法只在头盔的基础属性里');
    assert.equal(draft.level, 80);
    assert.equal(draft.attributes.split('\n').length, 2);
});
test('两个部位都解释得通时留空，不拿猜测替用户决定', () => {
    const D = domain();
    // 防御 + 敏捷：既是鞋子的基础属性，也可能是衣服的基础属性加一条单加。
    const guess = D.inferEquipmentSlot('测试装备\n防御 +50\n敏捷 +30');
    assert.ok(guess.margin < 2, `分差 ${guess.margin} 不该算作确定`);
    assert.equal(D.parseEquipmentText('测试装备\n防御 +50\n敏捷 +30').slot, '');
    assert.equal(D.inferEquipmentSlot('随便一行没有数字'), null, '一个词条都没有时不猜');
});
