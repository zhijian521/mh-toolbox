// @ts-check

/**
 * 生成 README 用的界面截图。
 *
 * 为什么单独写一份合成数据，而不是复制自己机器上的 `data.json`：
 * 真实手账里有服务器、角色名和每一笔收支，进公开仓库不合适；截图也会随当天的记录
 * 变化，下次想重拍就拍不回同一张。这里的种子数据全部是编的，只求「每一页都不空」，
 * 日期按运行当天往前推，所以什么时候跑都是「最近两周」的样子。
 *
 * 用法（必须先 build，脚本读 dist/renderer）：
 *
 *     npm run build
 *     node_modules/electron/dist/electron.exe --no-sandbox --disable-gpu \
 *         scripts/capture-shots.cjs
 *
 * 输出：`docs/screenshots/*.png`，宽 1280。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const VIEW = { width: 1400, height: 880 };

/* ---------- 日期：全部相对运行当天，截图不会随月份失效 ---------- */

const TODAY = new Date();
/** @param {number} offset 往前推几天 */
function day(offset) {
    const date = new Date(TODAY.getTime() - offset * 86400000);
    return date.toISOString().slice(0, 10);
}
/** @param {number} offset 往前推几天，返回毫秒时间戳 */
const stamp = (offset) => TODAY.getTime() - offset * 86400000;

/* ---------- 角色 ---------- */

/**
 * @param {object} spec
 * @param {string} spec.id
 * @param {string} spec.name
 * @param {string} spec.school
 * @param {number} spec.level
 * @param {string[]} spec.skills
 * @param {object} spec.training
 * @param {number} spec.sort
 */
function character({ id, name, school, level, skills, training, sort }) {
    return {
        id,
        createdAt: stamp(90 - sort * 10),
        name,
        level,
        school,
        server: sort === 2 ? '生日快乐' : '紫禁城',
        progress: {
            schoolSkills: skills.map((skill, index) => ({ name: skill, level: 150 - index * 5 })),
            auxiliarySkills: [
                { name: '强身术', level: 120 - sort * 18 },
                { name: '冥想', level: 100 - sort * 20 },
                { name: '神速', level: 80 - sort * 15 },
                { name: '健身术', level: 60 - sort * 12 },
                { name: '养生之道', level: 45 - sort * 8 },
                { name: '烹饪技巧', level: 30 + sort * 4 },
            ],
            training,
            petTraining: { attack: 15 - sort * 3, magic: 10, defense: 10, resistance: 10 },
            qianyuanPills: 3 - sort,
            potentialFruits: 120 - sort * 30,
            note: sort === 0 ? '主号，每天两小时，慢慢养成。' : '',
        },
        equipmentSets: [
            { name: '日常', slots: {} },
            { name: '副本', slots: {} },
            { name: '帮战', slots: {} },
        ],
        viewedEquipmentSet: 0,
        pendingEquipmentSlots: [],
        soulJade: {
            unlocked: sort === 0,
            attribute: ['气血回复效果', '抵抗封印命中率', '抗物理暴击率'][sort] || '气血回复效果',
            level: sort === 0 ? 2 : 0,
        },
        sortOrder: sort,
        growthHistory: [],
    };
}

const characters = [
    character({
        id: 'c1',
        name: '归岚',
        school: '五庄观',
        level: 130,
        sort: 0,
        skills: ['周易学', '潇湘仙雨', '乾坤袖', '修仙术', '混元道果', '明性修身', '七星遁'],
        training: { attack: 10, magic: 5, defense: 5, resistance: 5, hunting: 5 },
    }),
    character({
        id: 'c2',
        name: '听雪',
        school: '普陀山',
        level: 129,
        sort: 1,
        skills: ['灵性', '护法金刚', '莲花宝座', '五行学说', '观音咒', '金刚经', '五行扭转'],
        training: { attack: 5, magic: 8, defense: 6, resistance: 6, hunting: 4 },
    }),
    character({
        id: 'c3',
        name: '长风',
        school: '大唐官府',
        level: 109,
        sort: 2,
        skills: ['为官之道', '无双一击', '神兵鉴赏', '疾风步', '十方无敌', '紫薇之术', '文韬武略'],
        training: { attack: 8, magic: 2, defense: 4, resistance: 4, hunting: 3 },
    }),
];

