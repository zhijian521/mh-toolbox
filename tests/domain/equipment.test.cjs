'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const createDomain = require('./helpers/domain.cjs');

function fixture() {
    return {
        schemaVersion: 3,
        characters: [
            { id: 'c1', name: '轻舟' },
            { id: 'c2', name: '小号' },
        ],
        equipment: [
            { id: 'a', characterId: 'c1', slot: '武器', name: '旧刀', status: 'active' },
            { id: 'b', characterId: 'c1', slot: '武器', name: '新刀', status: 'active' },
            { id: 'hat', characterId: 'c1', slot: '头盔', name: '头盔', status: 'active' },
            { id: 'sold', characterId: 'c1', slot: '鞋子', name: '旧鞋', status: 'sold' },
            { id: 'other', characterId: 'c1', slot: '其他', name: '收藏', status: 'active' },
            { id: 'c2', characterId: 'c2', slot: '武器', name: '小号武器', status: 'active' },
        ],
        transactions: [],
        gearLogs: [],
    };
}

function domain(data = fixture()) {
    const D = createDomain();
    D.state = D.normalize(data);
    D.persist = async () => {};
    return D;
}

function jade() {
    return {
        characterId: 'c1',
        slot: '玉魄·阳',
        name: '上古玉魄·阳',
        status: 'stored',
        jade: {
            base: '伤害 +15',
            extra1: '伤害 +8',
            extra2: '物理暴击等级 +10',
            dustLevel: 8,
            holes: 2,
            enchantments: ['野兽之力', '放下屠刀'],
            durability: 280,
        },
    };
}

test('装备迁移不改原对象：唯一在用放入第一套，冲突待选择，已售和其他不穿戴；往返幂等', () => {
    const original = fixture(),
        before = JSON.stringify(original),
        D = domain(original);
    assert.equal(JSON.stringify(original), before);
    const character = D.charById('c1');
    assert.equal(character.equipmentSets.length, 3);
    assert.equal(character.equipmentSets[0].slots['头盔'], 'hat');
    assert.equal(character.equipmentSets[0].slots['武器'], undefined);
    assert.equal(character.pendingEquipmentSlots.join(), '武器');
    assert.equal(character.equipmentSets[0].slots['鞋子'], undefined);
    assert.equal(character.equipmentSets[0].slots['其他'], undefined);
    assert.equal(D.charById('c2').equipmentSets[0].slots['武器'], 'c2');
    assert.equal(D.state.equipment.length, original.equipment.length);
    assert.equal(JSON.stringify(D.normalize(D.state)), JSON.stringify(D.state));
    D.assignEquipment('c1', 0, '武器', '');
    assert.equal(character.pendingEquipmentSlots.length, 0);
    assert.equal(D.state.equipment.length, original.equipment.length);
});

test('同角色同部位只能配置一件；换装卸下不改其他方案、不复制资产或产生账单', () => {
    const D = domain();
    D.assignEquipment('c1', 0, '武器', 'a');
    D.copyEquipmentSet('c1', 0, 1);
    D.assignEquipment('c1', 1, '武器', 'b');
    const character = D.charById('c1');
    assert.equal(character.equipmentSets[0].slots['武器'], 'a');
    assert.equal(character.equipmentSets[1].slots['武器'], 'b');
    assert.equal(character.pendingEquipmentSlots.length, 0);
    D.assignEquipment('c1', 1, '武器', '');
    assert.equal(character.equipmentSets[0].slots['武器'], 'a');
    assert.equal(character.equipmentSets[1].slots['武器'], undefined);
    assert.equal(D.state.equipment.length, 6);
    assert.equal(D.state.transactions.length, 0);
    assert.equal(D.state.gearLogs.length, 0);
    for (const [slot, id] of [
        ['武器', 'c2'],
        ['武器', 'hat'],
        ['鞋子', 'sold'],
        ['其他', 'other'],
    ]) {
        assert.throws(() => D.assignEquipment('c1', 0, slot, id));
    }
    assert.throws(() => D.copyEquipmentSet('c1', 0, 3));
});

