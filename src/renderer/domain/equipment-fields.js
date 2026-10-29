// @ts-check
/** @typedef {Partial<Domain> & ThisType<Domain>} FieldsMixin */

/**
 * @param {Domain} D
 * @param {unknown} _U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, _U, _gateway, _localStorage) {
    /* 装备规则、结构化属性与旧文本适配。显示值按原样记录，不反算宝石或灵尘。 */
    Object.assign(
        D,
        /** @type {FieldsMixin} */ ({
            equipmentStats: {
                hit: '命中',
                damage: '伤害',
                defense: '防御',
                hp: '气血',
                mp: '魔法',
                spirit: '灵力',
                dodge: '躲避',
                constitution: '体质',
                magic: '魔力',
                strength: '力量',
                endurance: '耐力',
                agility: '敏捷',
                speed: '速度',
                spellDamage: '法术伤害',
                spellDefense: '法术防御',
                fixedDamage: '固定伤害',
                healing: '治疗能力',
                seal: '封印命中等级',
                resistSeal: '抵抗封印等级',
                physicalCrit: '物理暴击等级',
                spellCrit: '法术暴击等级',
                rage: '狂暴等级',
                pierce: '穿刺等级',
                block: '格挡值',
                recovery: '气血回复效果',
                resistPhysicalCrit: '抗物理暴击等级',
                resistSpellCrit: '抗法术暴击等级',
            },
            equipmentTechniques: [
                '气归术',
                '命归术',
                '凝气诀',
                '凝神诀',
                '气疗术',
                '心疗术',
                '命疗术',
                '四海升平',
                '回魂咒',
                '起死回生',
                '慈航普度',
                '水清诀',
                '冰清诀',
                '玉清诀',
                '晶清诀',
                '野兽之力',
                '魔兽之印',
                '光辉之甲',
                '圣灵之甲',
                '流云诀',
                '啸风诀',
                '太极护法',
                '罗汉金钟',
                '修罗咒',
                '天衣无缝',
                '放下屠刀',
                '河东狮吼',
                '破甲术',
                '碎甲术',
                '凝滞术',
                '停陷术',
                '破血狂攻',
                '弱点击破',
                '破碎无双',
                '笑里藏刀',
                '绝幻魔音',
                '诅咒之伤',
                '诅咒之亡',
                '死亡之音',
                '身似菩提',
                '心如明镜',
                '移形换影',
                '凝心诀',
                '凝心决',
                '聚精会神',
                '先发制人',
                '燃烧之光',
                '毁灭之光',
                '吸血',
                '残月',
                '冥王暴杀',
                '乾坤斩',
                '帝释无双',
                '伽罗无双',
                '虚空之刃',
                '亡灵之刃',
                '金刚不坏',
                '菩提心佑',
                '金刚怒目',
                '琴音三叠',
                '乾坤挪移',
            ],
            equipmentClockEffects: [
                '回春之术',
                '健步如飞',
                '心无旁骛',
                '气血方刚',
                '锐不可当',
                '通真达灵',
                '自我陶醉',
                '柳暗花明',
                '血气方刚',
                '心源',
                '163',
                '宿敌',
                '伶俐',
                '自我激励',
            ],
            equipmentRule(slot) {
                const five = ['constitution', 'magic', 'strength', 'endurance', 'agility'];
                const attack = [
                    'damage',
                    'speed',
                    'spellDamage',
                    'fixedDamage',
                    'healing',
                    'seal',
                    'physicalCrit',
                    'spellCrit',
                    'rage',
                    'pierce',
                ];
                const defense = [
                    'hp',
                    'defense',
                    'spellDefense',
                    'resistSeal',
                    'block',
                    'recovery',
                    'resistPhysicalCrit',
                    'resistSpellCrit',
                ];
                /** @type {Record<string, any>} */
                const rules = {
                    武器: {
                        base: ['damage', 'hit'],
                        extra: five,
                        gems: ['太阳石', '红玛瑙', '神秘石'],
                    },
                    头盔: { base: ['defense', 'mp'], gems: ['月亮石', '太阳石', '红玛瑙'] },
                    项链: {
                        base: ['spirit'],
                        gems: ['舍利子', '红宝石', '黄宝石', '蓝宝石', '绿宝石'],
                    },
                    衣服: {
                        base: ['defense'],
                        extra: five,
                        gems: ['月亮石', '光芒石', '舍利子', '翡翠石'],
                    },
                    腰带: { base: ['defense', 'hp'], gems: ['光芒石', '黑宝石', '神秘石'] },
                    鞋子: {
                        base: ['defense', 'agility'],
                        gems: ['黑宝石', '神秘石', '红宝石', '黄宝石', '蓝宝石', '绿宝石'],
                    },
                    戒指: { base: ['damage', 'defense'], extra: attack, kind: 'accessory' },
                    耳饰: {
                        base: ['spellDamage', 'spellDefense'],
                        extra: attack,
                        kind: 'accessory',
                    },
                    手镯: { base: ['seal', 'resistSeal'], extra: defense, kind: 'accessory' },
                    佩饰: { base: ['speed'], extra: defense, kind: 'accessory' },
                    '玉魄·阳': {
                        base: attack.filter((key) => !['speed', 'rage', 'pierce'].includes(key)),
                        extra: attack.filter((key) => !['speed', 'rage', 'pierce'].includes(key)),
                        kind: 'jade',
                    },
                    '玉魄·阴': { base: defense, extra: defense, kind: 'jade' },
                    其他: { base: [], extra: [], kind: 'other' },
                };
                const rule = Object.assign(
                    { kind: 'gear', extra: [], gems: [] },
                    rules[slot] || rules.其他,
                );
                rule.effects =
                    rule.kind === 'gear'
                        ? [
                              '简易',
                              '无级别限制',
                              '永不磨损',
                              '精致',
                              '坚固',
                              '易修理',
                              '珍宝',
                              ...(slot === '武器' ? ['神佑', '必中', '绝杀'] : []),
                              ...(slot === '腰带' ? ['愤怒', '暴怒'] : []),
                              ...(slot === '项链' ? ['神农', '专注'] : []),
                              ...(slot === '头盔' ? ['再生'] : []),
                              ...(slot === '衣服' ? ['伪装'] : []),
                              ...(slot === '鞋子' ? ['迷踪', '狩猎'] : []),
                          ]
                        : [];
                rule.bonus =
                    {
                        武器: ['damage', 'hit', 'dodge'],
                        头盔: ['damage', 'hit', 'defense'],
                        项链: ['spirit'],
                        衣服: ['hp', 'defense', 'spirit', 'spellDefense'],
                        腰带: ['hp', 'speed', 'dodge'],
                        鞋子: ['speed', 'dodge'],
                    }[slot] || [];
                return rule;
            },
            emptyEquipmentDetails() {
                return {
                    version: 1,
                    base: [],
                    extra: [],
                    bonus: [],
                    melt: [],
                    technique: '',
                    effects: [],
                    forge: null,
                    gems: [],
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
            },
            equipmentStatText(row) {
                return (
                    this.equipmentStats[row.key] +
                    ' ' +
                    (row.value >= 0 ? '+' : '') +
                    row.value +
                    (row.boost == null ? '' : ' [' + (row.boost >= 0 ? '+' : '') + row.boost + ']')
                );
            },
            /** 只识别完整、已知名称的数值词条；无法确定的文字逐行保留。 */
            parseEquipmentStats(text) {
                const aliases = { 气血恢复效果: 'recovery', 抵抗封印命中等级: 'resistSeal' };
                const labels = Object.assign(
                    Object.fromEntries(
                        Object.entries(this.equipmentStats).map(([key, label]) => [label, key]),
                    ),
                    aliases,
                );
                /**
                 * 符号位要容得下 `±`。
                 *
                 * 截图识别会把 `治疗能力+10` 读成 `治疗能力±10`——`+` 上下各多一横就成了
                 * `±`，这一条的数值也就整行解析不出来、退化成「原有属性」。游戏文本里
                 * 不存在正负号，所以把 `±` 当加号读不会误解任何真实数据。
                 */
                const value = '([+\\-±]?\\s*\\d+(?:\\.\\d+)?)';
                const pattern = new RegExp(
                    '(' +
                        Object.keys(labels)
                            .sort((a, b) => b.length - a.length)
                            .join('|') +
                        ')\\s*[:：]?\\s*' +
                        value +
                        '(?:\\s*\\[\\s*' +
                        value +
                        '\\s*\\])?',
                    'g',
                );
                /** @param {string} text @returns {number} */
                const number = (text) => Number(text.replace(/\s/g, '').replace(/±/g, '+'));
                /** @type {EquipmentRow[]} */
                const rows = [];
                /** @type {string[]} */
                const unknown = [];
                for (const line of String(text || '')
                    .normalize('NFKC')
                    .split(/\r?\n/)
                    .filter((line) => line.trim())) {
                    let matched = false;
                    const rest = line
                        .replace(pattern, (_match, label, main, boost) => {
                            rows.push({
                                key: labels[label],
                                value: number(main),
                                boost: boost == null ? null : number(boost),
                            });
                            matched = true;
                            return '';
                        })
                        .replace(/[，,、;；\s]/g, '');
                    if (!matched || rest) unknown.push(line.trim());
                }
                return { rows, unknown };
            },
            equipmentDetails(eq) {
                if (eq.details && eq.details.version === 1)
                    return JSON.parse(JSON.stringify(eq.details));
                const detail = this.emptyEquipmentDetails(),
                    rule = this.equipmentRule(eq.slot),
                    unknown = [];
                /**
                 * @param {string} text
                 * @param {string} group
                 */
                const parseInto = (text, group) => {
                    const parsed = this.parseEquipmentStats(text);
                    parsed.rows.forEach((row) => {
                        if (group) {
                            if (rule[group].includes(row.key)) detail[group].push(row);
                            else unknown.push(this.equipmentStatText(row));
                        } else if (
                            rule.base.includes(row.key) &&
                            !detail.base.some((item) => item.key === row.key) &&
                            (rule.kind !== 'accessory' || !detail.base.length)
                        )
                            detail.base.push(row);
                        else if (
                            rule.extra.includes(row.key) &&
                            detail.extra.length < (rule.kind === 'accessory' ? 3 : 2)
                        )
                            detail.extra.push(row);
                        else if (rule.bonus.includes(row.key)) detail.bonus.push(row);
                        else unknown.push(this.equipmentStatText(row));
                    });
                    unknown.push(...parsed.unknown);
                };
                if (rule.kind === 'jade' && eq.jade) {
                    parseInto(eq.jade.base, 'base');
                    parseInto(eq.jade.extra1, 'extra');
                    parseInto(eq.jade.extra2, 'extra');
                    detail.jade = {
                        dust: eq.jade.dustLevel ?? null,
                        assault: '',
                        chance: null,
                        holes: eq.jade.holes ?? 0,
                        enchantments: (eq.jade.enchantments || []).slice(),
                    };
                    detail.durability =
                        eq.jade.durability === '' ? null : (eq.jade.durability ?? null);
                } else parseInto(eq.attributes, '');
                for (const line of String(eq.special || '')
                    .normalize('NFKC')
                    .split(/\r?\n/)
                    .filter(Boolean)) {
                    const value = line.replace(/^(?:特技|特效|玉魄特效)\s*[:：]?\s*/, '').trim();
                    const clock = value.match(/^(.+?)\s*\((\d+)级\)$/);
                    const assault = value.match(
                        /(奇袭法术|奇袭特技|奇袭道具)\s*\+?\s*(\d+(?:\.\d+)?)\s*%/,
                    );
                    if (
                        rule.kind === 'accessory' &&
                        clock &&
                        this.equipmentClockEffects.includes(clock[1])
                    )
                        detail.clock = { name: clock[1], level: Number(clock[2]) };
                    else if (rule.kind === 'jade' && assault) {
                        detail.jade.assault = assault[1];
                        detail.jade.chance = Number(assault[2]);
                    } else if (rule.kind === 'gear' && this.equipmentTechniques.includes(value))
                        detail.technique = value;
                    else if (rule.effects.includes(value)) detail.effects.push(value);
                    else unknown.push(line);
                }
                const gemText = String(eq.gems || '');
                const forge = gemText.match(/(?:锻炼|精炼|镶嵌)等级\s*[:：]?\s*(\d+)/);
                if (forge) detail.forge = Number(forge[1]);
                let remaining = gemText
                    .replace(/(?:锻炼|精炼|镶嵌)等级\s*[:：]?\s*\d+/g, '')
                    .replace(/镶嵌宝石\s*[:：]?/g, '');
                for (const type of [
                    '太阳石',
                    '红玛瑙',
                    '黑宝石',
                    '月亮石',
                    '舍利子',
                    '光芒石',
                    '神秘石',
                    '翡翠石',
                    '红宝石',
                    '黄宝石',
                    '蓝宝石',
                    '绿宝石',
                    '星辉石',
                ]) {
                    const re = new RegExp(type + '(?:\\s*[×x*]\\s*(\\d+))?', 'g');
                    remaining = remaining.replace(re, (_match, level) => {
                        if (rule.gems.includes(type))
                            detail.gems.push({ type, level: level == null ? null : Number(level) });
                        else if (rule.kind === 'accessory' && type === '星辉石') {
                            if (detail.forge === null && level != null)
                                detail.forge = Number(level);
                        } else unknown.push(_match);
                        return '';
                    });
                }
                if (remaining.replace(/[\s,，、]/g, '')) unknown.push('宝石：' + remaining.trim());
                const raw = String(eq.ocrText || '').normalize('NFKC');
                const metadata = [String(eq.note || ''), raw].join('\n');
                const element = metadata.match(/五行\s*[:：]?\s*([金木水火土])/);
                const durability = metadata.match(/耐久(?:度)?\s*[:：]?\s*(\d+)/);
                const repair = metadata.match(/修理失败\s*(\d+)\s*次?/);
                const maker = metadata.match(/(?:制造者|制作者)\s*[:：]?\s*(.+)/);
                const suit = metadata.match(/(?:套装效果|套装)\s*[:：]?\s*(.*)(?:\n([^\n]+))?/);
                const runes = metadata.match(/(?:符石|星位)\s*[:：]?\s*(.+)/);
                if (element) detail.element = element[1];
                if (durability) detail.durability = Number(durability[1]);
                if (repair) detail.repair = Number(repair[1]);
                if (maker) detail.maker = maker[1].trim();
                if (runes) detail.runes = runes[0].trim();
                if (suit)
                    detail.suit = (
                        suit[1].replace(/[[\]【】]/g, '').trim() ||
                        suit[2] ||
                        ''
                    ).trim();
                // 钟灵石后的单件效果、套装效果并非附加属性，不占灵饰词条。
                if (rule.kind === 'accessory' && raw) {
                    const afterClock = raw.split(/特效\s*[:：]?[^\n]+/)[1];
                    if (afterClock) {
                        const part = afterClock.split(/制造者|制作者/)[0];
                        const effect = part.split(/[[【]?套装效果[\]】]?/)[0].trim();
                        if (effect)
                            detail.suit = [effect, detail.suit && '套装：' + detail.suit]
                                .filter(Boolean)
                                .join('\n');
                        for (const line of part
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean)) {
                            const rawIndex = unknown.lastIndexOf(line);
                            if (rawIndex >= 0) unknown.splice(rawIndex, 1);
                            const parsed = this.parseEquipmentStats(line);
                            for (const row of parsed.rows) {
                                const i = detail.extra.findLastIndex(
                                    (item) =>
                                        item.key === row.key &&
                                        item.value === row.value &&
                                        item.boost === row.boost,
                                );
                                if (i >= 0) detail.extra.splice(i, 1);
                                const u = unknown.lastIndexOf(this.equipmentStatText(row));
                                if (u >= 0) unknown.splice(u, 1);
                            }
                        }
                    }
                }
                if (rule.kind === 'jade') {
                    const assault = raw.match(
                        /(奇袭法术|奇袭特技|奇袭道具)\s*[:：]?\s*\+?\s*(\d+(?:\.\d+)?)\s*%/,
                    );
                    if (assault) {
                        detail.jade.assault = assault[1];
                        detail.jade.chance = Number(assault[2]);
                    }
                }
                detail.legacy = [...new Set(unknown)].join('\n');
                return detail;
            },
            validateEquipmentDetails(slot, level, detail) {
                const rule = this.equipmentRule(slot);
                if (!detail || detail.version !== 1) throw new Error('装备属性格式不正确');
                if (
                    !detail.clock ||
                    !detail.jade ||
                    !Array.isArray(detail.gems) ||
                    !Array.isArray(detail.effects)
                )
                    throw new Error('装备强化信息格式不正确');
                if (
                    typeof detail.clock.name !== 'string' ||
                    typeof detail.jade.assault !== 'string' ||
                    !Array.isArray(detail.jade.enchantments) ||
                    detail.jade.enchantments.some((value) => typeof value !== 'string')
                )
                    throw new Error('装备强化信息格式不正确');
                for (const key of ['technique', 'suit', 'element', 'maker', 'runes', 'legacy']) {
                    if (typeof detail[key] !== 'string') throw new Error('装备文字信息格式不正确');
                }
                /**
                 * @param {number | null | undefined} value
                 * @param {string} label
                 * @param {number} [min]
                 * @param {number} [max]
                 */
                const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
                    if (
                        value != null &&
                        (!Number.isSafeInteger(value) || value < min || value > max)
                    )
                        throw new Error(label + '需填写有效整数');
                };
                for (const group of ['base', 'extra', 'bonus', 'melt']) {
                    if (!Array.isArray(detail[group])) throw new Error('装备词条格式不正确');
                    const pool = group === 'melt' ? [...rule.base, ...rule.extra] : rule[group];
                    const seen = new Set();
                    for (const row of detail[group]) {
                        if (!row || typeof row !== 'object') throw new Error('装备词条格式不正确');
                        if (!pool.includes(row.key))
                            throw new Error(
                                '该部位不支持「' + (this.equipmentStats[row.key] || row.key) + '」',
                            );
                        if (row.value === null)
                            throw new Error('请填写「' + this.equipmentStats[row.key] + '」的数值');
                        integer(
                            row.value,
                            this.equipmentStats[row.key],
                            ['extra', 'melt'].includes(group) && rule.kind === 'gear'
                                ? -Number.MAX_SAFE_INTEGER
                                : 0,
                        );
                        integer(row.boost, '强化加成');
                        if (row.boost !== null && !['accessory', 'jade'].includes(rule.kind))
                            throw new Error('该部位不支持词条强化加成');
                        if ((group !== 'extra' || rule.kind === 'gear') && seen.has(row.key))
                            throw new Error('该属性不可重复填写');
                        seen.add(row.key);
                    }
                }
                if (detail.extra.length > (rule.kind === 'accessory' ? 3 : 2))
                    throw new Error('附加属性数量超出该部位限制');
                if (['accessory', 'jade'].includes(rule.kind) && detail.base.length > 1)
                    throw new Error('请选择一条主属性');
                if (
                    detail.technique &&
                    (rule.kind !== 'gear' || !this.equipmentTechniques.includes(detail.technique))
                )
                    throw new Error('请选择有效的装备特技');
                if (
                    !Array.isArray(detail.effects) ||
                    new Set(detail.effects).size !== detail.effects.length ||
                    detail.effects.some((value) => !rule.effects.includes(value))
                )
                    throw new Error('请选择该部位支持的特效');
                for (const pair of [
                    ['永不磨损', '坚固'],
                    ['愤怒', '暴怒'],
                    ['神农', '专注'],
                ]) {
                    if (pair.every((effect) => detail.effects.includes(effect)))
                        throw new Error(pair.join('与') + '不能同时出现');
                }
                if (
                    !Array.isArray(detail.gems) ||
                    detail.gems.some((gem) => !rule.gems.includes(gem.type))
                )
                    throw new Error('请选择该部位支持的宝石');
                if (new Set(detail.gems.map((gem) => gem.type)).size !== detail.gems.length)
                    throw new Error('同类宝石只需填写一次');
                if (detail.gems.length > 2) throw new Error('每件装备最多镶嵌两种宝石');
                integer(detail.forge, '锻炼/精炼等级', 0, 30);
                detail.gems.forEach((gem) => integer(gem.level, '宝石等级', 0, 30));
                integer(detail.durability, '耐久');
                integer(detail.repair, '修理失败次数', 0, 3);
                if (
                    detail.clock.name &&
                    (rule.kind !== 'accessory' ||
                        !this.equipmentClockEffects.includes(detail.clock.name))
                )
                    throw new Error('请选择有效的钟灵石效果');
                integer(detail.clock.level, '钟灵石等级', 1, 8);
                if (detail.clock.name && detail.clock.level === null)
                    throw new Error('请填写钟灵石等级');
                if (rule.kind !== 'accessory' && (detail.clock.name || detail.clock.level !== null))
                    throw new Error('该部位不支持钟灵石');
                if (!['gear', 'accessory'].includes(rule.kind) && detail.forge !== null)
                    throw new Error('该部位不支持宝石锻炼');
                if (detail.element && !['金', '木', '水', '火', '土'].includes(detail.element))
                    throw new Error('请选择有效的五行');
                if (rule.kind === 'jade') {
                    integer(detail.jade.dust, '灵尘等级', 0, 17);
                    integer(detail.jade.holes, '开光孔数', 0, 3);
                    if (
                        detail.jade.chance !== null &&
                        (!Number.isFinite(detail.jade.chance) ||
                            detail.jade.chance < 0 ||
                            detail.jade.chance > 100)
                    )
                        throw new Error('奇袭概率需为 0～100');
                    if (
                        detail.jade.assault &&
                        !['奇袭法术', '奇袭特技', '奇袭道具'].includes(detail.jade.assault)
                    )
                        throw new Error('请选择有效的奇袭类型');
                    if (
                        !Array.isArray(detail.jade.enchantments) ||
                        detail.jade.enchantments.length > detail.jade.holes
                    )
                        throw new Error('强化信息超出开光孔数');
                    integer(detail.durability, '玉魄耐久', 0, 300);
                }
                if (level !== '' && level != null) integer(level, '装备等级', 0, 999);
            },
            /**
             * 读取路径上的无损修复：旧档里的属性可能来自更早的版本，硬校验抛错会让整份
             * data.json 打不开，因此这里只保留能进入类型字段的值，其余原文逐行记进 legacy。
             * 交互保存路径仍用 validateEquipmentDetails 严格拦截。
             *
             * @this {Domain}
             * @param {string} slot 装备部位
             * @param {any} level 装备等级（属于档案字段，只在本身合法时纳入自检）
             * @param {any} detail 旧档读出的属性，形状不可信
             * @returns {EquipmentDetail}
             */
            repairEquipmentDetails(slot, level, detail) {
                const rule = this.equipmentRule(slot);
                const stats = this.equipmentStats;
                /**
                 * 任意值压成可读文本，供 legacy 记录被丢弃的内容。
                 * @param {any} value
                 * @returns {string}
                 */
                const text = (value) => {
                    if (typeof value === 'string') return value;
                    if (value == null) return '';
                    if (typeof value === 'number' || typeof value === 'boolean')
                        return String(value);
                    try {
                        const json = JSON.stringify(value);
                        return typeof json === 'string' ? json : '';
                    } catch (_error) {
                        return '';
                    }
                };
                /** @type {string[]} */
                const notes = [];
                /** @param {any} value 逐行收集、最后统一去重 */
                const keep = (value) => {
                    text(value)
                        .split(/\r?\n/)
                        .forEach((line) => {
                            const trimmed = line.trim();
                            if (trimmed) notes.push(trimmed);
                        });
                };
                /** 只保留原文的空属性，用于完全无法识别的形状。 @param {any} record */
                const onlyLegacy = (record) => {
                    const empty = this.emptyEquipmentDetails();
                    empty.legacy = text(record);
                    return empty;
                };
                // 非 version 1（或根本不是对象）不按字段猜测迁移，避免把外来形状伪装成合法属性。
                if (
                    !detail ||
                    typeof detail !== 'object' ||
                    Array.isArray(detail) ||
                    detail.version !== 1
                )
                    return onlyLegacy(detail);

                const out = this.emptyEquipmentDetails();
                if (detail.legacy != null) keep(detail.legacy);
                const known = [
                    'version',
                    'base',
                    'extra',
                    'bonus',
                    'melt',
                    'technique',
                    'effects',
                    'forge',
                    'gems',
                    'clock',
                    'suit',
                    'element',
                    'durability',
                    'repair',
                    'maker',
                    'runes',
                    'jade',
                    'legacy',
                ];
                Object.keys(detail).forEach((key) => {
                    if (!known.includes(key)) keep(key + '：' + text(detail[key]));
                });
                /**
                 * 词条的可读文本：已知属性沿用显示值写法，未知形状退回 JSON。
                 * @param {any} row
                 * @returns {string}
                 */
                const rowText = (row) => {
                    if (row && typeof row === 'object' && typeof row.key === 'string') {
                        if (stats[row.key] && typeof row.value === 'number') {
                            const boost = typeof row.boost === 'number' ? row.boost : null;
                            return this.equipmentStatText({
                                key: row.key,
                                value: row.value,
                                boost,
                            });
                        }
                        return '装备词条：' + text(row.key) + ' ' + text(row.value);
                    }
                    return '装备词条：' + text(row);
                };
                /**
                 * 数值字段按范围收窄；超出范围时保留原文再取最近的合法值。
                 * @param {any} input
                 * @param {number} min
                 * @param {number} max
                 * @param {string} label
                 * @returns {number | null}
                 */
                const clampNumber = (input, min, max, label) => {
                    if (input == null || input === '') return null;
                    const number = Number(input);
                    if (!Number.isFinite(number)) {
                        keep(label + '：' + text(input));
                        return null;
                    }
                    const value = Math.min(max, Math.max(min, Math.trunc(number)));
                    if (value !== number) keep(label + '：' + text(input));
                    return value;
                };

                /** @type {Record<string, string>} */
                const labels = {
                    base: '基础属性',
                    extra: '附加属性',
                    bonus: '额外属性',
                    melt: '熔炼属性',
                };
                for (const group of ['base', 'extra', 'bonus', 'melt']) {
                    /** @type {string[]} */
                    const pool = group === 'melt' ? [...rule.base, ...rule.extra] : rule[group];
                    const rows = Array.isArray(detail[group]) ? detail[group] : [];
                    if (!Array.isArray(detail[group]) && detail[group] != null)
                        keep(labels[group] + '：' + text(detail[group]));
                    const min =
                        ['extra', 'melt'].includes(group) && rule.kind === 'gear'
                            ? -Number.MAX_SAFE_INTEGER
                            : 0;
                    // 灵饰与玉魄的附加属性允许同 key 重复，其余分组都不允许重复。
                    const repeatable = group === 'extra' && rule.kind !== 'gear';
                    const cap =
                        group === 'extra'
                            ? rule.kind === 'accessory'
                                ? 3
                                : 2
                            : group === 'base' && ['accessory', 'jade'].includes(rule.kind)
                              ? 1
                              : Number.MAX_SAFE_INTEGER;
                    /** @type {Set<string>} */
                    const seen = new Set();
                    /** @type {EquipmentRow[]} */
                    const kept = [];
                    for (const row of rows) {
                        if (
                            !row ||
                            typeof row !== 'object' ||
                            Array.isArray(row) ||
                            typeof row.key !== 'string' ||
                            !pool.includes(row.key)
                        ) {
                            keep(rowText(row));
                            continue;
                        }
                        const raw = row.value;
                        const value =
                            typeof raw === 'number'
                                ? raw
                                : typeof raw === 'string' && raw.trim()
                                  ? Number(raw)
                                  : NaN;
                        if (!Number.isSafeInteger(value) || value < min) {
                            keep(rowText(row));
                            continue;
                        }
                        if (!repeatable && seen.has(row.key)) {
                            keep(rowText(row));
                            continue;
                        }
                        if (kept.length >= cap) {
                            keep(rowText(row));
                            continue;
                        }
                        /** @type {number | null} */
                        let boost = null;
                        if (row.boost != null) {
                            const parsed = Number(row.boost);
                            // 加成非法或该部位不支持强化时整条词条落进原文：只丢加成会
                            // 把「伤害 +3 [+5]」静默改成「伤害 +3」，等于改写用户数据。
                            if (!Number.isSafeInteger(parsed) || parsed < 0) {
                                keep(rowText(row));
                                continue;
                            }
                            if (!['accessory', 'jade'].includes(rule.kind)) {
                                keep(rowText(row));
                                continue;
                            }
                            boost = parsed;
                        }
                        seen.add(row.key);
                        kept.push({ key: row.key, value, boost });
                    }
                    out[group] = kept;
                }

                /** @type {string[]} */
                const effects = [];
                const exclusive = [
                    ['永不磨损', '坚固'],
                    ['愤怒', '暴怒'],
                    ['神农', '专注'],
                ];
                for (const effect of Array.isArray(detail.effects) ? detail.effects : []) {
                    const known = typeof effect === 'string' && rule.effects.includes(effect);
                    const conflict =
                        known &&
                        exclusive.some(
                            (pair) =>
                                pair.includes(effect) &&
                                pair.some((other) => effects.includes(other)),
                        );
                    if (!known || conflict || effects.includes(effect)) {
                        keep('特效：' + text(effect));
                        continue;
                    }
                    effects.push(effect);
                }
                if (!Array.isArray(detail.effects) && detail.effects != null)
                    keep('特效：' + text(detail.effects));
                out.effects = effects;

                const technique = detail.technique;
                if (
                    typeof technique === 'string' &&
                    technique &&
                    rule.kind === 'gear' &&
                    this.equipmentTechniques.includes(technique)
                )
                    out.technique = technique;
                else if (technique != null && technique !== '') keep('特技：' + text(technique));

                for (const key of ['suit', 'maker', 'runes']) {
                    const value = detail[key];
                    if (typeof value === 'string') out[key] = value;
                    else if (value != null) keep(text(value));
                }
                const element = typeof detail.element === 'string' ? detail.element : '';
                out.element = ['金', '木', '水', '火', '土'].includes(element) ? element : '';
                if (!out.element && detail.element != null && detail.element !== '')
                    keep('五行：' + text(detail.element));

                if (['gear', 'accessory'].includes(rule.kind))
                    out.forge = clampNumber(detail.forge, 0, 30, '锻炼/精炼等级');
                else if (detail.forge != null) keep('锻炼/精炼等级：' + text(detail.forge));
                out.repair = clampNumber(detail.repair, 0, 3, '修理失败次数');
                out.durability = clampNumber(
                    detail.durability,
                    0,
                    rule.kind === 'jade' ? 300 : Number.MAX_SAFE_INTEGER,
                    '耐久',
                );

                /** @type {EquipmentGem[]} */
                const gems = [];
                for (const gem of Array.isArray(detail.gems) ? detail.gems : []) {
                    const type = gem && typeof gem === 'object' ? gem.type : undefined;
                    const gemLabel =
                        typeof type === 'string' && type
                            ? type + (gem.level == null ? '' : ' ×' + text(gem.level))
                            : text(gem);
                    if (
                        typeof type !== 'string' ||
                        !rule.gems.includes(type) ||
                        gems.some((item) => item.type === type) ||
                        gems.length >= 2
                    ) {
                        keep('宝石：' + gemLabel);
                        continue;
                    }
                    const level = clampNumber(gem.level, 0, 30, '宝石等级');
                    // 等级被收窄（如 2.5 或 99）时原文已在 legacy，保留宝石本身不丢类型。
                    gems.push({ type, level });
                }
                if (!Array.isArray(detail.gems) && detail.gems != null)
                    keep('宝石：' + text(detail.gems));
                out.gems = gems;

                const clock =
                    detail.clock && typeof detail.clock === 'object' && !Array.isArray(detail.clock)
                        ? detail.clock
                        : {};
                if (detail.clock != null && typeof detail.clock !== 'object')
                    keep('钟灵石：' + text(detail.clock));
                /** @param {any} name @param {any} clockLevel */
                const clockText = (name, clockLevel) =>
                    '钟灵石：' +
                    text(name) +
                    (clockLevel == null ? '' : '（' + text(clockLevel) + '级）');
                const clockName = clock.name;
                if (
                    typeof clockName === 'string' &&
                    clockName &&
                    rule.kind === 'accessory' &&
                    this.equipmentClockEffects.includes(clockName)
                ) {
                    const clockLevel = clampNumber(clock.level, 1, 8, '钟灵石等级');
                    if (clockLevel === null) keep(clockText(clockName, clock.level));
                    else out.clock = { name: clockName, level: clockLevel };
                } else if (clockName != null && clockName !== '') {
                    keep(clockText(clockName, clock.level));
                } else if (clock.level != null) {
                    keep('钟灵石等级：' + text(clock.level));
                }

                if (rule.kind === 'jade') {
                    const jade =
                        detail.jade &&
                        typeof detail.jade === 'object' &&
                        !Array.isArray(detail.jade)
                            ? detail.jade
                            : {};
                    if (detail.jade != null && typeof detail.jade !== 'object')
                        keep('玉魄：' + text(detail.jade));
                    const holes = clampNumber(jade.holes, 0, 3, '开光孔数') ?? 0;
                    /** @type {number | null} */
                    let chance = null;
                    if (jade.chance != null) {
                        const number = Number(jade.chance);
                        if (Number.isFinite(number) && number >= 0 && number <= 100)
                            chance = number;
                        else keep('奇袭概率：' + text(jade.chance));
                    }
                    let assault = '';
                    if (['奇袭法术', '奇袭特技', '奇袭道具'].includes(jade.assault))
                        assault = jade.assault;
                    else if (jade.assault != null && jade.assault !== '')
                        keep('奇袭类型：' + text(jade.assault));
                    /** @type {string[]} */
                    const enchantments = [];
                    for (const item of Array.isArray(jade.enchantments) ? jade.enchantments : []) {
                        if (typeof item === 'string' && enchantments.length < holes)
                            enchantments.push(item);
                        else keep('开光强化：' + text(item));
                    }
                    if (!Array.isArray(jade.enchantments) && jade.enchantments != null)
                        keep('开光强化：' + text(jade.enchantments));
                    out.jade = {
                        dust: clampNumber(jade.dust, 0, 17, '灵尘等级'),
                        assault,
                        chance,
                        holes,
                        enchantments,
                    };
                } else if (
                    detail.jade &&
                    typeof detail.jade === 'object' &&
                    (detail.jade.dust != null ||
                        detail.jade.assault ||
                        detail.jade.chance != null ||
                        detail.jade.holes ||
                        (Array.isArray(detail.jade.enchantments) &&
                            detail.jade.enchantments.length))
                ) {
                    // 非玉魄部位没有灵尘与开光字段：内容记进原文后清空，不留下非法字段。
                    keep('玉魄：' + text(detail.jade));
                }

                out.legacy = [...new Set(notes)].join('\n');
                // 等级属于装备档案字段，旧档里可能本身不合法；只有等级本身合法时才一起自检，
                // 避免把「等级无效」误判成属性修复失败。
                const levelOk =
                    level == null ||
                    level === '' ||
                    (Number.isSafeInteger(level) && level >= 0 && level <= 999);
                try {
                    this.validateEquipmentDetails(slot, levelOk ? level : '', out);
                    return out;
                } catch (_error) {
                    // 兜底：修复结果若仍不能通过严格校验（应由测试守住），宁可整体降级为
                    // 「原文保留 + 空属性」，也不能让一份旧数据中断启动或写入非法属性。
                    return onlyLegacy(out);
                }
            },

            equipmentDetailsSnapshot(slot, detail) {
                const rule = this.equipmentRule(slot),
                    text = /** @param {EquipmentRow[]} rows */ (rows) =>
                        rows.map((row) => this.equipmentStatText(row)).join('\n');
                /** @type {EquipmentSnapshot} */
                const record = {
                    attributes: text([...detail.base, ...detail.extra, ...detail.bonus]),
                    special: [
                        detail.technique && '特技：' + detail.technique,
                        ...detail.effects.map((effect) => '特效：' + effect),
                        detail.clock.name &&
                            '特效：' + detail.clock.name + '（' + detail.clock.level + '级）',
                    ]
                        .filter(Boolean)
                        .join('\n'),
                    gems: [
                        detail.forge == null
                            ? ''
                            : (rule.kind === 'accessory' ? '精炼等级 ' : '锻炼等级 ') +
                              detail.forge,
                        ...detail.gems.map(
                            (gem) => gem.type + (gem.level == null ? '' : ' ×' + gem.level),
                        ),
                    ]
                        .filter(Boolean)
                        .join('\n'),
                };
                if (rule.kind === 'jade')
                    record.jade = {
                        base: text(detail.base),
                        extra1: text(detail.extra.slice(0, 1)),
                        extra2: text(detail.extra.slice(1)),
                        dustLevel: detail.jade.dust,
                        holes: detail.jade.holes,
                        enchantments: detail.jade.enchantments.slice(),
                        durability: detail.durability ?? '',
                    };
                return record;
            },
            equipmentSearchText(eq) {
                const detail = this.equipmentDetails(eq);
                return [
                    eq.name,
                    eq.attributes,
                    eq.special,
                    eq.gems,
                    eq.note,
                    detail.legacy,
                    detail.suit,
                    detail.runes,
                    detail.maker,
                    ...[...detail.base, ...detail.extra, ...detail.bonus, ...detail.melt].map(
                        (row) => this.equipmentStatText(row),
                    ),
                    detail.technique,
                    ...detail.effects,
                    detail.clock.name,
                    detail.jade.assault,
                    ...detail.jade.enchantments,
                ].join(' ');
            },
        }),
    );
}
