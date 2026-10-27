'use strict';
/* 装备规则、结构化属性与旧文本适配。显示值按原样记录，不反算宝石或灵尘。 */
Object.assign(D, {
  equipmentStats: {
    hit: '命中', damage: '伤害', defense: '防御', hp: '气血', mp: '魔法', spirit: '灵力', dodge: '躲避',
    constitution: '体质', magic: '魔力', strength: '力量', endurance: '耐力', agility: '敏捷', speed: '速度',
    spellDamage: '法术伤害', spellDefense: '法术防御', fixedDamage: '固定伤害', healing: '治疗能力',
    seal: '封印命中等级', resistSeal: '抵抗封印等级', physicalCrit: '物理暴击等级', spellCrit: '法术暴击等级',
    rage: '狂暴等级', pierce: '穿刺等级', block: '格挡值', recovery: '气血回复效果',
    resistPhysicalCrit: '抗物理暴击等级', resistSpellCrit: '抗法术暴击等级',
  },
  equipmentTechniques: ['气归术', '命归术', '凝气决', '凝神决', '气疗术', '心疗术', '命疗术', '四海升平', '回魂咒', '起死回生',
    '慈航普度', '水清诀', '冰清诀', '玉清诀', '晶清诀', '野兽之力', '魔兽之印', '光辉之甲', '圣灵之甲',
    '流云诀', '啸风诀', '太极护法', '罗汉金钟', '修罗咒', '天衣无缝', '放下屠刀', '河东狮吼',
    '破甲术', '碎甲术', '凝滞术', '停陷术', '破血狂攻', '弱点击破', '破碎无双', '笑里藏刀',
    '绝幻魔音', '诅咒之伤', '诅咒之亡', '死亡之音', '身似菩提', '心如明镜', '移形换影', '凝心决', '聚精会神',
    '先发制人', '燃烧之光', '毁灭之光', '吸血', '残月', '冥王暴杀', '乾坤斩', '帝释无双', '伽罗无双', '虚空之刃', '亡灵之刃',
    '金刚不坏', '菩提心佑', '金刚怒目', '琴音三叠', '乾坤挪移'],
  equipmentClockEffects: ['回春之术', '健步如飞', '心无旁骛', '锐不可当', '通真达灵', '自我陶醉',
    '柳暗花明', '血气方刚', '心源', '163', '宿敌', '伶俐', '自我激励'],
  equipmentRule(slot) {
    const five = ['constitution', 'magic', 'strength', 'endurance', 'agility'];
    const attack = ['damage', 'speed', 'spellDamage', 'fixedDamage', 'healing', 'seal', 'physicalCrit', 'spellCrit', 'rage', 'pierce'];
    const defense = ['hp', 'defense', 'spellDefense', 'resistSeal', 'block', 'recovery', 'resistPhysicalCrit', 'resistSpellCrit'];
    const rules = {
      武器: { base: ['damage', 'hit'], extra: five, gems: ['太阳石', '红玛瑙', '神秘石'] },
      头盔: { base: ['defense', 'mp'], gems: ['月亮石', '太阳石', '红玛瑙'] },
      项链: { base: ['spirit'], gems: ['舍利子', '红宝石', '黄宝石', '蓝宝石', '绿宝石'] },
      衣服: { base: ['defense'], extra: five, gems: ['月亮石', '光芒石', '舍利子', '翡翠石'] },
      腰带: { base: ['defense', 'hp'], gems: ['光芒石', '黑宝石', '神秘石'] },
      鞋子: { base: ['defense', 'agility'], gems: ['黑宝石', '神秘石', '红宝石', '黄宝石', '蓝宝石', '绿宝石'] },
      戒指: { base: ['damage', 'defense'], extra: attack, kind: 'accessory' },
      耳饰: { base: ['spellDamage', 'spellDefense'], extra: attack, kind: 'accessory' },
      手镯: { base: ['seal', 'resistSeal'], extra: defense, kind: 'accessory' },
      佩饰: { base: ['speed'], extra: defense, kind: 'accessory' },
      '玉魄·阳': { base: attack.filter((key) => !['speed', 'rage', 'pierce'].includes(key)), extra: attack.filter((key) => !['speed', 'rage', 'pierce'].includes(key)), kind: 'jade' },
      '玉魄·阴': { base: defense, extra: defense, kind: 'jade' },
      其他: { base: [], extra: [], kind: 'other' },
    };
    const rule = Object.assign({ kind: 'gear', extra: [], gems: [] }, rules[slot] || rules.其他);
    rule.effects = rule.kind === 'gear' ? ['简易', '无级别限制', '永不磨损', '精致', '坚固', '易修理', '珍宝',
      ...(slot === '武器' ? ['神佑', '必中', '绝杀'] : []), ...(slot === '腰带' ? ['愤怒', '暴怒'] : []),
      ...(slot === '项链' ? ['神农', '专注'] : []), ...(slot === '头盔' ? ['再生'] : []),
      ...(slot === '衣服' ? ['伪装'] : []), ...(slot === '鞋子' ? ['迷踪', '狩猎'] : [])] : rule.kind === 'accessory' ? ['超级简易'] : [];
    rule.bonus = { 武器: ['damage', 'hit', 'dodge'], 头盔: ['damage', 'hit', 'defense'], 项链: ['spirit'],
      衣服: ['hp', 'defense', 'spirit', 'spellDefense'], 腰带: ['hp', 'speed', 'dodge'], 鞋子: ['speed', 'dodge'] }[slot] || [];
    return rule;
  },
  emptyEquipmentDetails() {
    return { version: 1, base: [], extra: [], bonus: [], melt: [], technique: '', effects: [], forge: null, gems: [],
      clock: { name: '', level: null }, suit: '', element: '', durability: null, repair: null, maker: '', runes: '',
      jade: { dust: null, assault: '', chance: null, holes: 0, enchantments: [] }, legacy: '' };
  },
  equipmentStatText(row) {
    return this.equipmentStats[row.key] + ' ' + (row.value >= 0 ? '+' : '') + row.value +
      (row.boost == null ? '' : ' [' + (row.boost >= 0 ? '+' : '') + row.boost + ']');
  },
  /** 只识别完整、已知名称的数值词条；无法确定的文字逐行保留。 */
  parseEquipmentStats(text) {
    const aliases = { 气血恢复效果: 'recovery', 抵抗封印命中等级: 'resistSeal' };
    const labels = Object.assign(Object.fromEntries(Object.entries(this.equipmentStats).map(([key, label]) => [label, key])), aliases);
    const pattern = new RegExp('(' + Object.keys(labels).sort((a, b) => b.length - a.length).join('|') + ')\\s*[:：]?\\s*([+-]?\\s*\\d+(?:\\.\\d+)?)(?:\\s*\\[\\s*([+-]?\\s*\\d+(?:\\.\\d+)?)\\s*\\])?', 'g');
    const rows = [], unknown = [];
    for (const line of String(text || '').normalize('NFKC').split(/\r?\n/).filter((line) => line.trim())) {
      let matched = false;
      const rest = line.replace(pattern, (_match, label, value, boost) => {
        rows.push({ key: labels[label], value: Number(value.replace(/\s/g, '')), boost: boost == null ? null : Number(boost.replace(/\s/g, '')) });
        matched = true; return '';
      }).replace(/[，,、;；\s]/g, '');
      if (!matched || rest) unknown.push(line.trim());
    }
    return { rows, unknown };
  },
  equipmentDetails(eq) {
    if (eq.details && eq.details.version === 1) return JSON.parse(JSON.stringify(eq.details));
    const detail = this.emptyEquipmentDetails(), rule = this.equipmentRule(eq.slot), unknown = [];
    const store = (group, row) => {
      const signed = group === 'extra' && rule.kind === 'gear';
      const duplicate = detail[group].some((item) => item.key === row.key) && !(group === 'extra' && rule.kind !== 'gear');
      const limit = group === 'extra' ? (rule.kind === 'accessory' ? 3 : 2) : group === 'base' && rule.kind !== 'gear' ? 1 : Infinity;
      if (!rule[group].includes(row.key) || !Number.isSafeInteger(row.value) || (!signed && row.value < 0) || duplicate ||
        detail[group].length >= limit || row.boost !== null && (rule.kind === 'gear' || !Number.isSafeInteger(row.boost) || row.boost < 0)) {
        unknown.push(this.equipmentStatText(row)); return;
      }
      detail[group].push(row);
    };
    const parseInto = (text, group) => {
      const parsed = this.parseEquipmentStats(text);
      parsed.rows.forEach((row) => {
        if (group) {
          store(group, row);
        } else if (rule.base.includes(row.key) && !detail.base.some((item) => item.key === row.key) && (rule.kind !== 'accessory' || !detail.base.length)) store('base', row);
        else if (rule.extra.includes(row.key) && detail.extra.length < (rule.kind === 'accessory' ? 3 : 2)) store('extra', row);
        else if (rule.bonus.includes(row.key)) store('bonus', row);
        else unknown.push(this.equipmentStatText(row));
      });
      unknown.push(...parsed.unknown);
    };
    if (rule.kind === 'jade' && eq.jade) {
      parseInto(eq.jade.base, 'base'); parseInto(eq.jade.extra1, 'extra'); parseInto(eq.jade.extra2, 'extra');
      detail.jade = { dust: eq.jade.dustLevel ?? null, assault: '', chance: null, holes: eq.jade.holes ?? 0,
        enchantments: (eq.jade.enchantments || []).slice() };
      detail.durability = eq.jade.durability === '' ? null : eq.jade.durability ?? null;
    } else parseInto(eq.attributes);
    for (const line of String(eq.special || '').normalize('NFKC').split(/\r?\n/).filter(Boolean)) {
      const original = line.replace(/^(?:特技|特效|玉魄特效)\s*[:：]?\s*/, '').trim();
      const value = ({ 凝气诀: '凝气决', 凝神诀: '凝神决', 凝心诀: '凝心决', 无级别: '无级别限制' })[original] || original;
      const clock = value.match(/^(.+?)\s*\((\d+)级\)$/);
      const assault = value.match(/(奇袭法术|奇袭特技|奇袭道具)\s*\+?\s*(\d+(?:\.\d+)?)\s*%/);
      if (rule.kind === 'accessory' && clock && this.equipmentClockEffects.includes(clock[1])) detail.clock = { name: clock[1], level: Number(clock[2]) };
      else if (rule.kind === 'jade' && assault) { detail.jade.assault = assault[1]; detail.jade.chance = Number(assault[2]); }
      else if (rule.kind === 'gear' && this.equipmentTechniques.includes(value)) detail.technique = value;
      else if (rule.effects.includes(value)) detail.effects.push(value);
      else unknown.push(line);
    }
    const gemText = String(eq.gems || '');
    const forge = gemText.match(/(?:锻炼|精炼|镶嵌)等级\s*[:：]?\s*(\d+)/);
    if (forge) detail.forge = Number(forge[1]);
    let remaining = gemText.replace(/(?:锻炼|精炼|镶嵌)等级\s*[:：]?\s*\d+/g, '').replace(/镶嵌宝石\s*[:：]?/g, '');
    for (const type of ['太阳石', '红玛瑙', '黑宝石', '月亮石', '舍利子', '光芒石', '神秘石', '翡翠石', '红宝石', '黄宝石', '蓝宝石', '绿宝石', '星辉石']) {
      const re = new RegExp(type + '(?:\\s*[×x*]\\s*(\\d+))?', 'g');
      remaining = remaining.replace(re, (_match, level) => {
        if (rule.gems.includes(type) && !detail.gems.some((gem) => gem.type === type) && detail.gems.length < 2) detail.gems.push({ type, level: level == null ? null : Number(level) });
        else if (rule.kind === 'accessory' && type === '星辉石') {
          if (detail.forge === null && level != null) detail.forge = Number(level);
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
    if (suit) detail.suit = (suit[1].replace(/[\[\]【】]/g, '').trim() || suit[2] || '').trim();
    // 钟灵石后的单件效果、套装效果并非附加属性，不占灵饰词条。
    if (rule.kind === 'accessory' && raw) {
      const afterClock = raw.split(/特效\s*[:：]?[^\n]+/)[1];
      if (afterClock) {
        const part = afterClock.split(/制造者|制作者/)[0];
        const effect = part.split(/[\[【]?套装效果[\]】]?/)[0].trim();
        if (effect) detail.suit = [effect, detail.suit && '套装：' + detail.suit].filter(Boolean).join('\n');
        for (const line of part.split('\n').map((line) => line.trim()).filter(Boolean)) {
          const rawIndex = unknown.lastIndexOf(line); if (rawIndex >= 0) unknown.splice(rawIndex, 1);
          const parsed = this.parseEquipmentStats(line);
          for (const row of parsed.rows) {
            const u = unknown.lastIndexOf(this.equipmentStatText(row)); if (u >= 0) unknown.splice(u, 1);
          }
        }
      }
    }
    if (rule.kind === 'jade') {
      const assault = raw.match(/(奇袭法术|奇袭特技|奇袭道具)\s*[:：]?\s*\+?\s*(\d+(?:\.\d+)?)\s*%/);
      if (assault) { detail.jade.assault = assault[1]; detail.jade.chance = Number(assault[2]); }
    }
    detail.legacy = [...new Set(unknown)].join('\n');
    return detail;
  },
  validateEquipmentDetails(slot, level, detail) {
    const rule = this.equipmentRule(slot);
    if (!detail || detail.version !== 1) throw new Error('装备属性格式不正确');
    if (!detail.clock || !detail.jade || !Array.isArray(detail.gems) || !Array.isArray(detail.effects)) throw new Error('装备强化信息格式不正确');
    if (typeof detail.clock.name !== 'string' || typeof detail.jade.assault !== 'string' ||
      !Array.isArray(detail.jade.enchantments) || detail.jade.enchantments.some((value) => typeof value !== 'string')) throw new Error('装备强化信息格式不正确');
    for (const key of ['technique', 'suit', 'element', 'maker', 'runes', 'legacy']) {
      if (typeof detail[key] !== 'string') throw new Error('装备文字信息格式不正确');
    }
    const integer = (value, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
      if (value !== null && (!Number.isSafeInteger(value) || value < min || value > max)) throw new Error(label + '需填写有效整数');
    };
    for (const group of ['base', 'extra', 'bonus', 'melt']) {
      if (!Array.isArray(detail[group])) throw new Error('装备词条格式不正确');
      const pool = group === 'melt' ? [...rule.base, ...rule.extra] : rule[group];
      const seen = new Set();
      for (const row of detail[group]) {
        if (!row || typeof row !== 'object') throw new Error('装备词条格式不正确');
        if (!pool.includes(row.key)) throw new Error('该部位不支持「' + (this.equipmentStats[row.key] || row.key) + '」');
        if (row.value === null) throw new Error('请填写「' + this.equipmentStats[row.key] + '」的数值');
        integer(row.value, this.equipmentStats[row.key], ['extra', 'melt'].includes(group) && rule.kind === 'gear' ? -Number.MAX_SAFE_INTEGER : 0);
        integer(row.boost, '强化加成');
        if (row.boost !== null && !['accessory', 'jade'].includes(rule.kind)) throw new Error('该部位不支持词条强化加成');
        if ((group !== 'extra' || rule.kind === 'gear') && seen.has(row.key)) throw new Error('该属性不可重复填写');
        seen.add(row.key);
      }
    }
    if (detail.extra.length > (rule.kind === 'accessory' ? 3 : 2)) throw new Error('附加属性数量超出该部位限制');
    if (['accessory', 'jade'].includes(rule.kind) && detail.base.length > 1) throw new Error('请选择一条主属性');
    if (detail.technique && (rule.kind !== 'gear' || !this.equipmentTechniques.includes(detail.technique))) throw new Error('请选择有效的装备特技');
    if (!Array.isArray(detail.effects) || new Set(detail.effects).size !== detail.effects.length || detail.effects.some((value) => !rule.effects.includes(value))) throw new Error('请选择该部位支持的特效');
    for (const pair of [['永不磨损', '坚固'], ['愤怒', '暴怒'], ['神农', '专注']]) {
      if (pair.every((effect) => detail.effects.includes(effect))) throw new Error(pair.join('与') + '不能同时出现');
    }
    if (detail.gems.some((gem) => !gem || !rule.gems.includes(gem.type))) throw new Error('请选择该部位支持的宝石');
    if (new Set(detail.gems.map((gem) => gem.type)).size !== detail.gems.length) throw new Error('同类宝石只需填写一次');
    if (detail.gems.length > 2) throw new Error('每件装备最多镶嵌两种宝石');
    integer(detail.forge, '锻炼/精炼等级', 0, 30);
    detail.gems.forEach((gem) => integer(gem.level, '宝石等级', 0, 30));
    integer(detail.durability, '耐久'); integer(detail.repair, '修理失败次数', 0, 3);
    if (detail.clock.name && (rule.kind !== 'accessory' || !this.equipmentClockEffects.includes(detail.clock.name))) throw new Error('请选择有效的钟灵石效果');
    integer(detail.clock.level, '钟灵石等级', 1, 8);
    if (detail.clock.name && detail.clock.level === null) throw new Error('请填写钟灵石等级');
    if (rule.kind !== 'accessory' && (detail.clock.name || detail.clock.level !== null)) throw new Error('该部位不支持钟灵石');
    if (!['gear', 'accessory'].includes(rule.kind) && detail.forge !== null) throw new Error('该部位不支持宝石锻炼');
    if (detail.element && !['金', '木', '水', '火', '土'].includes(detail.element)) throw new Error('请选择有效的五行');
    if (rule.kind === 'jade') {
      integer(detail.jade.dust, '灵尘等级', 0, 17); integer(detail.jade.holes, '开光孔数', 0, 3);
      if (detail.jade.chance !== null && (!Number.isFinite(detail.jade.chance) || detail.jade.chance < 0 || detail.jade.chance > 100)) throw new Error('奇袭概率需为 0～100');
      if (detail.jade.assault && !['奇袭法术', '奇袭特技', '奇袭道具'].includes(detail.jade.assault)) throw new Error('请选择有效的奇袭类型');
      if (!Array.isArray(detail.jade.enchantments) || detail.jade.enchantments.length > detail.jade.holes) throw new Error('强化信息超出开光孔数');
      integer(detail.durability, '玉魄耐久', 0, 300);
    }
    if (level !== '' && level != null) integer(level, '装备等级', 0, 999);
  },
  equipmentDetailsSnapshot(slot, detail) {
    const rule = this.equipmentRule(slot), text = (rows) => rows.map((row) => this.equipmentStatText(row)).join('\n');
    const record = { attributes: text([...detail.base, ...detail.extra, ...detail.bonus]),
      special: [detail.technique && '特技：' + detail.technique, ...detail.effects.map((effect) => '特效：' + effect),
        detail.clock.name && '特效：' + detail.clock.name + '（' + detail.clock.level + '级）'].filter(Boolean).join('\n'),
      gems: [detail.forge == null ? '' : (rule.kind === 'accessory' ? '精炼等级 ' : '锻炼等级 ') + detail.forge,
        ...detail.gems.map((gem) => gem.type + (gem.level == null ? '' : ' ×' + gem.level))].filter(Boolean).join('\n') };
    if (rule.kind === 'jade') record.jade = { base: text(detail.base), extra1: text(detail.extra.slice(0, 1)), extra2: text(detail.extra.slice(1)),
      dustLevel: detail.jade.dust, holes: detail.jade.holes, enchantments: detail.jade.enchantments.slice(), durability: detail.durability ?? '' };
    return record;
  },
  equipmentSearchText(eq) {
    const detail = this.equipmentDetails(eq);
    return [eq.name, eq.attributes, eq.special, eq.gems, eq.note, detail.legacy, detail.suit, detail.runes,
      detail.maker, ...[...detail.base, ...detail.extra, ...detail.bonus, ...detail.melt].map((row) => this.equipmentStatText(row)),
      detail.technique, ...detail.effects, detail.clock.name, detail.jade.assault, ...detail.jade.enchantments].join(' ');
  },
});
