'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const createDomain = require('./helpers/domain.cjs');
function domain() {
    const D = createDomain();
    D.state = D.normalize({
        schemaVersion: 4,
        characters: [
            { id: 'c1', name: '轻舟', level: 109 },
            { id: 'c2', name: '山月' },
        ],
        equipment: [
            { id: 'sword', characterId: 'c1', slot: '武器', name: '测试刀', status: 'stored' },
        ],
    });
    D.persist = async () => {};
    return D;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('单项快捷编辑保留同组其他值及技能顺序，记录单次变化并同步关联目标', async () => {
    const D = domain();
    await D.saveCharacterProgress('c1', {
        schoolSkills: [
            { name: '为官之道', level: 119 },
            { name: '无双一击', level: null },
        ],
        auxiliarySkills: [{ name: '强身术', level: 80 }],
        training: { attack: 17, magic: 0 },
        petTraining: { attack: 15 },
        qianyuanPills: 3,
        potentialFruits: 100,
    });
    const goal = await D.saveGoal({
        characterId: 'c1',
        type: 'progress',
        target: 18,
        tracking: { category: 'training', key: 'attack' },
    });
    const previous = plain(D.charById('c1'));
    await D.saveCharacterValue('c1', 'training', 'attack', 18, {
        date: '2026-01-01',
        note: '快捷提升',
    });
    const saved = D.charById('c1');
    assert.equal(saved.progress.training.magic, 0);
    assert.equal(saved.progress.petTraining.attack, 15);
    assert.deepEqual(plain(saved.progress.schoolSkills), previous.progress.schoolSkills);
    assert.deepEqual(plain(saved.equipmentSets), previous.equipmentSets);
    assert.equal(saved.growthHistory.length, previous.growthHistory.length + 1);
    assert.deepEqual(plain(saved.growthHistory.at(-1).changes), [
        { group: '人物修炼', label: '攻击修炼', from: 17, to: 18, unit: '级', kind: 'increase' },
    ]);
    assert.equal(saved.growthHistory.at(-1).date, '2026-01-01');
    assert.equal(saved.growthHistory.at(-1).note, '快捷提升');
    assert.equal(D.goalSummary(goal).status, 'done');
    await D.saveCharacterValue('c1', 'schoolSkills', '无双一击', 0);
    await D.saveCharacterValue('c1', 'auxiliarySkills', '强身术', 81);
    await D.saveCharacterValue('c1', 'petTraining', 'attack', 16);
    await D.saveCharacterValue('c1', 'qianyuanPills', '', 0);
    await D.saveCharacterValue('c1', 'potentialFruits', '', '');
    assert.deepEqual(plain(D.charById('c1').progress.schoolSkills), [
        { name: '为官之道', level: 119 },
        { name: '无双一击', level: 0 },
    ]);
    assert.equal(D.charById('c1').progress.auxiliarySkills[0].level, 81);
    assert.equal(D.charById('c1').progress.petTraining.attack, 16);
    assert.equal(D.charById('c1').progress.qianyuanPills, 0);
    assert.equal(D.charById('c1').progress.potentialFruits, null);
    const count = D.charById('c1').growthHistory.length;
    await D.saveCharacterValue('c1', 'qianyuanPills', '', 0);
    assert.equal(D.charById('c1').growthHistory.length, count);
});

test('排队的单项编辑读取最新档案，按技能名称更新且不复活已删除技能', async () => {
    const D = domain();
    const first = D.saveCharacterProgress('c1', {
        schoolSkills: [
            { name: '乙', level: 20 },
            { name: '甲', level: 10 },
        ],
        training: { attack: 17, magic: 9 },
    });
    const second = D.saveCharacterValue('c1', 'schoolSkills', '甲', 11);
    const third = D.saveCharacterValue('c1', 'training', 'attack', 18);
    const fourth = D.saveCharacterValue('c1', 'training', 'magic', 10);
    await Promise.all([first, second, third, fourth]);
    assert.deepEqual(plain(D.charById('c1').progress.schoolSkills), [
        { name: '乙', level: 20 },
        { name: '甲', level: 11 },
    ]);
    assert.equal(D.charById('c1').progress.training.attack, 18);
    assert.equal(D.charById('c1').progress.training.magic, 10);
    await D.saveCharacterProgress('c1', { schoolSkills: [{ name: '乙', level: 20 }] });
    const snapshot = JSON.stringify(D.state);
    await assert.rejects(D.saveCharacterValue('c1', 'schoolSkills', '甲', 12), /技能已变更/);
    assert.equal(JSON.stringify(D.state), snapshot);
});

test('单项编辑校验及持久化失败完整回滚，重试只生成一条记录', async () => {
    const D = domain();
    const snapshot = JSON.stringify(D.state);
    for (const value of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '无效', true]) {
        await assert.rejects(D.saveCharacterValue('c1', 'training', 'attack', value), /非负整数/);
    }
    await assert.rejects(D.saveCharacterValue('missing', 'qianyuanPills', '', 1), /角色不存在/);
    await assert.rejects(D.saveCharacterValue('c1', 'training', 'unknown', 1), /未知/);
    await assert.rejects(D.saveCharacterValue('c1', 'note', '', 1), /未知/);
    D.persist = async () => {
        throw new Error('模拟快捷写入失败');
    };
    await assert.rejects(D.saveCharacterValue('c1', 'training', 'attack', 18), /写入失败/);
    assert.equal(JSON.stringify(D.state), snapshot);
    D.persist = async () => {};
    await D.saveCharacterValue('c1', 'training', 'attack', 18);
    assert.equal(D.charById('c1').progress.training.attack, 18);
    assert.equal(D.charById('c1').growthHistory.length, 1);
});