/* ---------- 装备 ---------- */

/** 结构化属性：`base` 主属性、`extra` 双加 / 附加、`bonus` 宝石属性。 */
function detail({ base = [], extra = [], bonus = [], ...rest }) {
    return {
        version: 1,
        base,
        extra,
        bonus,
        melt: [],
        technique: '',
        effects: [],
        forge: null,
        gems: [],
        clock: { name: '', level: null },
        suit: '',
        element: '',
        durability: 300,
        repair: 0,
        maker: '',
        runes: '',
        jade: { dust: null, assault: '', chance: null, holes: 0, enchantments: [] },
        legacy: '',
        ...rest,
    };
}

const row = (/** @type {string} */ key, /** @type {number} */ value) => ({
    key,
    value,
    boost: null,
});

/**
 * @param {object} spec
 * @param {string} spec.id
 * @param {string} spec.slot
 * @param {string} spec.name
 * @param {number} spec.level
 * @param {string} spec.characterId
 * @param {string} spec.attributes
 * @param {any} [spec.details]
 * @param {any} [spec.jade]
 */
function equipment({ id, slot, name, level, characterId, attributes, details, jade }) {
    return {
        id,
        createdAt: stamp(30),
        characterId,
        slot,
        name,
        level,
        attributes,
        special: details?.technique || '',
        gems: details?.gems?.length ? `${details.forge ?? ''} 段 ${details.gems[0].type}` : '',
        note: '',
        status: 'active',
        ocrText: '',
        details,
        ...(jade ? { jade } : {}),
    };
}