test('三套共用档案，编辑属性即时共用；当前使用与正在查看独立，状态从方案推导', () => {
    const D = domain();
    D.assignEquipment('c1', 0, '武器', 'a');
    D.copyEquipmentSet('c1', 0, 1);
    D.copyEquipmentSet('c1', 0, 2);
    const eq = D.state.equipment.find((item) => item.id === 'a');
    D.saveEquipment({ ...eq, attributes: '伤害 +620' }, eq.id);
    assert.equal(D.equipmentReferences(eq.id).length, 3);
    assert.equal(D.state.equipment.filter((item) => item.id === eq.id).length, 1);
    const character = D.charById('c1');
    character.viewedEquipmentSet = 2;
    assert.equal(character.activeEquipmentSet, 0);
    D.assignEquipment('c1', 2, '武器', 'b');
    assert.equal(D.equipmentStatus(D.state.equipment.find((item) => item.id === 'b')), 'standby');
    character.activeEquipmentSet = 2;
    assert.equal(D.equipmentStatus(eq), 'standby');
    assert.equal(D.equipmentStatus(D.state.equipment.find((item) => item.id === 'b')), 'active');
    character.equipmentSets[2].name = '难度任务';
    const restored = domain(JSON.parse(JSON.stringify(D.state)));
    assert.equal(restored.charById('c1').equipmentSets[2].name, '难度任务');
    assert.equal(restored.charById('c1').activeEquipmentSet, 2);
    assert.equal(restored.charById('c1').viewedEquipmentSet, 2);
});

test('玉魄独立记录、同类型唯一，未解锁禁止穿戴，角色修炼三套共用且备份不串引用', () => {
    const D = domain();
    const eq = D.saveEquipment(jade());
    assert.throws(() => D.assignEquipment('c1', 0, eq.slot, eq.id), /解锁/);
    D.charById('c1').soulJade = { unlocked: true, attribute: '气血回复效果', level: 12 };
    D.assignEquipment('c1', 0, eq.slot, eq.id);
    D.copyEquipmentSet('c1', 0, 1);
    const before = JSON.stringify(D.state),
        normalized = D.normalize(D.state);
    normalized.equipment.find((item) => item.id === eq.id).jade.enchantments[0] = '流云诀';
    normalized.characters[0].equipmentSets[0].slots[eq.slot] = '';
    assert.equal(JSON.stringify(D.state), before);
    const restored = domain(JSON.parse(before));
    assert.equal(restored.charById('c1').soulJade.level, 12);
    assert.equal(restored.equipmentReferences(eq.id).length, 2);
    for (const changes of [
        { base: '' },
        { dustLevel: 18 },
        { dustLevel: 1.5 },
        { holes: 4 },
        { durability: 301 },
    ]) {
        const input = jade();
        input.jade = { ...input.jade, ...changes };
        assert.throws(() => D.saveEquipment(input));
    }
});

test('售出清空全部引用，撤销恢复持有而不猜测穿戴；同毫秒的最后一笔买卖生效', () => {
    const D = domain();
    D.assignEquipment('c1', 0, '武器', 'a');
    D.copyEquipmentSet('c1', 0, 1);
    const buy = {
        id: 'buy',
        equipmentId: 'a',
        characterId: 'c1',
        ledger: 'account',
        kind: 'expense',
        gearAction: 'buy',
        date: '2020-01-01',
        amount: 100,
        currency: 'cash',
        createdAt: 1,
    };
    const sale = { ...buy, id: 'sale', gearAction: 'sell', kind: 'income', amount: 150 };
    D.state.transactions.push(buy);
    D.syncAccountEquipment(buy);
    assert.equal(D.equipmentReferences('a').length, 2);
    D.state.transactions.push(sale);
    D.syncAccountEquipment(sale);
    assert.equal(D.equipmentReferences('a').length, 0);
    assert.equal(D.equipmentStatus(D.state.equipment[0]), 'sold');
    D.removeTransaction(sale.id);
    assert.notEqual(D.state.equipment[0].status, 'sold');
    assert.equal(D.equipmentStatus(D.state.equipment[0]), 'stored');
    assert.equal(D.equipmentReferences('a').length, 0);
    assert.equal(D.accountStats(D.accounts(), 'cash').expense, 100);
});