test('旧角色养成为空，未知等级与明确录入的 0 分开，归一化不修改输入', () => {
    const D = domain();
    assert.equal(D.charById('c1').progress.training.attack, null);
    assert.equal(D.charById('c1').progress.qianyuanPills, null);
    const original = {
        schemaVersion: 4,
        characters: [
            {
                id: 'c3',
                name: '空档案',
                progress: {
                    schoolSkills: [
                        { name: ' 技能一 ', level: '0' },
                        { name: '', level: 1 },
                        { name: '未知', level: -1 },
                    ],
                    auxiliarySkills: '旧错误数据',
                    training: { attack: 0, magic: 1.2, defense: true },
                    qianyuanPills: '',
                    potentialFruits: 0,
                },
            },
        ],
    };
    const snapshot = JSON.stringify(original);
    const state = D.normalize(original);
    assert.equal(JSON.stringify(original), snapshot);
    const progress = state.characters[0].progress;
    assert.deepEqual(plain(progress.schoolSkills), [
        { name: '技能一', level: 0 },
        { name: '未知', level: null },
    ]);
    assert.deepEqual(plain(progress.auxiliarySkills), []);
    assert.equal(progress.training.attack, 0);
    assert.equal(progress.training.magic, null);
    assert.equal(progress.training.defense, null);
    assert.equal(progress.qianyuanPills, null);
    assert.equal(progress.potentialFruits, 0);
    assert.deepEqual(plain(D.normalize(state)), plain(state));
});

test('技能、人物与召唤兽修炼、养成数量独立保存，备份往返完整保留', async () => {
    const D = domain();
    const other = JSON.stringify(D.charById('c2'));
    const input = {
        schoolSkills: [
            { name: '为官之道', level: 119 },
            { name: '未点技能', level: '' },
        ],
        auxiliarySkills: [{ name: '自定义辅助技能', level: 0 }],
        training: { attack: 17, hunting: 0 },
        petTraining: { attack: 15, resistance: 10 },
        qianyuanPills: 3,
        potentialFruits: 100,
        note: '经脉：浴血豪侠\n坐骑成长 2.3',
    };
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
    await D.saveCharacterProgress('c1', {
        schoolSkills: [{ name: '为官之道', level: 119 }],
        auxiliarySkills: [{ name: '强身术', level: 120 }],
    });
    await D.saveCharacter(
        { name: ' 新昵称 ', level: 129, school: '大唐官府', server: '紫禁城' },
        'c1',
    );
    assert.equal(D.charById('c1').name, '新昵称');
    assert.equal(D.charById('c1').equipmentSets[0].slots['武器'], 'sword');
    assert.equal(D.charById('c1').progress.schoolSkills[0].level, 119);
    await D.saveCharacterProgress('c1', { schoolSkills: [] });
    assert.equal(D.charById('c1').progress.schoolSkills.length, 0);
    assert.equal(D.charById('c1').progress.auxiliarySkills[0].name, '强身术');
    const created = await D.saveCharacter({ name: '新角色', level: '', school: '普陀山' });
    assert.equal(created.level, null);
    assert.equal(created.equipmentSets.length, 3);
});