const equipmentList = [
    equipment({
        id: 'e1',
        slot: '武器',
        name: '飞龙在天',
        level: 130,
        characterId: 'c1',
        attributes: '命中+712 伤害+508\n体质+39 力量+28\n锻炼 5 段 红玛瑙',
        details: detail({
            base: [row('damage', 508), row('hit', 712)],
            extra: [row('constitution', 39), row('strength', 28)],
            technique: '破血狂攻',
            effects: ['永不磨损'],
            forge: 5,
            gems: [{ type: '红玛瑙', level: 5 }],
            maker: '打铁铺·老张',
        }),
    }),
    equipment({
        id: 'e2',
        slot: '头盔',
        name: '碧海生潮',
        level: 130,
        characterId: 'c1',
        attributes: '防御+86 魔法+280\n月亮石 4 段',
        details: detail({
            base: [row('defense', 86), row('mp', 280)],
            effects: ['简易'],
            forge: 4,
            gems: [{ type: '月亮石', level: 4 }],
        }),
    }),
    equipment({
        id: 'e3',
        slot: '项链',
        name: '同心锁',
        level: 130,
        characterId: 'c1',
        attributes: '灵力+196\n舍利子 5 段',
        details: detail({
            base: [row('spirit', 196)],
            forge: 5,
            gems: [{ type: '舍利子', level: 5 }],
        }),
    }),
    equipment({
        id: 'e4',
        slot: '衣服',
        name: '蝉翼金丝甲',
        level: 130,
        characterId: 'c1',
        attributes: '防御+238\n耐力+34 敏捷+26\n月亮石 4 段',
        details: detail({
            base: [row('defense', 238)],
            extra: [row('endurance', 34), row('agility', 26)],
            technique: '野兽之力',
            effects: ['精致'],
            forge: 4,
            gems: [{ type: '月亮石', level: 4 }],
        }),
    }),
    equipment({
        id: 'e5',
        slot: '腰带',
        name: '兽王腰带',
        level: 130,
        characterId: 'c1',
        attributes: '防御+68 气血+360\n愤怒',
        details: detail({
            base: [row('defense', 68), row('hp', 360)],
            effects: ['愤怒'],
            forge: 3,
            gems: [{ type: '光芒石', level: 3 }],
        }),
    }),
    equipment({
        id: 'e6',
        slot: '鞋子',
        name: '九州履',
        level: 130,
        characterId: 'c1',
        attributes: '防御+62 敏捷+42\n黑宝石 4 段',
        details: detail({
            base: [row('defense', 62), row('agility', 42)],
            effects: ['迷踪'],
            forge: 4,
            gems: [{ type: '黑宝石', level: 4 }],
        }),
    }),
    equipment({
        id: 'e7',
        slot: '戒指',
        name: '芙蓉戒',
        level: 120,
        characterId: 'c1',
        attributes: '伤害+38\n物理暴击等级+18',
        details: detail({
            // 灵饰的主属性只有一条，多写的会被判成「原有属性」整段退回去。
            base: [row('damage', 38)],
            extra: [row('physicalCrit', 18)],
            forge: 3,
        }),
    }),
    equipment({
        id: 'e8',
        slot: '耳饰',
        name: '明月档',
        level: 120,
        characterId: 'c1',
        attributes: '法术伤害+42\n法术暴击等级+16',
        details: detail({
            base: [row('spellDamage', 42)],
            extra: [row('spellCrit', 16)],
            forge: 2,
        }),
    }),
    equipment({
        id: 'e9',
        slot: '手镯',
        name: '墨影扣',
        level: 120,
        characterId: 'c1',
        attributes: '封印命中等级+46\n气血+180',
        details: detail({
            base: [row('seal', 46)],
            extra: [row('hp', 180)],
            forge: 2,
        }),
    }),
    equipment({
        id: 'e10',
        slot: '佩饰',
        name: '逸云佩',
        level: 120,
        characterId: 'c1',
        attributes: '速度+28\n防御+44',
        details: detail({
            base: [row('speed', 28)],
            extra: [row('defense', 44)],
            forge: 2,
        }),
    }),
    equipment({
        id: 'e11',
        slot: '玉魄·阳',
        name: '上古玉魄·阳',
        level: 0,
        characterId: 'c1',
        attributes: '伤害+26\n物理暴击等级+14',
        jade: {
            base: '伤害+26',
            extra1: '物理暴击等级+14',
            extra2: '',
            dustLevel: 8,
            holes: 2,
            enchantments: ['奇袭特技：破血狂攻', ''],
            durability: 160,
        },
        details: detail({
            base: [row('damage', 26)],
            extra: [row('physicalCrit', 14)],
            jade: {
                dust: 8,
                assault: '奇袭法术',
                chance: 0.5,
                holes: 2,
                enchantments: ['奇袭特技：破血狂攻', ''],
            },
        }),
    }),
    equipment({
        id: 'e12',
        slot: '玉魄·阴',
        name: '上古玉魄·阴',
        level: 0,
        characterId: 'c1',
        attributes: '气血+240\n抗物理暴击等级+12',
        jade: {
            base: '气血+240',
            extra1: '抗物理暴击等级+12',
            extra2: '',
            dustLevel: 6,
            holes: 1,
            enchantments: ['奇袭道具：金柳露'],
            durability: 160,
        },
        details: detail({
            base: [row('hp', 240)],
            extra: [row('resistPhysicalCrit', 12)],
            jade: {
                dust: 6,
                assault: '奇袭道具',
                chance: 0.3,
                holes: 1,
                enchantments: ['奇袭道具：金柳露'],
            },
        }),
    }),
    // 听雪：只穿了半套，仓库里另有备用件，装备页的两个「未配置」格刚好能看见。
    equipment({
        id: 'e13',
        slot: '武器',
        name: '玉净瓶',
        level: 130,
        characterId: 'c2',
        attributes: '命中+640 伤害+420\n敏捷+30',
        details: detail({
            base: [row('damage', 420), row('hit', 640)],
            extra: [row('agility', 30)],
            technique: '凝气诀',
            forge: 3,
            gems: [{ type: '太阳石', level: 3 }],
        }),
    }),
    equipment({
        id: 'e14',
        slot: '衣服',
        name: '云锦天衣',
        level: 130,
        characterId: 'c2',
        attributes: '防御+226\n体质+30 魔力+24',
        details: detail({
            base: [row('defense', 226)],
            extra: [row('constitution', 30), row('magic', 24)],
            forge: 3,
            gems: [{ type: '月亮石', level: 3 }],
        }),
    }),
    equipment({
        id: 'e15',
        slot: '项链',
        name: '菩提珠串',
        level: 120,
        characterId: 'c2',
        attributes: '灵力+178',
        details: detail({ base: [row('spirit', 178)], effects: ['神农'] }),
    }),
    // 仓库里的备用件：不挂在任何方案上，状态是「未配置」。
    equipment({
        id: 'e16',
        slot: '鞋子',
        name: '踏云靴',
        level: 120,
        characterId: 'c1',
        attributes: '防御+58 敏捷+38',
        details: detail({ base: [row('defense', 58), row('agility', 38)] }),
    }),
    equipment({
        id: 'e17',
        slot: '戒指',
        name: '青玉扳指',
        level: 100,
        characterId: 'c1',
        attributes: '伤害+30 防御+20\n物理暴击等级+12',
        details: detail({
            base: [row('damage', 30), row('defense', 20)],
            extra: [row('physicalCrit', 12)],
        }),
    }),
];