test('编辑部位清理全部旧格子；关联流水的角色不可直接变更；删除保留收支并解除关联', () => {
    const D = domain();
    D.assignEquipment('c1', 0, '武器', 'a');
    D.copyEquipmentSet('c1', 0, 1);
    const eq = D.state.equipment.find((item) => item.id === 'a');
    D.saveEquipment({ ...eq, slot: '其他' }, eq.id);
    assert.equal(D.equipmentReferences(eq.id).length, 0);
    const tx = {
        id: 'buy',
        equipmentId: 'a',
        characterId: 'c1',
        ledger: 'account',
        kind: 'expense',
        gearAction: 'buy',
        date: '2020-01-01',
        amount: 100,
        currency: 'rmb',
        fee: 2,
    };
    D.state.transactions.push(tx);
    D.syncAccountEquipment(tx);
    assert.throws(() => D.saveEquipment({ ...eq, characterId: 'c2' }, eq.id), /解除流水关联/);
    D.removeEquipment(eq.id);
    assert.equal(
        D.state.equipment.some((item) => item.id === eq.id),
        false,
    );
    assert.equal(
        D.state.gearLogs.some((log) => log.equipmentId === eq.id),
        false,
    );
    assert.equal(tx.equipmentId, undefined);
    assert.equal(D.accountStats(D.accounts(), 'rmb').expense, 102);
});

test('导入清理错角色、错部位、已出售和缺失引用，不删资产与收支', () => {
    const original = fixture();
    original.schemaVersion = 4;
    original.characters[0].equipmentSets = [
        { name: '测试方案', slots: { 武器: 'c2', 头盔: 'a', 鞋子: 'sold', 项链: 'missing' } },
    ];
    const D = domain(original);
    assert.equal(Object.keys(D.charById('c1').equipmentSets[0].slots).length, 0);
    assert.equal(D.state.equipment.length, original.equipment.length);
});

test('保存失败回滚方案、装备和售出关联，重试不会留下重复档案或账单', async () => {
    const D = domain();
    const snapshot = JSON.stringify(D.state);
    D.persist = async () => {
        throw new Error('磁盘写入失败');
    };
    await assert.rejects(
        D.commitEquipment(() => {
            const eq = D.saveEquipment({
                characterId: 'c1',
                slot: '戒指',
                name: '新戒指',
                status: 'stored',
            });
            D.assignEquipment('c1', 0, eq.slot, eq.id);
        }),
        /磁盘/,
    );
    assert.equal(JSON.stringify(D.state), snapshot);
    D.persist = async () => {};
    await D.commitEquipment(() => {
        const eq = D.saveEquipment({
            characterId: 'c1',
            slot: '戒指',
            name: '新戒指',
            status: 'stored',
        });
        D.assignEquipment('c1', 0, eq.slot, eq.id);
    });
    assert.equal(D.state.equipment.filter((eq) => eq.name === '新戒指').length, 1);
    const beforeSale = JSON.stringify(D.state);
    const eq = D.state.equipment.find((item) => item.name === '新戒指');
    D.persist = async () => {
        throw new Error('磁盘写入失败');
    };
    await assert.rejects(
        D.commitEquipment(() => {
            const tx = {
                id: 'sale',
                equipmentId: eq.id,
                characterId: 'c1',
                ledger: 'account',
                kind: 'income',
                amount: 100,
                date: '2020-01-01',
                currency: 'cash',
                createdAt: 1,
            };
            D.state.transactions.push(tx);
            D.syncAccountEquipment(tx);
        }),
        /磁盘/,
    );
    assert.equal(JSON.stringify(D.state), beforeSale);
});

