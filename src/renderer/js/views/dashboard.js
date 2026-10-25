'use strict';
/* 总览页 */
const Views = window.Views = window.Views || {};
Views._dashboardRanges = { earnings: { preset: 'today' }, account: { preset: 'month' } };

Views.statHtml = function (label, value, cls, sub) {
  return '<div class="stat ' + (cls || '') + '"><div class="k">' + U.esc(label) + '</div><div class="v">' + U.esc(value) + '</div><div class="d">' + U.esc(sub || '') + '</div></div>';
};
Views.ledgerTrend = function (records, end, currency) {
  const start = U.addDays(end, -13);
  const days = [];
  for (let n = 0; n < 14; n++) {
    const date = U.addDays(start, n);
    const value = records.filter(function (t) { return t.date === date && t.recordType !== 'item' && (t.currency === currency || currency === 'cash' && t.currency === 'reserve'); })
      .reduce(function (sum, t) { return sum + (t.kind === 'income' ? t.amount - (t.fee || 0) : -t.amount - (t.fee || 0)); }, 0);
    days.push({ date: date, value: value });
  }
  const max = Math.max(1, ...days.map(function (d) { return Math.abs(d.value); }));
  return '<div class="chart">' + days.map(function (d) {
    return '<div class="bar-col" title="' + U.esc(d.date + ' 收支差额 ' + U.fmtAmount(d.value, currency)) + '"><div class="bar-track"><i class="bar' + (d.value < 0 ? ' neg' : '') + '" style="height:' + Math.max(2, Math.round(Math.abs(d.value) / max * 78)) + 'px"></i></div><span class="bar-lab">' + d.date.slice(5) + '</span></div>';
  }).join('') + '</div>';
};
Views.recentRecords = function (records, account) {
  const list = records.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0); }).slice(0, 6);
  if (!list.length) return '<div class="empty"><p>该时间范围内暂无记录</p></div>';
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th><th>角色</th><th>内容</th><th class="num">金额 / 估值</th></tr></thead><tbody>' + list.map(function (t) {
    const item = t.recordType === 'item';
    const value = item ? D.itemValue(t) : t.amount + (account ? (t.kind === 'income' ? -1 : 1) * (t.fee || 0) : 0);
    return '<tr><td>' + U.esc(t.date.slice(5)) + '</td><td>' + U.esc(D.charName(t.characterId)) + '</td><td class="ellipsis" title="' + U.esc(t.note || t.category) + '">' + U.esc(item ? t.itemName + ' ×' + t.quantity : t.note || t.category) + '</td><td class="num"><span class="' + (item ? 'money-estimate' : t.kind === 'income' ? 'money-in' : 'money-out') + '">' + (item ? '估值 ' : t.kind === 'income' ? '+' : '−') + U.fmtAmount(value, t.currency) + '</span></td></tr>';
  }).join('') + '</tbody></table></div>';
};
Views.incomeRanking = function (records) {
  const totals = new Map();
  records.filter(function (t) { return t.kind === 'income' && t.recordType !== 'item'; }).forEach(function (t) {
    totals.set(t.category, (totals.get(t.category) || 0) + t.amount);
  });
  const list = Array.from(totals).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
  return '<details class="ledger-ranking"><summary>游戏币收入分类排行</summary>' +
    (list.length ? list.map(function (r, i) {
      return '<div class="rank-row"><span class="rank-name">' + (i + 1) + '. ' + U.esc(r[0]) + '</span><div class="rank-track"><i class="rank-fill" style="width:' + (list[0][1] ? Math.round(r[1] / list[0][1] * 100) : 0) + '%"></i></div><span class="rank-val">' + U.fmtMoney(r[1]) + '</span></div>';
    }).join('') : '<p class="ledger-hint">暂无游戏币收入</p>') + '</details>';
};
Views.dashboard = function () {
  const el = document.getElementById('view');
  const range = U.rangeFor(Views._dashboardRanges.earnings);
  const accountRange = U.rangeFor(Views._dashboardRanges.account);
  const earnings = D.txIn(D.charFilter, range.from, range.to);
  const accounts = D.txIn(D.charFilter, accountRange.from, accountRange.to, 'account');
  const st = D.earningsStats(D.charFilter, range.from, range.to);
  const held = D.stats(D.scope(D.earnings()));
  const end = range.to && range.to < U.today() ? range.to : U.today();
  const accountEnd = accountRange.to && accountRange.to < U.today() ? accountRange.to : U.today();
  const goals = D.orderedGoals(D.goalsFor()).map((goal) => ({ goal, summary: D.goalSummary(goal) }))
    .filter(({ summary }) => summary.status === 'active').slice(0, 4);
  if (!D.state.characters.length && !D.state.transactions.length) {
    el.innerHTML = '<div class="empty"><p>先创建一个角色，开始记录你的养老生活。</p><div class="btns"><button class="btn btn-gold" data-page="characters">创建角色</button><button class="btn" data-act="demo">加载示例数据</button></div></div>';
    el.querySelector('[data-page]').onclick = function () { Views.go('characters'); };
    el.querySelector('[data-act="demo"]').onclick = function () { Views.loadDemoData(); };
    return;
  }
  el.innerHTML = '<section class="ledger-section" data-ledger="earnings"><div class="ledger-section-head"><div><h2>日常收益</h2><p>游戏币与物品分开记，看看日常赚了多少</p></div><button class="btn btn-sm" data-page="quick">进入收益</button></div>' +
    '<div data-range-filter="earnings"></div>' +
    '<div class="stat-grid earnings-stats">' +
      Views.statHtml('游戏币收入', U.fmtMoney(st.income), 'good', '现金 ' + U.fmtMoney(st.income - st.reserveIncome) + ' · 储备 ' + U.fmtMoney(st.reserveIncome)) +
      Views.statHtml('日常成本', U.fmtMoney(st.expense), 'bad', '点卡消耗、药品、修理等') +
      Views.statHtml('净收益', U.fmtMoney(st.net), st.net >= 0 ? 'good' : 'bad', '游戏币收入 − 日常成本') +
      Views.statHtml('持有物品估值', U.fmtMoney(held.itemEstimate), 'hi', '当前持有 · 不受时间筛选影响') +
      Views.statHtml('在线净时薪', st.hourly == null ? '—' : U.fmtMoney(st.hourly) + '/时', '', '净收益 ÷ 已记录在线时长 · 已结算') + '</div>' +
    '<div class="ledger-overview-grid"><div class="card"><div class="card-title">每日游戏币净收益<span class="sub">所选范围内 · 近 14 天</span></div>' + Views.ledgerTrend(earnings, end, 'cash') + Views.incomeRanking(earnings) + '</div>' +
      '<div class="card"><div class="card-title">最近收益记录</div>' + Views.recentRecords(earnings, false) + '</div></div></section>' +
    '<section class="ledger-section" data-ledger="account"><div class="ledger-section-head"><div><h2>账号账本</h2><p>装备买卖、藏宝阁交易与充值，按币种单独统计</p></div><button class="btn btn-sm" data-page="account">进入账号</button></div>' +
    '<div data-range-filter="account"></div>' +
    '<div class="ledger-overview-grid">' + ['rmb', 'cash'].map(function (currency) {
      const sum = D.accountStats(accounts, currency);
      const rmb = currency === 'rmb';
      return '<div class="card account-overview"><div class="card-title">' + (rmb ? '人民币收支' : '梦幻币收支') + '<span class="sub">含手续费 · ' + sum.count + ' 笔</span></div><div class="account-metrics">' +
        Views.statHtml(rmb ? '总投入' : '交易支出', U.fmtAmount(sum.expense, currency), 'bad') +
        Views.statHtml(rmb ? '总回款' : '交易收入', U.fmtAmount(sum.income, currency), 'good') +
        Views.statHtml(rmb ? '净支出' : '收支差额', U.fmtAmount(rmb ? -sum.net : sum.net, currency), '') +
        '</div><p class="ledger-hint">每日收支差额 · 所选范围内近 14 天</p>' + Views.ledgerTrend(accounts, accountEnd, currency) + '</div>';
    }).join('') + '</div><div class="card"><div class="card-title">最近账号记录<span class="sub">人民币、梦幻币分别记账，不折算合计</span></div>' + Views.recentRecords(accounts, true) + '</div></section>' +
    '<section class="ledger-section"><div class="ledger-section-head"><div><h2>进行中的目标</h2><p>当前角色的养老计划</p></div><button class="btn btn-sm" data-page="goals">查看目标</button></div>' +
      (goals.length ? '<div class="goal-overview-grid">' + goals.map(function ({ goal, summary }) {
        const text = goal.tracking ? summary.achieved + ' / ' + summary.members.length + ' 个角色达标 · 每人 ' + goal.target + goal.unit :
          U.fmtNumber(goal.current) + ' / ' + U.fmtNumber(goal.target) + ' ' + (goal.unit || '万');
        return '<div class="card"><div class="card-title">' + U.esc(goal.title) + '</div><div class="ledger-summary compact"><span>' +
          U.esc(text) + '</span><b>' + summary.pct + '%</b></div><div class="progress"><i style="width:' + summary.pct + '%"></i></div></div>';
      }).join('') + '</div>' : '<div class="empty"><p>还没有进行中的目标</p></div>') + '</section>';
  ['earnings', 'account'].forEach(function (ledger) {
    UI.dateRange(el.querySelector('[data-range-filter="' + ledger + '"]'), {
      value: Views._dashboardRanges[ledger], label: ledger === 'earnings' ? '收益统计时间' : '账号统计时间',
      onChange: function (value) { Views._dashboardRanges[ledger] = value; Views.dashboard(); }
    });
  });
  el.querySelectorAll('[data-page]').forEach(function (b) { b.onclick = function () { Views.go(b.dataset.page); }; });
};