characters[0].equipmentSets[0].slots = Object.fromEntries(
    ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e11', 'e12'].map((id) => [
        equipmentList.find((item) => item.id === id).slot,
        id,
    ]),
);
characters[0].equipmentSets[1].slots = { 武器: 'e1', 头盔: 'e2', 衣服: 'e4' };
characters[1].equipmentSets[0].slots = { 武器: 'e13', 衣服: 'e14', 项链: 'e15' };

/* ---------- 流水：收益账本与账号账本各一套 ---------- */

const itemRecords = [
    { itemId: 1, name: '60武器', qty: 4, price: 18, d: 0 },
    { itemId: 27, name: '光芒石', qty: 2, price: 3, d: 0 },
    { itemId: 17, name: '强化石', qty: 6, price: 9.2, d: 0 },
    { itemId: 7, name: '特赦令牌', qty: 1, price: 9, d: 0 },
    { itemId: 20, name: '修炼果', qty: 1, price: 83, d: 0 },
    { itemId: 3, name: '80武器', qty: 3, price: 48, d: 1 },
    { itemId: 8, name: '金刚石', qty: 1, price: 6, d: 1 },
    { itemId: 13, name: '金柳露', qty: 2, price: 8, d: 1 },
    { itemId: 36, name: '月华露', qty: 3, price: 4.5, d: 2 },
    { itemId: 22, name: '黑宝石', qty: 1, price: 62, d: 2 },
    { itemId: 2, name: '70武器', qty: 5, price: 13, d: 3 },
    { itemId: 24, name: '太阳石', qty: 2, price: 11, d: 3 },
    { itemId: 18, name: '摇钱树苗', qty: 2, price: 26, d: 4 },
    { itemId: 40, name: '种子', qty: 4, price: 5, d: 4 },
    { itemId: 101, name: '高级兽决', qty: 1, price: 620, d: 5 },
    { itemId: 17, name: '强化石', qty: 8, price: 9, d: 5 },
    { itemId: 6, name: '80装备', qty: 2, price: 34, d: 6 },
    { itemId: 29, name: '星辉石', qty: 3, price: 41, d: 7 },
];

const transactions = itemRecords.map((record, index) => ({
    id: 't-item-' + index,
    createdAt: stamp(record.d),
    ledger: 'earnings',
    recordType: 'item',
    characterId: ['c1', 'c2', 'c3'][index % 3],
    date: day(record.d),
    kind: 'income',
    currency: 'cash',
    amount: Number((record.qty * record.price).toFixed(2)),
    category: '物品掉落',
    channel: '游戏内',
    minutes: 0,
    note: record.name,
    source: 'quick',
    itemId: record.itemId,
    itemName: record.name,
    quantity: record.qty,
    unitPrice: record.price,
    status: 'held',
    fee: 0,
}));