test('拒绝负数、小数、重复或空技能名，不改变原档案', async () => {
    const D = domain();
    const snapshot = JSON.stringify(D.state);
    for (const changes of [
        { schoolSkills: [{ name: '', level: 1 }] },
        { auxiliarySkills: [{ name: '强身术', level: -1 }] },
        {
            schoolSkills: [
                { name: '同名', level: 1 },
                { name: ' 同名 ', level: 2 },
            ],
        },
        { training: { attack: 1.5 } },
        { petTraining: { attack: true } },
        { potentialFruits: -1 },
        { qianyuanPills: Infinity },
        { qianyuanPills: Number.MAX_SAFE_INTEGER + 1 },
        { unknown: 1 },
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
    D.persist = async () => {
        throw new Error('模拟写入失败');
    };
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
    D.state.transactions = [
        { id: 't1', characterId: 'c1' },
        { id: 't2', characterId: 'c2' },
    ];
    D.state.sessions = [{ id: 's1', characterId: 'c1' }];
    D.state.goals = [{ id: 'g1', characterId: 'c1' }];
    D.state.gearLogs = [{ id: 'l1', equipmentId: 'sword', characterId: 'c1' }];
    D.state.activeSession = { id: 'active', characterId: 'c1' };
    const snapshot = JSON.stringify(D.state);
    D.persist = async () => {
        throw new Error('模拟删除失败');
    };
    await assert.rejects(D.removeCharacter('c1'), /删除失败/);
    assert.equal(JSON.stringify(D.state), snapshot);
    D.persist = async () => {};
    await D.removeCharacter('c1');
    assert.equal(D.state.characters.length, 1);
    assert.equal(D.state.characters[0].id, 'c2');
    assert.equal(D.state.transactions.length, 1);
    assert.equal(D.state.transactions[0].id, 't2');
    for (const key of ['equipment', 'gearLogs', 'sessions', 'goals'])
        assert.equal(D.state[key].length, 0);
    assert.equal(D.state.activeSession, null);
});

test('统一档案一次保存基础与全部养成，非法数据和写入失败均整体回滚', async () => {
    const D = domain();
    const before = JSON.stringify(D.state);
    const data = {
        name: '统一编辑',
        level: 129,
        school: '大唐官府',
        server: '紫禁城',
        progress: {
            schoolSkills: [{ name: '为官之道', level: 139 }],
            auxiliarySkills: [{ name: '强身术', level: 0 }],
            training: { attack: 17 },
            petTraining: { attack: 15 },
            qianyuanPills: 3,
            potentialFruits: 100,
            note: '完整档案',
        },
    };
    await assert.rejects(
        D.saveCharacter({ ...data, progress: { ...data.progress, potentialFruits: -1 } }, 'c1'),
        /整数/,
    );
    assert.equal(JSON.stringify(D.state), before);
    D.persist = async () => {
        throw new Error('写入失败');
    };
    await assert.rejects(D.saveCharacter(data, 'c1'), /写入失败/);
    assert.equal(JSON.stringify(D.state), before);
    let writes = 0;
    D.persist = async () => {
        writes++;
    };
    await D.saveCharacter(data, 'c1');
    assert.equal(writes, 1);
    assert.equal(D.charById('c1').name, '统一编辑');
    assert.equal(D.charById('c1').progress.schoolSkills[0].level, 139);
    assert.equal(D.charById('c1').progress.auxiliarySkills[0].level, 0);
    assert.equal(D.charById('c1').progress.petTraining.attack, 15);
    assert.equal(D.charById('c1').progress.potentialFruits, 100);
});

test('角色拖动使用同一列表，编辑不重排，新角色在首位且备份恢复保留顺序', async () => {
    const D = domain();
    D.charById('c1').createdAt = 1;
    D.charById('c2').createdAt = 2;
    const ids = () =>
        D.orderedCharacters()
            .map((item) => item.id)
            .join(',');
    assert.equal(ids(), 'c2,c1');
    const third = await D.saveCharacter({ name: '第三位' });
    assert.equal(ids(), third.id + ',c2,c1');
    await D.saveCharacterOrder('c1', { targetId: third.id, position: 'before' });
    assert.equal(ids(), 'c1,' + third.id + ',c2');
    await D.saveCharacterOrder('c2', { targetId: 'c1', position: 'after' });
    assert.equal(ids(), 'c1,c2,' + third.id);
    await D.saveCharacter({ name: '改名' }, 'c2');
    assert.equal(ids(), 'c1,c2,' + third.id);
    D.state = D.normalize(plain(D.state));
    assert.equal(ids(), 'c1,c2,' + third.id);
    await D.saveCharacterOrder('c1', { targetId: third.id, position: 'after' });
    assert.equal(ids(), 'c2,' + third.id + ',c1');
    const fourth = await D.saveCharacter({ name: '第四位' });
    assert.equal(ids(), fourth.id + ',c2,' + third.id + ',c1');
    assert.deepEqual(plain(D.normalize(plain(D.state))), plain(D.state));
});

test('拖动排序校验及写入失败恢复原顺序、档案和装备，队列读取最新位置', async () => {
    const D = domain();
    const before = JSON.stringify(D.state);
    for (const change of [
        { position: -1 },
        { targetId: 'missing', position: 'before' },
        { targetId: 'c1', position: 'before' },
        { targetId: 'c2', position: 'invalid' },
        { targetId: 'c2', position: 'before', visibleIds: ['c1', 'c1'] },
    ]) {
        await assert.rejects(D.saveCharacterOrder('c1', change));
        assert.equal(JSON.stringify(D.state), before);
    }
    await assert.rejects(
        D.saveCharacterOrder('missing', { targetId: 'c2', position: 'before' }),
        /不存在/,
    );
    D.persist = async () => {
        throw new Error('排序写入失败');
    };
    await assert.rejects(
        D.saveCharacterOrder('c1', { targetId: 'c2', position: 'after' }),
        /排序写入失败/,
    );
    assert.equal(JSON.stringify(D.state), before);
    D.persist = async () => {};
    await Promise.all([
        D.saveCharacterOrder('c1', { targetId: 'c2', position: 'after' }),
        D.saveCharacterOrder('c1', { targetId: 'c2', position: 'before' }),
    ]);
    assert.equal(D.orderedCharacters()[0].id, 'c1');
    assert.equal(D.state.equipment[0].id, 'sword');
    assert.equal(D.charById('c1').growthHistory.length, 0);
});

test('旧角色与目标置顶按原显示顺序合并为自由排序，归一化幂等且不修改备份', async () => {
    const D = domain();
    const items = [
        { id: 'a', name: 'A', pinned: false, sortOrder: 0 },
        { id: 'b', name: 'B', pinned: true, sortOrder: 1 },
        { id: 'c', name: 'C', pinned: true, sortOrder: 0 },
        { id: 'd', name: 'D', pinned: false, sortOrder: 1 },
    ];
    const input = {
        characters: items,
        goals: items.map((item) => ({ ...item, title: item.name })),
    };
    const before = JSON.stringify(input);
    D.state = D.normalize(input);
    assert.equal(
        D.orderedCharacters()
            .map((item) => item.id)
            .join(''),
        'cbad',
    );
    assert.equal(
        D.orderedGoals()
            .map((item) => item.id)
            .join(''),
        'cbad',
    );
    assert.ok(
        D.state.characters.concat(D.state.goals).every((item) => !Object.hasOwn(item, 'pinned')),
    );
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(plain(D.normalize(plain(D.state))), plain(D.state));
    await D.saveCharacterOrder('a', { targetId: 'c', position: 'before' });
    await D.saveGoalOrder('d', { targetId: 'b', position: 'before' });
    assert.equal(
        D.orderedCharacters()
            .map((item) => item.id)
            .join(''),
        'acbd',
    );
    assert.equal(
        D.orderedGoals()
            .map((item) => item.id)
            .join(''),
        'cdba',
    );
});

test('编辑与养成保存不执行新建角色的排序计算', async () => {
    const D = domain();
    D.orderedCharacters = () => {
        throw new Error('不应重排角色');
    };
    await D.saveCharacter({ name: '更新昵称' }, 'c1');
    await D.saveCharacterProgress('c1', { qianyuanPills: 3 });
    assert.equal(D.charById('c1').progress.qianyuanPills, 3);
});
