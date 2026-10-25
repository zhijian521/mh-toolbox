'use strict';
/* 数据层：状态、常量、持久化 */
const D = window.D = {
  state: { schemaVersion: 4, characters: [], transactions: [], sessions: [], activeSession: null, goals: [], equipment: [], gearLogs: [] },
  charFilter: localStorage.getItem('mh.charFilter') || 'all',

  incomeCats: ['捉鬼', '押镖', '师门', '封妖', '副本', '周末活动', '节日活动', '摆摊卖货', '物品掉落', '宝图', '牧场', '种植', '帮派产出', '其他收入'],
  expenseCats: ['点卡', '修理装备', '药品补给', '其他支出'],
  accountCats: ['装备交易', '召唤兽交易', '点卡充值', '游戏币买入', '游戏币卖出', '养成投入', '其他收支'],
  channels: ['游戏内', '藏宝阁', '官方充值', '其他'],
  itemStatuses: { held: '持有', sold: '已出售', self: '自用' },
  slots: ['武器', '头盔', '项链', '衣服', '腰带', '鞋子', '戒指', '耳饰', '手镯', '佩饰', '玉魄·阳', '玉魄·阴', '其他'],
  schools: ['大唐官府', '方寸山', '化生寺', '女儿村', '神木林', '凌波城', '花果山', '天机城', '魔王寨', '阴曹地府', '狮驼岭', '盘丝洞', '无底洞', '女魃墓', '天宫', '龙宫', '五庄观', '普陀山', '九黎城', '东海渊', '其他'],
  characterTraining: [
    { key: 'attack', label: '攻击修炼' }, { key: 'magic', label: '法术修炼' },
    { key: 'defense', label: '防御修炼' }, { key: 'resistance', label: '抗法修炼' }, { key: 'hunting', label: '猎术修炼' },
  ],
  petTraining: [
    { key: 'attack', label: '攻击控制力' }, { key: 'magic', label: '法术控制力' },
    { key: 'defense', label: '防御控制力' }, { key: 'resistance', label: '抗法控制力' },
  ],
  auxiliarySkillNames: ['强身术', '强壮', '神速', '冥想', '烹饪技巧', '中药医理', '打造技巧', '裁缝技巧', '炼金术', '淬灵之术', '养生之道', '健身术', '巧匠之术', '熔炼技巧'],
  goalTypes: [
    { v: 'money', t: '存钱目标' },
    { v: 'gear', t: '装备目标' },
    { v: 'progress', t: '养成目标' }
  ],
  gearActions: [
    { v: 'buy', t: '购入', dir: -1 },
    { v: 'sell', t: '售出', dir: 1 },
    { v: 'craft', t: '打造', dir: -1 },
    { v: 'replace', t: '替换', dir: 0 },
    { v: 'gem', t: '镶嵌宝石', dir: -1 },
    { v: 'dust', t: '镶嵌灵尘', dir: -1 },
    { v: 'consecrate', t: '开光强化', dir: -1 },
    { v: 'other', t: '其他', dir: 0 }
  ],

  async init() {
    const res = await window.mh.loadData();
    if (!res || !res.ok) throw new Error('读取数据失败：' + (res && res.error || '未知错误'));
    this.state = this.normalize(res.data || {});
    if (res.data && res.data.schemaVersion !== 4) await this.persist();
  },

  normalize(data) {
    data = data && typeof data === 'object' ? data : {};
    const s = {
      schemaVersion: 4,
      characters: Array.isArray(data.characters) ? data.characters.map((c) => Object.assign({}, c, {
        progress: this.normalizeCharacterProgress(c.progress),
      })) : [],
      transactions: Array.isArray(data.transactions) ? data.transactions.map((t) => Object.assign({}, t)) : [],
      goals: Array.isArray(data.goals) ? data.goals.map((g) => Object.assign({}, g)) : [],
      equipment: Array.isArray(data.equipment) ? data.equipment.map((e) => Object.assign({}, e)) : [],
      gearLogs: Array.isArray(data.gearLogs) ? data.gearLogs.map((l) => Object.assign({}, l)) : []
    };
    s.transactions.forEach((t) => {
      t.amount = Number(t.amount) || 0;
      t.minutes = Number(t.minutes) || 0;
      if (!['earnings', 'account'].includes(t.ledger)) {
        const gear = ['装备购入', '打造费用'].includes(t.category) || /^装备「/.test(t.note || '');
        const topup = ['点卡充值', '充值点卡', '充值'].includes(t.category);
        t.ledger = gear || topup || t.currency === 'rmb' ? 'account' : 'earnings';
        if (gear) t.category = t.category === '打造费用' ? '养成投入' : '装备交易';
        if (topup) t.category = '点卡充值';
        // 旧版金额单位保持不变，不能把“万梦幻币”直接解释为人民币。
      }
      t.recordType = t.ledger === 'earnings' && !(t.source === 'quick' && t.itemId === 99) && (t.recordType === 'item' ||
        (!t.recordType && t.source === 'quick' && t.kind === 'income' && t.itemId && t.itemId !== 99)) ? 'item' : 'money';
      if (t.recordType === 'item') {
        t.quantity = Math.max(1, Number(t.quantity) || 1);
        t.unitPrice = Math.max(0, Number(t.unitPrice == null ? t.amount / t.quantity : t.unitPrice) || 0);
        t.itemName = t.itemName || t.note || '物品';
        t.status = Object.hasOwn(this.itemStatuses, t.status) ? t.status : 'held';
        t.amount = this.itemValue(t);
      }
      t.fee = Math.max(0, Number(t.fee) || 0);
      t.channel = t.channel || '游戏内';
    });
    // 旧版装备同步流水没有外键：仅在装备名、日期、动作、金额都吻合时补关联。
    s.transactions.filter((t) => t.ledger === 'account' && !t.equipmentId && /^装备「/.test(t.note || '')).forEach((t) => {
      const eq = s.equipment.find((e) => e.characterId === t.characterId && t.note.startsWith('装备「' + e.name + '」'));
      if (!eq) return;
      const log = s.gearLogs.find((l) => !l.transactionId && l.equipmentId === eq.id && l.date === t.date && Number(l.amount) === t.amount &&
        (t.kind === 'income' ? l.action === 'sell' : ['buy', 'craft', 'gem'].includes(l.action)));
      if (log) {
        t.equipmentId = eq.id; t.gearAction = log.action; log.transactionId = t.id; log.synced = true;
        if (!eq.tradeBaseStatus) eq.tradeBaseStatus = eq.status === 'sold' && log.action === 'sell' ? 'active' : eq.status;
      }
    });
    s.goals.forEach((g) => {
      g.target = Number(g.target) || 0;
      g.current = Number(g.current) || 0;
      g.logs = Array.isArray(g.logs) ? g.logs : [];
    });
    s.quickSettings = data.quickSettings && typeof data.quickSettings === 'object'
      ? { accounts: Number(data.quickSettings.accounts) || 5, cardPrice: Number(data.quickSettings.cardPrice) || 15000 }
      : { accounts: 5, cardPrice: 15000 };
    s.itemPrices = data.itemPrices && typeof data.itemPrices === 'object' ? data.itemPrices : {};
    this.normalizeEquipment(s, data);
    return this.normalizeOnline(s, data);
  },

  async persist() {
    const res = await window.mh.saveData(this.state);
    if (!res || !res.ok) throw new Error('保存失败：' + (res && res.error || '未知错误'));
    return res;
  },

  setCharFilter(v) {
    this.charFilter = v;
    localStorage.setItem('mh.charFilter', v);
  },

  chars() { return this.state.characters; },
  charById(id) { return this.state.characters.find(function (c) { return c.id === id; }); },
  charName(id) { const c = this.charById(id); return c ? c.name : '未知角色'; },

  /* 养成是版本 4 的可选字段，旧档案中的空值与已录入的 0 分开保存。 */
  characterNumber(value) {
    if (value == null || (typeof value === 'string' && !value.trim())) return null;
    if (!['number', 'string'].includes(typeof value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  },

  normalizeCharacterProgress(value) {
    const data = value && typeof value === 'object' ? value : {};
    const skills = (list) => Array.isArray(list) ? list.filter((skill) => skill && typeof skill.name === 'string' && skill.name.trim())
      .map((skill) => ({ name: skill.name.trim(), level: this.characterNumber(skill.level) })) : [];
    const training = (key, fields) => Object.fromEntries(fields.map((field) =>
      [field.key, this.characterNumber(data[key] && data[key][field.key])]));
    return {
      schoolSkills: skills(data.schoolSkills), auxiliarySkills: skills(data.auxiliarySkills),
      training: training('training', this.characterTraining), petTraining: training('petTraining', this.petTraining),
      qianyuanPills: this.characterNumber(data.qianyuanPills), potentialFruits: this.characterNumber(data.potentialFruits),
      note: typeof data.note === 'string' ? data.note : '',
    };
  },

  /** 新建和编辑角色只在写入成功后确认；失败恢复角色集合，表单可直接重试。 */
  async saveCharacter(data, id) {
    const previous = id && this.charById(id);
    if (id && !previous) throw new Error('角色不存在');
    const name = String(data.name == null ? previous && previous.name || '' : data.name).trim();
    if (!name) throw new Error('请填写角色昵称');
    const level = data.level === undefined && previous ? previous.level : data.level;
    if (level != null && level !== '' && this.characterNumber(level) === null) throw new Error('角色等级需填写非负整数');
    const saved = Object.assign({}, previous || { id: U.uid(), createdAt: Date.now() }, {
      name, level: this.characterNumber(level),
      school: data.school === undefined && previous ? previous.school : data.school || '',
      server: data.server === undefined && previous ? previous.server : String(data.server || '').trim(),
      progress: this.normalizeCharacterProgress(data.progress === undefined && previous ? previous.progress : data.progress),
    });
    const snapshot = this.state.characters;
    this.state.characters = previous ? snapshot.map((character) => character.id === id ? saved : character) : [...snapshot, saved];
    try {
      this.equipmentProfile(saved.id);
      await this.persist();
      return saved;
    } catch (error) {
      this.state.characters = snapshot;
      throw error;
    }
  },

  async saveCharacterProgress(id, changes) {
    const character = this.charById(id);
    if (!character) throw new Error('角色不存在');
    const progress = this.normalizeCharacterProgress(character.progress);
    const checkNumber = (value, label) => {
      if (value != null && value !== '' && this.characterNumber(value) === null) throw new Error(label + '需填写非负整数');
    };
    for (const [key, value] of Object.entries(changes)) {
      if (!Object.hasOwn(progress, key)) throw new Error('未知的角色养成项目');
      if (['schoolSkills', 'auxiliarySkills'].includes(key)) {
        if (!Array.isArray(value)) throw new Error('技能记录格式不正确');
        const names = new Set();
        value.forEach((skill) => {
          if (!skill || typeof skill.name !== 'string' || !skill.name.trim()) throw new Error('请填写技能名称');
          const name = skill.name.trim();
          if (names.has(name)) throw new Error('技能名称重复：' + name);
          names.add(name);
          checkNumber(skill.level, name + '等级');
        });
      } else if (key === 'training' || key === 'petTraining') {
        const fields = key === 'training' ? this.characterTraining : this.petTraining;
        if (!value || typeof value !== 'object') throw new Error('修炼记录格式不正确');
        fields.forEach((field) => checkNumber(value[field.key], field.label));
      } else if (key !== 'note') {
        checkNumber(value, key === 'qianyuanPills' ? '乾元丹数量' : '潜能果数量');
      }
      progress[key] = value;
    }
    return this.saveCharacter({ progress }, id);
  },

  /** 角色删除与全部关联记录一并落盘，失败时整体恢复。 */
  async removeCharacter(id) {
    if (!this.charById(id)) throw new Error('角色不存在');
    const snapshot = JSON.parse(JSON.stringify(this.state));
    const equipmentIds = new Set(this.state.equipment.filter((eq) => eq.characterId === id).map((eq) => eq.id));
    this.state.characters = this.state.characters.filter((character) => character.id !== id);
    ['transactions', 'sessions', 'goals', 'equipment'].forEach((key) => {
      this.state[key] = this.state[key].filter((item) => item.characterId !== id);
    });
    this.state.gearLogs = this.state.gearLogs.filter((log) => log.characterId !== id && !equipmentIds.has(log.equipmentId));
    if (this.state.activeSession && this.state.activeSession.characterId === id) this.state.activeSession = null;
    try {
      await this.persist();
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  },

  /* 按全局角色筛选（不筛选日期） */
  scope(list) {
    if (this.charFilter === 'all') return list;
    const f = this.charFilter;
    return list.filter(function (x) { return x.characterId === f; });
  },

  earnings(list) { return (list || this.state.transactions).filter((t) => t.ledger === 'earnings'); },
  accounts(list) { return (list || this.state.transactions).filter((t) => t.ledger === 'account'); },
  itemValue(t) { return Math.round((Number(t.quantity) || 1) * (Number(t.unitPrice) || 0) * 100) / 100; },

  txIn(charId, from, to, ledger) {
    return this.state.transactions.filter(function (t) {
      if (t.ledger !== (ledger || 'earnings')) return false;
      if (charId && charId !== 'all' && t.characterId !== charId) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
  },

  stats(txs) {
    const r = {
      income: 0, expense: 0, net: 0, cashNet: 0, reserveNet: 0, reserveIncome: 0,
      minutes: 0, count: txs.length, itemEstimate: 0, itemCount: 0
    };
    txs.forEach(function (t) {
      if (t.ledger === 'account') return;
      if (t.recordType === 'item') {
        if (t.status === 'held') { r.itemEstimate += D.itemValue(t); r.itemCount += t.quantity; }
        return;
      }
      const amt = Number(t.amount) || 0;
      if (t.kind === 'income') r.income += amt; else r.expense += amt;
      if (t.kind === 'income' && t.currency === 'reserve') r.reserveIncome += amt;
      if (t.currency === 'reserve') r.reserveNet += (t.kind === 'income' ? amt : -amt);
      else r.cashNet += (t.kind === 'income' ? amt : -amt);
      if (t.minutes && !t.sessionId) r.minutes += t.minutes;
    });
    r.net = r.income - r.expense;
    return r;
  },

  accountStats(txs, currency) {
    const r = { income: 0, expense: 0, net: 0, fees: 0, count: 0 };
    txs.forEach((t) => {
      if (t.ledger !== 'account' || (t.currency !== currency && !(currency === 'cash' && t.currency === 'reserve'))) return;
      const fee = Number(t.fee) || 0;
      if (t.kind === 'income') r.income += t.amount - fee;
      else r.expense += t.amount + fee;
      r.fees += fee; r.count++;
    });
    r.net = r.income - r.expense;
    return r;
  },

  settleItem(item, data) {
    if (item.recordType !== 'item' || item.status === 'sold') throw new Error('该物品无法重复出售');
    if (!Number.isFinite(data.amount) || data.amount < 0 || !data.date || data.date < item.date) throw new Error('请填写有效成交金额，出售日期不能早于获得日期');
    const sale = {
      id: U.uid(), ledger: 'earnings', recordType: 'money', characterId: item.characterId,
      date: data.date, kind: 'income', currency: 'cash', category: '摆摊卖货',
      amount: data.amount, minutes: 0, note: item.itemName + ' ×' + item.quantity + ' 出售' + (data.note ? ' · ' + data.note : ''),
      itemRecordId: item.id, createdAt: Date.now()
    };
    item.status = 'sold'; item.saleId = sale.id;
    this.state.transactions.push(sale);
    return sale;
  },

  removeTransaction(id) {
    const tx = this.state.transactions.find((t) => t.id === id);
    if (!tx) return;
    if (tx.sessionId) { this.removeSession(tx.sessionId); return; }
    if (tx.itemRecordId) {
      const item = this.state.transactions.find((t) => t.id === tx.itemRecordId);
      if (item) { item.status = 'held'; delete item.saleId; }
    }
    this.state.transactions = this.state.transactions.filter((t) => t.id !== id && t.itemRecordId !== id);
    this.state.gearLogs = this.state.gearLogs.filter((l) => l.transactionId !== id);
    if (tx.equipmentId) this.syncEquipmentStatus(tx.equipmentId);
  },

  syncEquipmentStatus(id) {
    const eq = this.state.equipment.find((e) => e.id === id);
    if (!eq) return;
    const trade = this.gearLogsOf(id).find((l) => ['buy', 'sell'].includes(l.action));
    eq.status = trade ? (trade.action === 'sell' ? 'sold' : 'active') : (eq.tradeBaseStatus || eq.status);
    if (eq.status === 'sold') this.clearEquipmentReferences(id);
  },

  syncAccountEquipment(tx) {
    const eq = tx.equipmentId && this.state.equipment.find((e) => e.id === tx.equipmentId);
    if (tx.equipmentId && (!eq || eq.characterId !== tx.characterId)) throw new Error('关联装备必须属于所选角色');
    this.state.gearLogs = this.state.gearLogs.filter((l) => l.transactionId !== tx.id);
    if (!eq) return;
    if (!eq.tradeBaseStatus) eq.tradeBaseStatus = eq.status;
    this.state.gearLogs.push({
      id: U.uid(), transactionId: tx.id, equipmentId: eq.id, characterId: tx.characterId,
      date: tx.date, action: tx.gearAction || (tx.kind === 'income' ? 'sell' : 'buy'), amount: tx.amount,
      currency: tx.currency, fee: tx.fee || 0, note: tx.note || '', synced: true, createdAt: tx.createdAt
    });
    this.syncEquipmentStatus(eq.id);
  },

  goalTypeText(v) {
    const it = this.goalTypes.find(function (x) { return x.v === v; });
    return it ? it.t : '目标';
  },

  gearAction(v) {
    return this.gearActions.find(function (x) { return x.v === v; }) || { v: 'other', t: '其他', dir: 0 };
  },

  itemPrice(id) {
    return Number(this.state.itemPrices && this.state.itemPrices[id]) || 0;
  },

  setItemPrice(id, price) {
    if (!this.state.itemPrices) this.state.itemPrices = {};
    this.state.itemPrices[id] = price;
  },

  gearLogsOf(eqId) {
    return this.state.gearLogs
      .slice().reverse()
      .filter(function (l) { return l.equipmentId === eqId; })
      .sort(function (a, b) { return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0); });
  }
};