/** 日常金币收入与点卡支出：收益页的「按天分账」靠它们才有进有出。 */
const dailyMoney = [
    { d: 0, kind: 'income', amount: 260, note: '抓鬼 + 环奖励', characterId: 'c1' },
    { d: 0, kind: 'expense', amount: 15, note: '点卡 1 张', characterId: 'c1' },
    { d: 1, kind: 'income', amount: 310, note: '封妖', characterId: 'c2' },
    { d: 1, kind: 'expense', amount: 15, note: '点卡 1 张', characterId: 'c2' },
    { d: 2, kind: 'income', amount: 180, note: '师门任务', characterId: 'c3' },
    { d: 2, kind: 'expense', amount: 30, note: '点卡 2 张', characterId: 'c3' },
    { d: 3, kind: 'income', amount: 220, note: '环任务', characterId: 'c1' },
    { d: 4, kind: 'income', amount: 140, note: '帮派任务', characterId: 'c2' },
    { d: 4, kind: 'expense', amount: 15, note: '点卡 1 张', characterId: 'c2' },
    { d: 5, kind: 'income', amount: 320, note: '抓鬼', characterId: 'c1' },
    { d: 6, kind: 'income', amount: 190, note: '副本收货', characterId: 'c3' },
    { d: 7, kind: 'expense', amount: 15, note: '点卡 1 张', characterId: 'c1' },
];

transactions.push(
    ...dailyMoney.map((entry, index) => ({
        id: 't-money-' + index,
        createdAt: stamp(entry.d),
        ledger: 'earnings',
        recordType: 'money',
        characterId: entry.characterId,
        date: day(entry.d),
        kind: entry.kind,
        currency: 'cash',
        amount: entry.amount,
        fee: 0,
        category: entry.kind === 'income' ? '物品掉落' : '点卡',
        channel: '游戏内',
        minutes: 0,
        note: entry.note,
        source: 'quick',
        itemId: entry.kind === 'income' ? 99 : '',
        equipmentId: '',
        gearAction: '',
    })),
);

/** 账号账本：人民币与梦幻币混着记，覆盖「养成投入 / 售出 / 点卡」三类。 */
const accountRecords = [
    {
        d: 0,
        kind: 'expense',
        currency: 'cash',
        amount: 520,
        category: '养成投入',
        note: '修炼果 ×10',
        c: 'c1',
    },
    {
        d: 0,
        kind: 'income',
        currency: 'cash',
        amount: 380,
        category: '物品掉落',
        note: '高级兽决 卖',
        c: 'c2',
    },
    {
        d: 1,
        kind: 'expense',
        currency: 'rmb',
        amount: 30,
        category: '点卡',
        note: '月卡续费',
        c: 'c1',
    },
    {
        d: 2,
        kind: 'income',
        currency: 'rmb',
        amount: 260,
        category: '售出',
        note: '卖了套 80 环装',
        c: 'c3',
    },
    {
        d: 3,
        kind: 'expense',
        currency: 'cash',
        amount: 1200,
        category: '养成投入',
        note: '兽决打书',
        c: 'c1',
    },
    {
        d: 4,
        kind: 'expense',
        currency: 'cash',
        amount: 180,
        category: '养成投入',
        note: '帮派修炼',
        c: 'c2',
    },
    {
        d: 5,
        kind: 'income',
        currency: 'cash',
        amount: 260,
        category: '物品掉落',
        note: '环装一组',
        c: 'c3',
    },
    {
        d: 6,
        kind: 'expense',
        currency: 'rmb',
        amount: 98,
        category: '养成投入',
        note: '藏宝阁点卡',
        c: 'c1',
    },
    {
        d: 7,
        kind: 'income',
        currency: 'rmb',
        amount: 120,
        category: '售出',
        note: '卖小号',
        c: 'c3',
    },
    {
        d: 8,
        kind: 'expense',
        currency: 'cash',
        amount: 640,
        category: '养成投入',
        note: '宝石收购',
        c: 'c1',
    },
];

