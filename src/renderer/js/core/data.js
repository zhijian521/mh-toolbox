'use strict';
/* 数据层：状态、常量、持久化 */
const D = window.D = {
  state: { schemaVersion: 2, characters: [], transactions: [], goals: [], equipment: [], gearLogs: [] },
  charFilter: localStorage.getItem('mh.charFilter') || 'all',

  incomeCats: ['捉鬼', '押镖', '师门', '封妖', '副本', '周末活动', '节日活动', '摆摊卖货', '物品掉落', '宝图', '牧场', '种植', '帮派产出', '其他收入'],
  expenseCats: ['点卡', '修理装备', '药品补给', '其他支出'],
  accountCats: ['装备交易', '召唤兽交易', '点卡充值', '游戏币买入', '游戏币卖出', '养成投入', '其他收支'],
  channels: ['游戏内', '藏宝阁', '官方充值', '其他'],
  itemStatuses: { held: '持有', sold: '已出售', self: '自用' },
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
    if (!res || !res.ok) throw new Error('读取数据失败：' + (res && res.error || '未知错误'));
    this.state = this.normalize(res.data || {});
    if (res.data && res.data.schemaVersion !== 2) await this.persist();
  },

  normalize(data) {
    data = data && typeof data === 'object' ? data : {};
    const s = {
      schemaVersion: 2,
      characters: Array.isArray(data.characters) ? data.characters : [],
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
    return s;
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
      minutes: 0, count: txs.length, itemEstimate: 0, itemCount: 0, timedNet: 0, timedMinutes: 0
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
      .filter(function (l) { return l.equipmentId === eqId; })
      .sort(function (a, b) { return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0); });
  }
};
