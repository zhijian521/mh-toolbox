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