transactions.push(
    ...accountRecords.map((entry, index) => ({
        id: 't-acc-' + index,
        createdAt: stamp(entry.d),
        ledger: 'account',
        recordType: 'money',
        characterId: entry.c,
        date: day(entry.d),
        kind: entry.kind,
        currency: entry.currency,
        amount: entry.amount,
        fee: 0,
        category: entry.category,
        channel: entry.currency === 'rmb' ? '藏宝阁' : '游戏内',
        minutes: 0,
        note: entry.note,
        equipmentId: '',
        gearAction: '',
    })),
);

/* ---------- 在线计时 ---------- */

const sessions = [
    { d: 0, start: 20.2, minutes: 96, accounts: 2, c: 'c1' },
    { d: 0, start: 15.4, minutes: 42, accounts: 1, c: 'c2' },
    { d: 1, start: 21, minutes: 128, accounts: 2, c: 'c1' },
    { d: 2, start: 19.6, minutes: 74, accounts: 1, c: 'c3' },
    { d: 3, start: 20.5, minutes: 110, accounts: 2, c: 'c1' },
    { d: 4, start: 14.8, minutes: 58, accounts: 1, c: 'c2' },
    { d: 5, start: 20.0, minutes: 132, accounts: 2, c: 'c1' },
    { d: 6, start: 19.2, minutes: 88, accounts: 1, c: 'c3' },
].map((entry, index) => {
    // 20.2 表示当天 20 点 12 分；用 UTC 反推，避免截图机器的时区影响相对关系。
    const base = new Date(TODAY.getTime() - entry.d * 86400000);
    base.setHours(Math.floor(entry.start), Math.round((entry.start % 1) * 60), 0, 0);
    const startAt = base.getTime();
    return {
        id: 's-' + index,
        createdAt: startAt,
        source: 'timer',
        characterId: entry.c,
        startAt,
        accounts: entry.accounts,
        cardPrice: 15000,
        mode: 'range',
        endAt: startAt + Math.round(entry.minutes * 60000),
        minutes: entry.minutes,
        date: day(entry.d),
        cost: Number(((entry.minutes / 60) * (15000 / 10000) * entry.accounts).toFixed(2)),
    };
});

/* ---------- 目标 ---------- */

const goals = [
    {
        id: 'g1',
        type: 'progress',
        title: '全部角色 · 强身术达到 120 级',
        tracking: { category: 'auxiliarySkills', key: '强身术' },
        target: 120,
        current: 0,
        baseProgress: 0,
        unit: '级',
        status: 'active',
        sortOrder: 0,
    },
    {
        id: 'g2',
        type: 'progress',
        title: '全部角色 · 攻击修炼达到 15 级',
        tracking: { category: 'training', key: 'attack' },
        target: 15,
        current: 0,
        baseProgress: 0,
        unit: '级',
        status: 'active',
        sortOrder: 1,
    },
    {
        id: 'g3',
        type: 'progress',
        title: '归岚 · 师门技能满 150 级',
        characterId: 'c1',
        tracking: { category: 'schoolSkills', key: '修仙术' },
        target: 150,
        current: 0,
        baseProgress: 0,
        unit: '级',
        status: 'active',
        sortOrder: 2,
    },
    {
        id: 'g4',
        type: 'money',
        title: '存够一套 130 装备的钱',
        target: 8000,
        current: 3200,
        baseProgress: 0,
        unit: '万',
        status: 'active',
        sortOrder: 3,
        logs: [
            { id: 'gl1', date: day(12), amount: 1200, note: '卖 80 环装' },
            { id: 'gl2', date: day(6), amount: 1100, note: '卖兽决' },
            { id: 'gl3', date: day(2), amount: 900, note: '日常结余' },
        ],
    },
    {
        id: 'g5',
        type: 'gear',
        title: '攒一件 130 的不磨衣服',
        target: 4500,
        current: 1500,
        baseProgress: 0,
        unit: '万',
        status: 'active',
        sortOrder: 4,
        note: '先看藏宝阁，价格合适就入手。',
        logs: [],
    },
    {
        id: 'g6',
        type: 'progress',
        title: '全部角色 · 冥想达到 100 级',
        tracking: { category: 'auxiliarySkills', key: '冥想' },
        target: 100,
        current: 0,
        baseProgress: 0,
        unit: '级',
        status: 'active',
        sortOrder: 5,
    },
    {
        id: 'g7',
        type: 'progress',
        title: '全部角色 · 防御修炼达到 10 级',
        tracking: { category: 'training', key: 'defense' },
        target: 10,
        current: 0,
        baseProgress: 0,
        unit: '级',
        status: 'done',
        sortOrder: 6,
    },
].map((goal) => ({
    createdAt: stamp(40),
    current: 0,
    baseProgress: 0,
    status: 'active',
    logs: [],
    characterId: 'all',
    deadline: '',
    note: '',
    ...goal,
}));