Views.loadDemoData = async function (autoConfirm, persist) {
  if (persist === undefined) persist = true;
  if (!autoConfirm) {
    const ok = await UI.confirmModal({
      title: '加载示例数据',
      message: '将写入一套演示用的角色、45 天收益流水、目标、装备与物品单价，覆盖当前全部数据。确定加载吗？',
      confirmText: '加载'
    });
    if (!ok) return;
  }
  Views.clearQuickTimer();

  /* 固定种子伪随机，保证每次生成的示例数据一致 */
  let seed = 20261023;
  const rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const rr = function (min, max) { return Math.round((min + rnd() * (max - min)) * 10) / 10; };
  const now = Date.now();
  const DAY = 86400000;
  const day = function (n) { const d = new Date(); d.setDate(d.getDate() - n); return U.fmtDate(d); };

  const c1 = 'demo-c1', c2 = 'demo-c2', c3 = 'demo-c3';
  const characters = [
    { id: c1, name: '养老一号', level: 69, school: '大唐官府', server: '紫禁城', createdAt: now - 45 * DAY },
    { id: c2, name: '方寸小号', level: 69, school: '方寸山', server: '紫禁城', createdAt: now - 40 * DAY },
    { id: c3, name: '龙宫三号', level: 109, school: '龙宫', server: '2008', createdAt: now - 30 * DAY }
  ];

  const transactions = [];
  const tx = function (n, charId, kind, cat, amt, minutes, note, extra) {
    transactions.push(Object.assign({
      id: U.uid(), characterId: charId, date: day(n),
      kind: kind, currency: 'cash', amount: amt, category: cat,
      minutes: minutes || 0, note: note || '', createdAt: now - n * 3600000 + transactions.length * 1000
    }, extra || {}));
  };

  /* 近 45 天流水：主线日常 + 周末活动 + 周期性支出 + 小号车队 */
  for (let n = 44; n >= 0; n--) {
    const d = new Date(); d.setDate(d.getDate() - n);
    const wd = d.getDay();
    if (n % 2 === 0) tx(n, c1, 'income', '捉鬼', rr(78, 92), rr(85, 100), '双份鬼');
    if (n % 3 === 0) tx(n, c1, 'income', '押镖', 30, 40, '');
    if (n % 4 === 1) tx(n, c1, 'income', '师门', rr(18, 24), 30, '', { currency: 'reserve' });
    if (n % 5 === 2) tx(n, c1, 'income', '封妖', rr(42, 52), 60, '');
    if (n % 7 === 3) tx(n, c1, 'income', '副本', rr(55, 72), 120, '乌鸡 + 车迟');
    if (wd === 6 || wd === 0) tx(n, c1, 'income', '周末活动', rr(100, 150), 150, '');
    if (n % 6 === 5) tx(n, c1, 'expense', '点卡', rr(28, 45), 0, '挂机点卡');
    if (n % 10 === 4) tx(n, c1, 'expense', '修理装备', rr(8, 15), 0, '');
    if (n % 8 === 6) tx(n, c1, 'expense', '药品补给', rr(10, 16), 0, '血蓝');
    if (n % 9 === 2) tx(n, c1, 'income', '摆摊卖货', rr(120, 260), 0, '环装 + 杂货');
    if (n % 2 === 1) tx(n, c2, 'income', '捉鬼', rr(70, 85), 90, '');
    if (n % 3 === 1) tx(n, c2, 'income', '押镖', 30, 40, '');
    if (n % 2 === 0) tx(n, c3, 'income', '副本', rr(60, 80), 130, '五开车队');
    if (n % 5 === 0) tx(n, c3, 'expense', '点卡', rr(30, 50), 0, '三号点卡');
  }
  tx(12, c1, 'expense', '装备购入', 620, 0, '装备「偃月青龙刀」购入');

  /* 近两天：快速记录产生的物品掉落与点卡（source=quick，快速页可见） */
  [
    [1, 7, 9], [1, 8, 6], [0, 7, 9], [0, 20, 30],
    [0, 13, 8], [0, 99, 10], [1, 100, 15]
  ].forEach(function (l) {
    const item = Views.quickItemById(l[1]);
    tx(l[0], c1, 'income', '物品掉落', l[2], 0, item ? item.name : '物品', { source: 'quick', itemId: l[1] });
  });
  tx(0, c1, 'expense', '点卡', 112.5, 150, '在线 2.50 小时 × 5 角色', { source: 'quick' });

  const goals = [
    {
      id: 'demo-g1', characterId: c1, type: 'gear', title: '攒钱买 120 简易武器',
      target: 3000, current: 1856, unit: '万', status: 'active',
      deadline: U.addDays(U.today(), 38), note: '拍卖行蹲了三周，就差最后一段', createdAt: now - 20 * DAY,
      logs: [
        { id: U.uid(), date: day(14), delta: 620, note: '卖旧装备回血' },
        { id: U.uid(), date: day(7), delta: 680, note: '本周捉鬼净收益' },
        { id: U.uid(), date: day(1), delta: 556, note: '周末活动 + 摆摊' }
      ]
    },
    { id: 'demo-g2', characterId: c1, type: 'money', title: '现金攒到 5000 万', target: 5000, current: 3210, unit: '万', status: 'active', deadline: '', note: '', createdAt: now - 30 * DAY, logs: [{ id: U.uid(), date: day(3), delta: 900, note: '本月结余转入' }] },
    { id: 'demo-g3', characterId: c3, type: 'progress', title: '攻修点到 20', target: 20, current: 14, unit: '级', status: 'active', deadline: '', note: '每周两次跑商', createdAt: now - 15 * DAY, logs: [] },
    { id: 'demo-g4', characterId: c1, type: 'progress', title: '养老一号升 69', target: 69, current: 69, unit: '级', status: 'done', deadline: day(18), note: '', createdAt: now - 45 * DAY, doneAt: day(18), logs: [] }
  ];

  const equipment = [
    { id: 'demo-e1', characterId: c1, slot: '武器', name: '偃月青龙刀', level: 110, attributes: '伤害 +620\n命中 +380', special: '无级别限制', gems: '太阳石 x4', status: 'active', note: '主号毕业武器', createdAt: now - 12 * DAY },
    { id: 'demo-e2', characterId: c1, slot: '项链', name: '碧水青龙项链', level: 100, attributes: '灵力 +168', special: '简易', gems: '舍利子 x3', status: 'active', note: '', createdAt: now - 25 * DAY },
    { id: 'demo-e3', characterId: c1, slot: '衣服', name: '逆鳞龙鳞甲', level: 100, attributes: '防御 +280\n体质 +18', special: '', gems: '月亮石 x2', status: 'active', note: '自己打的', createdAt: now - 33 * DAY },
    { id: 'demo-e4', characterId: c1, slot: '戒指', name: '青玉戒指', level: 80, attributes: '伤害 +32', special: '', gems: '', status: 'stored', note: '备用', createdAt: now - 28 * DAY },
    { id: 'demo-e5', characterId: c1, slot: '武器', name: '80 级旧刀', level: 80, attributes: '伤害 +420', special: '', gems: '太阳石 x2', status: 'sold', note: '换新后出掉', createdAt: now - 40 * DAY },
    { id: 'demo-e6', characterId: c3, slot: '鞋子', name: '七星履', level: 100, attributes: '速度 +56\n敏捷 +12', special: '简易', gems: '黑宝石 x3', status: 'active', note: '', createdAt: now - 9 * DAY }
  ];

  const gearLogs = [
    { id: U.uid(), equipmentId: 'demo-e1', characterId: c1, date: day(12), action: 'buy', amount: 620, note: '拍卖行拿下', createdAt: now - 12 * DAY },
    { id: U.uid(), equipmentId: 'demo-e1', characterId: c1, date: day(10), action: 'gem', amount: 60, note: '上满 4 级太阳石', createdAt: now - 10 * DAY },
    { id: U.uid(), equipmentId: 'demo-e2', characterId: c1, date: day(25), action: 'buy', amount: 380, note: '', createdAt: now - 25 * DAY },
    { id: U.uid(), equipmentId: 'demo-e3', characterId: c1, date: day(33), action: 'craft', amount: 150, note: '自己打造一次过', createdAt: now - 33 * DAY },
    { id: U.uid(), equipmentId: 'demo-e5', characterId: c1, date: day(40), action: 'buy', amount: 200, note: '当年 200 万收的', createdAt: now - 40 * DAY },
    { id: U.uid(), equipmentId: 'demo-e5', characterId: c1, date: day(12), action: 'sell', amount: 120, note: '换新武器后出售', createdAt: now - 12 * DAY },
    { id: U.uid(), equipmentId: 'demo-e6', characterId: c3, date: day(9), action: 'buy', amount: 260, note: '', createdAt: now - 9 * DAY }
  ];

  const itemPrices = {
    7: 90000, 8: 60000, 9: 55000, 10: 45000, 11: 50000, 12: 30000,
    13: 80000, 14: 150000, 15: 40000, 16: 90000, 20: 300000, 17: 12000,
    21: 80000, 99: 100000, 100: 150000, 101: 600000, 102: 80000, 103: 300000
  };

  const applyDemo = () => {
    D.state = D.normalize({
      characters: characters, transactions: transactions, goals: goals,
      equipment: equipment, gearLogs: gearLogs,
      itemPrices: itemPrices,
      quickSettings: { accounts: 5, cardPrice: 15000 }
    });

    const account = function (n, characterId, kind, currency, category, amount, fee, channel, note, equipmentId) {
      const record = { id: U.uid(), ledger: 'account', recordType: 'money', characterId, date: day(n), kind, currency, category, amount, fee, channel, note, equipmentId: equipmentId || '', minutes: 0, createdAt: now - n * DAY };
      D.state.transactions.push(record);
      if (record.equipmentId) D.syncAccountEquipment(record);
    };
    account(8, c1, 'expense', 'rmb', '装备交易', 680, 0, '藏宝阁', '购入备用青玉戒指', 'demo-e4');
    account(5, c1, 'expense', 'rmb', '点卡充值', 100, 0, '官方充值', '充值点卡 100 元');
    account(1, c1, 'income', 'rmb', '装备交易', 260, 13, '藏宝阁', '旧装备出售到账');
    account(0, c1, 'expense', 'cash', '养成投入', 80, 0, '游戏内', '给主号补修炼');
    account(3, c3, 'expense', 'rmb', '召唤兽交易', 350, 0, '藏宝阁', '购入任务须弥');
    account(0, c3, 'income', 'cash', '装备交易', 90, 0, '游戏内', '出售换下的旧鞋');
    const soldItem = D.state.transactions.find(function (t) { return t.recordType === 'item' && t.date === day(1); });
    if (soldItem) D.settleItem(soldItem, { date: day(0), amount: 8.5, note: '摆摊成交示例' });
  };
  if (persist) {
    try { await D.commit(applyDemo, { backupReason: 'demo' }); }
    catch (error) { UI.toast(error.message, 'err'); return; }
  } else applyDemo();
  Views.clearQuickTimer();
  D.setCharFilter('all');
  Views.refreshHeader();
  Views.go('dashboard');
};
