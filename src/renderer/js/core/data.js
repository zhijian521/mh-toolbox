'use strict';
/* 数据层：状态、常量、持久化 */
const D = window.D = {
  state: { characters: [], transactions: [], goals: [], equipment: [], gearLogs: [] },
  charFilter: localStorage.getItem('mh.charFilter') || 'all',

  incomeCats: ['捉鬼', '押镖', '师门', '封妖', '副本', '周末活动', '节日活动', '摆摊卖货', '物品掉落', '宝图', '牧场', '种植', '帮派产出', '其他收入'],
  expenseCats: ['点卡', '修理装备', '药品补给', '装备购入', '打造费用', '其他支出'],
  slots: ['武器', '头盔', '项链', '衣服', '腰带', '鞋子', '戒指', '耳饰', '手镯', '佩饰', '其他'],
  schools: ['大唐官府', '方寸山', '化生寺', '女儿村', '神木林', '凌波城', '花果山', '天机城', '魔王寨', '阴曹地府', '狮驼岭', '盘丝洞', '无底洞', '女魃墓', '天宫', '龙宫', '五庄观', '普陀山', '九黎城', '东海渊', '其他'],
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
    { v: 'other', t: '其他', dir: 0 }
  ],

  async init() {
    const res = await window.mh.loadData();
    if (res && res.ok && res.data) this.state = this.normalize(res.data);
    else this.state = this.normalize({});
  },

  normalize(data) {
    const s = {
      characters: Array.isArray(data.characters) ? data.characters : [],
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      goals: Array.isArray(data.goals) ? data.goals : [],
      equipment: Array.isArray(data.equipment) ? data.equipment : [],
      gearLogs: Array.isArray(data.gearLogs) ? data.gearLogs : []
    };
    s.transactions.forEach((t) => {
      t.amount = Number(t.amount) || 0;
      t.minutes = Number(t.minutes) || 0;
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
    return s;
  },

  persist() {
    return window.mh.saveData(this.state);
  },

  setCharFilter(v) {
    this.charFilter = v;
    localStorage.setItem('mh.charFilter', v);
  },

  chars() { return this.state.characters; },
  charById(id) { return this.state.characters.find(function (c) { return c.id === id; }); },
  charName(id) { const c = this.charById(id); return c ? c.name : '未知角色'; },

  /* 按全局角色筛选（不筛选日期） */
  scope(list) {
    if (this.charFilter === 'all') return list;
    const f = this.charFilter;
    return list.filter(function (x) { return x.characterId === f; });
  },

  txIn(charId, from, to) {
    return this.state.transactions.filter(function (t) {
      if (charId && charId !== 'all' && t.characterId !== charId) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    });
  },

  stats(txs) {
    const r = {
      income: 0, expense: 0, net: 0, cashNet: 0, reserveNet: 0,
      minutes: 0, count: txs.length, timedNet: 0, timedMinutes: 0
    };
    txs.forEach(function (t) {
      const amt = Number(t.amount) || 0;
      if (t.kind === 'income') r.income += amt; else r.expense += amt;
      if (t.currency === 'reserve') r.reserveNet += (t.kind === 'income' ? amt : -amt);
      else r.cashNet += (t.kind === 'income' ? amt : -amt);
      if (t.minutes) {
        r.minutes += t.minutes;
        r.timedNet += (t.kind === 'income' ? amt : -amt);
        r.timedMinutes += t.minutes;
      }
    });
    r.net = r.income - r.expense;
    r.hourly = r.timedMinutes ? (r.timedNet / (r.timedMinutes / 60)) : null;
    return r;
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
      .filter(function (l) { return l.equipmentId === eqId; })
      .sort(function (a, b) { return b.date < a.date ? -1 : 1; });
  }
};