/* ---------- 物价 ---------- */

/** 每条价格都带一点波动，折线才不是一条直线。 */
function logs(/** @type {number[]} */ prices) {
    return prices.map((price, index) => ({
        id: `p-${logsSeed}-${index}`,
        date: day((prices.length - 1 - index) * 3),
        price,
        note: '',
        createdAt: stamp((prices.length - 1 - index) * 3),
    }));
}
let logsSeed = 0;

const priceSeed = [
    { name: '特赦令牌', group: '任务产出', sub: '特赦令牌', prices: [82, 85, 88, 90, 88, 92] },
    { name: '金刚石', group: '任务产出', sub: '五宝', prices: [52, 55, 58, 57, 60, 62] },
    { name: '定魂珠', group: '任务产出', sub: '五宝', prices: [48, 50, 52, 51, 54, 55] },
    { name: '归墟·3X 捉鬼', group: '任务产出', sub: '归墟', prices: [22, 20, 21, 24, 25, 26] },
    { name: '归墟·5X 捉鬼', group: '任务产出', sub: '归墟', prices: [38, 36, 40, 42, 44, 43] },
    { name: '摇钱树苗', group: '任务产出', sub: '种子树苗', prices: [24, 26, 25, 28, 27, 26] },
    { name: '三级种子', group: '任务产出', sub: '种子树苗', prices: [4.6, 4.8, 5, 4.9, 5, 5.2] },
    { name: '碧藕', group: '任务产出', sub: '采集杂货', prices: [1.8, 2, 2.1, 2.2, 2, 2.5] },
    {
        name: '高级内丹·摧心浪',
        group: '兽决内丹',
        sub: '高级内丹',
        prices: [560, 540, 600, 620, 610, 640],
    },
    { name: '垃圾内丹', group: '兽决内丹', sub: '低级内丹', prices: [6, 6.5, 6.2, 7, 6.8, 7.2] },
    {
        name: '高级兽决·高级必杀',
        group: '兽决内丹',
        sub: '高级兽决',
        prices: [1200, 1180, 1160, 1240, 1280, 1260],
    },
    {
        name: '稀有·持国巡守',
        group: '召唤兽',
        sub: '稀有召唤兽',
        prices: [180, 175, 190, 200, 210, 205],
    },
    { name: '变异召唤兽', group: '召唤兽', sub: '变异召唤兽', prices: [45, 44, 46, 48, 47, 50] },
    { name: '珍珠·120 级', group: '打造材料', sub: '珍珠', prices: [40, 42, 41, 43, 45, 44] },
    {
        name: '珍珠·80 级',
        group: '打造材料',
        sub: '珍珠',
        prices: [12, 12.5, 13, 12.8, 13.2, 13.5],
    },
    {
        name: '月华露',
        group: '消耗补给',
        sub: '召唤兽消耗',
        prices: [4.2, 4.4, 4.5, 4.6, 4.5, 4.8],
    },
    {
        name: '130 武器书',
        group: '打造材料',
        sub: '装备书',
        prices: [260, 255, 270, 280, 275, 290],
    },
    { name: '黑宝石·8 段', group: '宝石符石', sub: '宝石', prices: [580, 600, 590, 620, 640, 650] },
].map((item) => {
    const entries = logs(item.prices);
    logsSeed += 1;
    return {
        id: 'p-' + logsSeed,
        name: item.name,
        category: item.group,
        sub: item.sub,
        unit: '个',
        note: '',
        logs: entries,
        createdAt: stamp(40),
        updatedAt: stamp(0),
    };
});
const prices = priceSeed;