test('方案改名：三条一起校验，空名、超长与重名都拒绝，保存后随档案读回', () => {
    const D = domain();
    assert.throws(() => D.renameEquipmentSet('c1', ['日常', '']), /3 套/);
    assert.throws(() => D.renameEquipmentSet('c1', ['日常', '比武', '  ']), /不能为空/);
    assert.throws(() => D.renameEquipmentSet('c1', ['日常', '比武', '备'.repeat(21)]), /20 个字/);
    assert.throws(() => D.renameEquipmentSet('c1', ['日常', '日常', '备用']), /不能重复/);
    D.renameEquipmentSet('c1', [' 日常 ', '比武', '备用']);
    assert.deepEqual(
        D.charById('c1').equipmentSets.map((set) => set.name),
        ['日常', '比武', '备用'],
    );
    const restored = domain(JSON.parse(JSON.stringify(D.state)));
    assert.equal(restored.charById('c1').equipmentSets[0].name, '日常');
});

test('结构化属性保存后写进快照文本：宝石、特效、负数熔炼都按原样留住', () => {
    const D = domain();
    const eq = D.saveEquipment({
        characterId: 'c1',
        slot: '武器',
        name: '测试剑',
        level: 120,
        status: 'stored',
        details: {
            ...D.emptyEquipmentDetails(),
            base: [
                { key: 'damage', value: 480, boost: null },
                { key: 'hit', value: 530, boost: null },
            ],
            extra: [{ key: 'strength', value: 32, boost: null }],
            bonus: [{ key: 'damage', value: 20, boost: null }],
            melt: [{ key: 'damage', value: -12, boost: null }],
            technique: '野兽之力',
            effects: ['永不磨损'],
            forge: 10,
            gems: [{ type: '太阳石', level: 10 }],
        },
    });
    assert.equal(eq.attributes, '伤害 +480\n命中 +530\n力量 +32\n伤害 +20');
    assert.equal(eq.special, '特技：野兽之力\n特效：永不磨损');
    assert.equal(eq.gems, '锻炼等级 10\n太阳石 ×10');
    // 熔炼不进快照文本，但结构化属性里必须还在：负数加成是最容易被抹成 0 的值。
    assert.equal(eq.details.melt[0].value, -12);
    const restored = domain(JSON.parse(JSON.stringify(D.state)));
    const saved = restored.state.equipment.find((item) => item.id === eq.id);
    assert.equal(restored.equipmentDetails(saved).melt[0].value, -12);
    assert.equal(restored.equipmentDetails(saved).gems[0].level, 10);
});

test('玉魄走结构化属性保存：基础与两条附加写回文本字段，灵尘与开光保留', () => {
    const D = domain();
    const eq = D.saveEquipment({
        characterId: 'c1',
        slot: '玉魄·阳',
        name: '上古玉魄·阳',
        status: 'stored',
        level: '',
        details: {
            ...D.emptyEquipmentDetails(),
            base: [{ key: 'damage', value: 15, boost: null }],
            extra: [
                { key: 'damage', value: 8, boost: null },
                { key: 'physicalCrit', value: 10, boost: null },
            ],
            jade: {
                dust: 8,
                assault: '奇袭法术',
                chance: 12.5,
                holes: 2,
                enchantments: ['野兽之力', '放下屠刀'],
            },
            durability: 280,
        },
    });
    assert.equal(eq.jade.base, '伤害 +15');
    assert.equal(eq.jade.extra1, '伤害 +8');
    assert.equal(eq.jade.extra2, '物理暴击等级 +10');
    assert.equal(eq.jade.dustLevel, 8);
    assert.deepEqual(eq.jade.enchantments, ['野兽之力', '放下屠刀']);
    const detail = D.equipmentDetails(D.state.equipment.find((item) => item.id === eq.id));
    assert.equal(detail.jade.assault, '奇袭法术');
    assert.equal(detail.jade.chance, 12.5);
    assert.equal(detail.durability, 280);
});

