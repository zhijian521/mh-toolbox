import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDomain } from '../../src/renderer/domain/create-domain.js';

/*
 * P0 回归：读取路径绝不能让整份 data.json 打不开。
 *
 * 冻结模块（总览 / 收益 / 账号 / 目标 / 装备）不渲染页面，但数据必须原样穿过
 * load → normalize → save 的往返；其中任何一处抛错都会让启动停在 startupError，
 * 用户既看不到数据也导不出来。这里同时守两件事：
 * 1. 任何可解析的旧档形状都不抛错；
 * 2. 合法数据两次 normalize 结果一致（幂等即往返稳定），且被丢弃的原文仍留在记录里。
 */

/** 与 tests/domain/helpers/domain.cjs 等价，但 .mjs 直接导入领域工厂。 */
function domain() {
    return createDomain({
        gateway: {
            loadData: async () => ({ ok: true, data: {} }),
            saveData: async () => ({ ok: true }),
        },
    });
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('任意可解析的旧档形状都不会让 normalize 抛错', () => {
    const hostile = [
        { characters: [null] },
        { characters: ['x'] },
        { characters: [{ id: 'c', name: '轻舟' }, null] },
        { characters: [[], 5, true] },
        { transactions: [null] },
        { transactions: [[1], 'x'] },
        { transactions: [{ id: 't', note: {}, category: 5, kind: 5 }] },
        { goals: [null] },
        { goals: [{ tracking: null, logs: [null] }] },
        { goals: [{ type: 'progress', tracking: 'x' }] },
        { goals: [{ type: 'progress', tracking: { category: 5, key: 5 } }] },
        { goals: [{ logs: 'x', target: {} }] },
        { equipment: [null] },
        { equipment: [{ id: 'e', slot: '武器', details: 5 }] },
        { equipment: [{ id: 'e', slot: '武器', details: { version: 1 } }] },
        { equipment: [{ id: 'e', slot: '武器', jade: 5 }] },
        { gearLogs: [null, 5] },
        { sessions: 'nope' },
        { sessions: [null, 5] },
        { activeSession: { characterId: 123 } },
        { activeSession: [] },
        { activeSessions: 'x' },
        { activeSessions: [null, 5] },
        { activeSessions: [{ id: 'a', characterId: 'ghost', startAt: 1 }] },
        { itemPrices: { a: 'x' } },
        { itemPrices: [] },
        { quickSettings: 'x' },
        { quickSettings: [] },
        { schemaVersion: '6' },
        { schemaVersion: { v: 6 } },
    ];
    for (const input of hostile) {
        const D = domain();
        const state = D.normalize(plain(input));
        assert.equal(typeof state, 'object', JSON.stringify(input));
        for (const key of [
            'characters',
            'transactions',
            'goals',
            'equipment',
            'gearLogs',
            'sessions',
            'activeSessions',
        ])
            assert.ok(Array.isArray(state[key]), key + ' 应为数组：' + JSON.stringify(input));
    }
});

test('损坏的列表项被丢弃，合法项与被冻结的字段保持原样', () => {
    const D = domain();
    const state = D.normalize({
        characters: [{ id: 'c1', name: '轻舟' }, null, 'x', 5],
        transactions: [{ id: 't1', amount: 12, ledger: 'account', note: '一笔' }, null],
        goals: [{ id: 'g1', target: 175 }, 'x'],
        equipment: [{ id: 'e1', slot: '武器', name: '木剑' }, null],
        gearLogs: [{ id: 'l1', action: 'buy' }, 5],
    });
    assert.deepEqual(plain(state.characters.map((c) => c.id)), ['c1']);
    assert.deepEqual(plain(state.transactions.map((t) => t.id)), ['t1']);
    assert.deepEqual(plain(state.goals.map((g) => g.id)), ['g1']);
    assert.deepEqual(plain(state.equipment.map((e) => e.id)), ['e1']);
    assert.deepEqual(plain(state.gearLogs.map((l) => l.id)), ['l1']);
});

/** 形如 V1 备份的完整数据：冻结模块全部有内容，装备属性含旧版非法值。 */
function v1Backup() {
    return {
        schemaVersion: 3,
        characters: [
            {
                id: 'c1',
                name: '轻舟',
                level: 130,
                sortOrder: 0,
                progress: { training: { attack: 20 }, note: '主号' },
            },
        ],
        transactions: [
            {
                id: 't1',
                ledger: 'account',
                note: '装备「旧武器」买入',
                category: '装备购入',
                date: '2024-01-01',
                amount: 100,
                currency: 'cash',
                kind: 'expense',
                characterId: 'c1',
            },
            {
                id: 't2',
                ledger: 'earnings',
                date: '2024-01-02',
                amount: 66,
                currency: 'game',
                category: '抓鬼',
                kind: 'income',
                note: '一笔收益',
            },
        ],
        sessions: [
            {
                id: 's1',
                characterId: 'c1',
                mode: 'legacy',
                source: 'legacy',
                date: '2024-01-02',
                minutes: 60,
                cost: 1,
                note: '旧版在线记录',
                createdAt: 1700000000000,
            },
        ],
        activeSession: {
            id: 'as1',
            characterId: 'c1',
            startAt: 1700000000000,
            createdAt: 1700000000000,
            accounts: 5,
            cardPrice: 15000,
        },
        goals: [
            {
                id: 'g1',
                type: 'progress',
                title: '冲 175',
                tracking: { category: 'level', key: '' },
                target: 175,
                current: 130,
                unit: '级',
                logs: [{ id: 'gl1', date: '2024-01-05', delta: 3, note: '一条进度' }],
            },
        ],
        equipment: [
            {
                id: 'e1',
                characterId: 'c1',
                slot: '武器',
                name: '旧武器',
                level: 130,
                status: 'active',
                attributes: '伤害 +466 命中 +660',
                special: '凝气决',
                gems: '红玛瑙 ×4',
                details: {
                    version: 1,
                    base: [{ key: 'damage', value: 466, boost: null }],
                    extra: [{ key: 'strength', value: 24, boost: null }],
                    bonus: [],
                    melt: [],
                    technique: '凝气决',
                    effects: ['简易'],
                    forge: 5,
                    gems: [{ type: '星辉石', level: 3 }],
                    clock: { name: '', level: null },
                    suit: '',
                    element: '金',
                    durability: 300,
                    repair: null,
                    maker: '',
                    runes: '',
                    jade: { dust: null, assault: '', chance: null, holes: 0, enchantments: [] },
                    legacy: '旧版手写特别说明',
                    备注: '自定义补充',
                },
            },
        ],
        gearLogs: [
            {
                id: 'l1',
                equipmentId: 'e1',
                characterId: 'c1',
                date: '2024-01-01',
                amount: 100,
                action: 'buy',
                synced: false,
                note: '购入备注',
            },
        ],
        itemPrices: { 5: 10, 99: 120 },
        quickSettings: { accounts: 6, cardPrice: 16000 },
    };
}

const frozenKeys = [
    'transactions',
    'sessions',
    'activeSessions',
    'goals',
    'equipment',
    'gearLogs',
    'itemPrices',
    'quickSettings',
];

test('V1 备份能正常打开：冻结数据两次归一结果一致，且旧文本不丢', () => {
    const first = domain().normalize(v1Backup());
    const second = domain().normalize(plain(first));
    const third = domain().normalize(plain(second));
    for (const key of frozenKeys) {
        assert.deepEqual(plain(second[key]), plain(first[key]), key + ' 第二次归一发生了变化');
        assert.deepEqual(plain(third[key]), plain(second[key]), key + ' 第三次归一发生了变化');
    }
    const detail = first.equipment[0].details;
    // 原 legacy 原文、未知字段与无法表示的值都必须留在记录里，不能被静默删除。
    for (const text of ['旧版手写特别说明', '自定义补充', '凝气决', '星辉石'])
        assert.match(detail.legacy, new RegExp(text), '修好的属性里缺少原文：' + text);
    // 能表示的部分仍然按结构化字段保存。
    assert.equal(detail.base[0].value, 466);
    assert.equal(detail.extra[0].value, 24);
    assert.equal(detail.forge, 5);
    assert.equal(detail.element, '金');
    assert.equal(detail.technique, '');
    assert.deepEqual(plain(detail.gems), []);
    // 修复结果必须真的合法，否则保存路径会在下一次交互写入时炸掉。
    assert.doesNotThrow(() => domain().validateEquipmentDetails('武器', 130, detail));
});

test('repairEquipmentDetails 保留三类非法内容的原文并通过严格校验', () => {
    const D = domain();
    const detail = {
        version: 1,
        base: [
            { key: 'damage', value: 466, boost: null },
            { key: 'spirit', value: 5, boost: null },
        ],
        extra: [],
        bonus: [],
        melt: [],
        technique: '凝气决',
        effects: [],
        forge: null,
        gems: [{ type: '星辉石', level: 3 }],
        clock: { name: '', level: null },
        suit: '',
        element: '',
        durability: null,
        repair: null,
        maker: '',
        runes: '',
        jade: { dust: null, assault: '', chance: null, holes: 0, enchantments: [] },
        legacy: '',
    };
    const repaired = D.repairEquipmentDetails('武器', 130, detail);
    assert.doesNotThrow(() => D.validateEquipmentDetails('武器', 130, repaired));
    // 三类原文：不支持的特技、不支持的宝石、越界词条。
    for (const text of ['凝气决', '星辉石', '灵力 +5'])
        assert.ok(repaired.legacy.includes(text), '原文缺失：' + text);
    assert.equal(repaired.base.length, 1);
    assert.equal(repaired.base[0].value, 466);
});

test('repairEquipmentDetails 幂等，非 version 1 的形状整体收进 legacy', () => {
    const D = domain();
    const detail = {
        version: 1,
        base: [
            { key: 'damage', value: 466, boost: null },
            { key: 'spirit', value: 5 },
        ],
        extra: [{ key: 'strength', value: 24, boost: 12 }],
        bonus: [],
        melt: [],
        technique: '凝气决',
        effects: ['简易', '简易'],
        forge: 99,
        gems: [
            { type: '太阳石', level: 4 },
            { type: '太阳石', level: 5 },
            { type: '星辉石', level: 3 },
        ],
        clock: { name: '回春之术', level: 3 },
        suit: '套装文本',
        element: '水',
        durability: -5,
        repair: 9,
        maker: '',
        runes: '',
        jade: { dust: 3, assault: '', chance: null, holes: 0, enchantments: [] },
        legacy: '原始说明',
    };
    const once = D.repairEquipmentDetails('武器', 130, detail);
    const twice = D.repairEquipmentDetails('武器', 130, plain(once));
    assert.deepEqual(plain(twice), plain(once));
    assert.doesNotThrow(() => D.validateEquipmentDetails('武器', 130, once));
    // 武器不支持钟灵石与灵尘：内容记进原文后字段清空。
    assert.deepEqual(plain(once.clock), { name: '', level: null });
    assert.equal(once.jade.dust, null);
    assert.match(once.legacy, /回春之术/);

    const foreign = D.repairEquipmentDetails('武器', 130, { 武器名: '外来形状', 属性: [1, 2] });
    assert.equal(foreign.version, 1);
    assert.match(foreign.legacy, /外来形状/);
    assert.doesNotThrow(() => D.validateEquipmentDetails('武器', 130, foreign));
    assert.deepEqual(plain(D.repairEquipmentDetails('武器', 130, plain(foreign))), plain(foreign));
});

test('所有部位与全部非法输入都能修复成合法属性，且不抛错', () => {
    const D = domain();
    const slots = [
        '武器',
        '头盔',
        '项链',
        '衣服',
        '腰带',
        '鞋子',
        '戒指',
        '耳饰',
        '手镯',
        '佩饰',
        '玉魄·阳',
        '玉魄·阴',
        '其他',
        '未知部位',
    ];
    const inputs = [
        null,
        undefined,
        5,
        'x',
        [],
        {},
        { version: '1' },
        { version: 1 },
        { version: 1, base: 'x', extra: {}, gems: 'x', effects: 5, clock: 'x', jade: 5 },
        {
            version: 1,
            base: [
                { key: 'damage', value: 'x' },
                { key: 'nope', value: 1 },
            ],
            extra: [{ key: 'strength', value: 1, boost: 2 }],
            gems: [{ type: '红玛瑙' }, { type: '红玛瑙' }, { type: '绿宝石' }],
            clock: { name: '回春之术', level: 99 },
            jade: { dust: 99, assault: '奇袭法术', chance: 150, holes: 9, enchantments: ['a'] },
        },
    ];
    for (const slot of slots) {
        for (const input of inputs) {
            const repaired = D.repairEquipmentDetails(slot, 130, input);
            assert.doesNotThrow(
                () => D.validateEquipmentDetails(slot, 130, repaired),
                slot + ' 修复结果不合法：' + JSON.stringify(input),
            );
        }
    }
    // 旧档里等级本身非法时也不能连累属性修复。
    const level = D.repairEquipmentDetails('武器', 'x', {
        version: 1,
        base: [{ key: 'damage', value: 5 }],
    });
    assert.deepEqual(plain(level.base), [{ key: 'damage', value: 5, boost: null }]);
});