/* ---------- 单价表：收益页按当前物价估算仓库里的东西 ---------- */

const itemPrices = {
    1: 180000,
    2: 130000,
    3: 480000,
    4: 120000,
    5: 90000,
    6: 340000,
    7: 900000,
    8: 620000,
    9: 550000,
    10: 450000,
    11: 500000,
    12: 300000,
    13: 80000,
    14: 260000,
    15: 40000,
    16: 90000,
    17: 92000,
    18: 260000,
    20: 830000,
    22: 620000,
    23: 210000,
    24: 110000,
    25: 190000,
    26: 240000,
    27: 30000,
    29: 410000,
    36: 45000,
    40: 50000,
    99: 100000,
    101: 6200000,
};

const data = {
    schemaVersion: 10,
    characters,
    transactions,
    goals,
    equipment: equipmentList,
    gearLogs: [],
    quickSettings: { cardPrice: 15000, cardCost: false },
    itemPrices,
    prices,
    sessions,
    activeSessions: [],
};

/* ---------- 截图 ---------- */

const PAGES = [
    { name: 'overview', route: '#/overview' },
    { name: 'income', route: '#/income' },
    { name: 'accounts', route: '#/accounts' },
    { name: 'goals', route: '#/goals' },
    { name: 'equipment', route: '#/equipment' },
    { name: 'characters', route: '#/characters' },
    { name: 'prices', route: '#/prices' },
];

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-shots-'));
app.setPath('appData', profile);
fs.mkdirSync(path.join(profile, 'mh-tool-v2'), { recursive: true });
fs.writeFileSync(path.join(profile, 'mh-tool-v2', 'data.json'), JSON.stringify(data, null, 1));

require(path.join(ROOT, 'src/main/main.cjs'));

const wait = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

app.whenReady().then(async () => {
    const log = [];
    try {
        await wait(2000);
        const win = BrowserWindow.getAllWindows()[0];
        win.setContentSize(VIEW.width, VIEW.height);
        fs.mkdirSync(OUT, { recursive: true });
        let sharp;
        try {
            sharp = require('sharp');
        } catch {
            sharp = null;
        }
        for (const page of PAGES) {
            await win.webContents.executeJavaScript(
                `location.hash = ${JSON.stringify(page.route)}`,
            );
            await wait(1300);
            const image = await win.webContents.capturePage();
            const file = path.join(OUT, page.name + '.png');
            const buffer = image.toPNG();
            // 原始截图是 1x 的 1400×880；缩到 1280 宽再压一次，单张两三百 KB，README 加载不肉。
            if (sharp) {
                await sharp(buffer)
                    .resize({ width: 1280 })
                    .png({ palette: true, quality: 92, compressionLevel: 9 })
                    .toFile(file);
            } else {
                fs.writeFileSync(file, buffer);
            }
            log.push(`${page.name}: ${Math.round(fs.statSync(file).size / 1024)} KB`);
        }
        // 深色主题再来一张总览：README 里用来说明三档外观。
        require('electron').nativeTheme.themeSource = 'dark';
        await win.webContents.executeJavaScript('location.hash = "#/overview"');
        await wait(1200);
        const dark = await win.webContents.capturePage();
        const darkFile = path.join(OUT, 'overview-dark.png');
        if (sharp) {
            await sharp(dark.toPNG())
                .resize({ width: 1280 })
                .png({ palette: true, quality: 92, compressionLevel: 9 })
                .toFile(darkFile);
        } else {
            fs.writeFileSync(darkFile, dark.toPNG());
        }
        log.push(`overview-dark: ${Math.round(fs.statSync(darkFile).size / 1024)} KB`);
        console.log(log.join('\n'));
    } catch (error) {
        console.error(error && error.stack ? error.stack : error);
        process.exitCode = 1;
    }
    app.exit(process.exitCode || 0);
});