test('灵饰词条可带强化加成，超量与重复仍被拦下', () => {
    const D = domain();
    const eq = D.saveEquipment({
        characterId: 'c1',
        slot: '戒指',
        name: '测试戒指',
        status: 'stored',
        details: {
            ...D.emptyEquipmentDetails(),
            base: [{ key: 'damage', value: 30, boost: 5 }],
            extra: [
                { key: 'physicalCrit', value: 48, boost: 6 },
                { key: 'spellCrit', value: 32, boost: null },
                { key: 'speed', value: 12, boost: null },
            ],
        },
    });
    assert.equal(D.equipmentDetails(eq).base[0].boost, 5);
    assert.throws(
        () =>
            D.saveEquipment(
                {
                    characterId: 'c1',
                    slot: '戒指',
                    name: '四条附加',
                    status: 'stored',
                    details: {
                        ...D.emptyEquipmentDetails(),
                        extra: [
                            { key: 'physicalCrit', value: 1, boost: null },
                            { key: 'spellCrit', value: 2, boost: null },
                            { key: 'speed', value: 3, boost: null },
                            { key: 'damage', value: 4, boost: null },
                        ],
                    },
                },
                undefined,
            ),
        /附加属性数量/,
    );
});

test('截图把「+」读成「±」时仍按加号解析：数值与方括号加成都要留下', () => {
    const D = domain();
    const parsed = D.parseEquipmentStats('治疗能力±10 [+12]\n伤害+8[+16]\n治疗能力+7[+12]');
    assert.deepEqual(parsed.rows, [
        { key: 'healing', value: 10, boost: 12 },
        { key: 'damage', value: 8, boost: 16 },
        { key: 'healing', value: 7, boost: 12 },
    ]);
    assert.deepEqual(parsed.unknown, [], '没有整行退化成「原有属性」');
});

test('真实截图识别文本一路解析到玉魄结构化属性', () => {
    const D = domain();
    // 取自 E:\zhijian\截图\玉魄阳.png 的实际识别结果，换行也与 OCR 一致。
    const text = [
        '上古玉魄·阳',
        '物理暴击等级+10',
        '奇袭法术+0.5%',
        '耐久度205',
        '灵尘等级2',
        '伤害+5[+12]',
        '治疗能力+4[+9]',
        '奇袭特技：[空]',
    ].join('\n');
    const draft = D.parseEquipmentText(text);
    assert.equal(draft.slot, '玉魄·阳', '名称带「玉魄·阳」时直接定部位');
    assert.equal(draft.name, '上古玉魄·阳');
    assert.equal(draft.jadeBase, '物理暴击等级+10');
    assert.equal(draft.jadeExtra1, '伤害+5[+12]');
    assert.equal(draft.jadeExtra2, '治疗能力+4[+9]', '「奇袭法术」那行不占附加属性位');

    const record = D.equipmentImportRecord(draft, 'c1');
    assert.equal(record.attributes, '', '玉魄的属性走 jade 字段，不进自由文本');
    assert.equal(record.level, '');
    const details = record.details;
    assert.deepEqual(details.base, [{ key: 'physicalCrit', value: 10, boost: null }]);
    assert.deepEqual(details.extra, [
        { key: 'damage', value: 5, boost: 12 },
        { key: 'healing', value: 4, boost: 9 },
    ]);
    assert.equal(details.jade.dust, 2, '灵尘等级');
    assert.equal(details.jade.assault, '奇袭法术');
    assert.equal(details.jade.chance, 0.5);
    assert.equal(details.jade.holes, 1, '空着的奇袭特技算一个开光孔');
    assert.equal(details.durability, 205);
    assert.equal(details.legacy, '', '没有解析残留');
    assert.equal(D.equipmentImportError(draft, 'c1'), '', '识别结果可以直接入库');
});
