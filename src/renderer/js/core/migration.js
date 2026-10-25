'use strict';
/* 版本迁移与导入边界校验。 */
Object.assign(D, {
  validateBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.characters) ||
      !['transactions', 'equipment', 'goals'].some((key) => Array.isArray(data[key]))) {
      throw new Error('这不是应用备份文件，请选择完整数据备份；物品单价请在收益页导入');
    }
    if (data.schemaVersion != null && (!Number.isInteger(data.schemaVersion) || data.schemaVersion > this.schemaVersion)) {
      throw new Error('备份版本高于当前应用或版本格式不正确，请使用兼容版本');
    }
    for (const key of ['characters', 'transactions', 'equipment', 'goals', 'sessions', 'gearLogs']) {
      if (data[key] == null) continue;
      if (!Array.isArray(data[key]) || data[key].some((item) => !item || typeof item !== 'object' ||
        typeof item.id !== 'string' || !item.id.trim())) throw new Error('备份中的「' + key + '」格式不正确');
      if (new Set(data[key].map((item) => item.id)).size !== data[key].length) throw new Error('备份中存在重复记录 ID：' + key);
    }
  },

  normalize(data) {
    data = data && typeof data === 'object' ? data : {};
    if (data.schemaVersion > this.schemaVersion) throw new Error('数据版本高于当前应用，请升级应用后打开');
    const s = {
      schemaVersion: this.schemaVersion,
      characters: Array.isArray(data.characters) ? data.characters.map((c) => Object.assign({}, c, {
        pinned: c.pinned === true, sortOrder: this.characterNumber(c.sortOrder),
        progress: this.normalizeCharacterProgress(c.progress),
        growthHistory: this.normalizeCharacterHistory(c.growthHistory),
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
      g.pinned = g.pinned === true;
      g.sortOrder = this.characterNumber(g.sortOrder);
      const metric = g.type === 'progress' && g.tracking && this.goalMetrics.find((item) => item.v === g.tracking.category);
      g.tracking = metric ? { category: metric.v, key: ['schoolSkills', 'auxiliarySkills', 'training', 'petTraining'].includes(metric.v) &&
        typeof g.tracking.key === 'string' ? g.tracking.key.trim() : '' } : null;
      if (metric) g.unit = metric.unit;
      g.target = Number(g.target) || 0;
      g.current = Number(g.current) || 0;
      g.logs = Array.isArray(g.logs) ? g.logs : [];
      g.logs = g.logs.map((log) => Object.assign({}, log, { delta: Number(log.delta) || 0 }));
      if (!Number.isFinite(g.baseProgress)) g.baseProgress = g.current - g.logs.reduce((sum, log) => sum + (Number(log.delta) || 0), 0);
    });
    s.quickSettings = data.quickSettings && typeof data.quickSettings === 'object'
      ? { accounts: Number(data.quickSettings.accounts) || 5, cardPrice: Number(data.quickSettings.cardPrice) || 15000 }
      : { accounts: 5, cardPrice: 15000 };
    s.itemPrices = data.itemPrices && typeof data.itemPrices === 'object' ? Object.assign({}, data.itemPrices) : {};
    s.transactions.filter((tx) => tx.itemRecordId).forEach((sale) => {
      const item = s.transactions.find((tx) => tx.id === sale.itemRecordId && tx.recordType === 'item');
      if (item && sale.saleQuantity == null) sale.saleQuantity = item.quantity;
    });
    this.normalizeEquipment(s, data);
    return this.normalizeOnline(s, data);
  },
});
