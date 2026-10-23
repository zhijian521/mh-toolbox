'use strict';
/* 总览页 */
const Views = window.Views = window.Views || {};
Views._range = 'month';

Views.dashboard = function () {
  const el = document.getElementById('view');
  const rangeDefs = [
    { v: 'today', t: '今日' }, { v: 'week', t: '本周' },
    { v: 'month', t: '本月' }, { v: 'year', t: '今年' }, { v: 'all', t: '全部' }
  ];
  const rangeKey = Views._range;
  const range = U.rangeFor(rangeKey);
  const txs = D.txIn(D.charFilter, range.from, range.to);
  const st = D.stats(txs);
  const hasAny = D.state.transactions.length || D.state.characters.length;
  const rangeLabel = rangeDefs.find(function (r) { return r.v === rangeKey; }).t;

  if (!hasAny) {
    el.innerHTML =
      '<div class="empty"><div class="ic">' + UI.icon('book', 32) + '</div>' +
      '<p>欢迎使用梦幻养老助手～<br>先创建一个角色，或者直接记第一笔收益</p>' +
      '<div class="btns"><button class="btn btn-gold" data-act="new-char">创建角色</button>' +
      '<button class="btn" data-act="demo">加载示例数据</button></div></div>';
    el.querySelector('[data-act="new-char"]').addEventListener('click', function () { Views.go('characters'); });
    el.querySelector('[data-act="demo"]').addEventListener('click', Views.loadDemoData);
    return;
  }

  /* 分类排行（收入） */
  const catMap = {};
  txs.forEach(function (t) {
    if (t.kind !== 'income') return;
    catMap[t.category] = (catMap[t.category] || 0) + (Number(t.amount) || 0);
  });
  const cats = Object.keys(catMap).map(function (k) { return { k: k, v: catMap[k] }; })
    .sort(function (a, b) { return b.v - a.v; }).slice(0, 8);
  const catMax = cats.length ? cats[0].v : 0;

  /* 最近 14 天每日净收益 */
  const end = range.to && range.to < U.today() ? range.to : U.today();
  const start = U.addDays(end, -13);
  const dayMap = {};
  txs.forEach(function (t) {
    if (t.date >= start && t.date <= end) {
      dayMap[t.date] = (dayMap[t.date] || 0) + (t.kind === 'income' ? 1 : -1) * (Number(t.amount) || 0);
    }
  });
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = U.addDays(start, i);
    days.push({ d: d, v: dayMap[d] || 0 });
  }
  const dayMax = Math.max.apply(null, days.map(function (x) { return Math.abs(x.v); }).concat([1]));

  /* 进行中目标 */
  const goals = D.scope(D.state.goals).filter(function (g) { return g.status === 'active'; })
    .sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 5);

  /* 最近记录 */
  const recent = D.scope(D.state.transactions).slice().sort(function (a, b) {
    return b.date === a.date ? (b.createdAt || 0) - (a.createdAt || 0) : (b.date > a.date ? 1 : -1);
  }).slice(0, 8);

  el.innerHTML =
    '<div class="filter-bar">' +
      '<div class="seg" style="background:var(--panel2)">' +
        rangeDefs.map(function (r) {
          return '<button type="button" class="seg-btn' + (r.v === rangeKey ? ' on' : '') + '" data-range="' + r.v + '">' + r.t + '</button>';
        }).join('') + '</div>' +
      '<span class="badge">' + (range.from ? range.from + ' ~ ' + range.to : '全部时间') + '</span>' +
    '</div>' +

    '<div class="stat-grid">' +
      statCard('总收入', U.fmtMoney(st.income), 'good', '现金+储备') +
      statCard('总支出', U.fmtMoney(st.expense), 'bad', '含点卡等成本') +
      statCard('净收益', U.fmtMoney(st.net), st.net >= 0 ? 'good' : 'bad', '现金 ' + U.fmtMoney(st.cashNet) + ' · 储备 ' + U.fmtMoney(st.reserveNet)) +
      statCard('时薪', st.hourly != null ? U.fmtMoney(st.hourly) + '/时' : '—', 'hi', '按已填用时的记录计算') +
      statCard('记录笔数', U.fmtInt(st.count), '', '累计用时 ' + U.fmtMinutes(st.minutes)) +
    '</div>' +

    '<div class="dash-grid" style="margin-top:16px">' +
      '<div class="dash-col">' +
        '<div class="card"><div class="card-title">每日净收益<span class="sub">近 14 天（' + rangeLabel + '范围内）</span></div>' +
          '<div class="chart">' + days.map(function (x) {
            const h = Math.max(3, Math.round((Math.abs(x.v) / dayMax) * 92));
            const tip = x.d.slice(5) + (x.v >= 0 ? ' 净收 ' : ' 净支 ') + U.fmtMoney(Math.abs(x.v));
            return '<div class="bar-col" title="' + U.esc(tip) + '">' +
              '<div class="bar-track"><i class="bar' + (x.v < 0 ? ' neg' : '') + '" style="height:' + h + 'px"></i></div>' +
              '<span class="bar-lab">' + x.d.slice(5) + '</span></div>';
          }).join('') + '</div></div>' +

        '<div class="card"><div class="card-title">最近记录</div>' +
          (recent.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th><th>角色</th><th>分类</th><th class="num">金额</th><th>备注</th></tr></thead><tbody>' +
            recent.map(function (t) {
              return '<tr><td>' + U.esc(t.date.slice(5)) + '</td><td>' + U.esc(D.charName(t.characterId)) + '</td>' +
                '<td><span class="badge ' + (t.kind === 'income' ? 'in' : 'out') + '">' + U.esc(t.category) + '</span></td>' +
                '<td class="num"><span class="' + (t.kind === 'income' ? 'money-in' : 'money-out') + '">' + (t.kind === 'income' ? '+' : '-') + U.fmtMoney(t.amount) + '</span>' +
                (t.currency === 'reserve' ? '<div class="cell-sub">储备金</div>' : '') + '</td>' +
                '<td class="ellipsis">' + U.esc(t.note || '') + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<div class="empty" style="padding:24px"><p>该范围内还没有记录</p></div>') +
        '</div>' +
      '</div>' +

      '<div class="dash-col">' +
        '<div class="card"><div class="card-title">分类收益排行<span class="sub">' + rangeLabel + '</span></div>' +
          (cats.length ? cats.map(function (c, i) {
            return '<div class="rank-row"><span class="rank-name">' + (i + 1) + '. ' + U.esc(c.k) + '</span>' +
              '<div class="rank-track"><i class="rank-fill" style="width:' + (catMax ? Math.round(c.v / catMax * 100) : 0) + '%"></i></div>' +
              '<span class="rank-val">' + U.fmtMoney(c.v) + '</span></div>';
          }).join('') : '<div class="empty" style="padding:24px"><p>暂无收入记录</p></div>') +
        '</div>' +
        '<div class="card"><div class="card-title">进行中的目标</div>' +
          (goals.length ? goals.map(function (g) {
            const pct = g.target ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
            return '<div style="margin-bottom:14px">' +
              '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">' +
              '<span>' + U.esc(g.title) + '</span><span style="color:var(--gold2)">' + U.fmtMoney(g.current) + ' / ' + U.fmtMoney(g.target) + '</span></div>' +
              '<div class="progress"><i style="width:' + pct + '%"></i></div></div>';
          }).join('') : '<div class="empty" style="padding:24px"><p>还没有进行中的目标<br><button class="btn btn-sm" style="margin-top:10px" data-act="new-goal">去创建目标</button></p></div>') +
        '</div>' +
      '</div>' +
    '</div>';

  function statCard(k, v, cls, d) {
    return '<div class="stat ' + (cls || '') + '"><div class="k">' + U.esc(k) + '</div><div class="v">' + U.esc(v) + '</div>' + (d ? '<div class="d">' + U.esc(d) + '</div>' : '') + '</div>';
  }

  el.querySelectorAll('[data-range]').forEach(function (b) {
    b.addEventListener('click', function () {
      Views._range = b.dataset.range;
      Views.dashboard();
    });
  });
  const newGoal = el.querySelector('[data-act="new-goal"]');
  if (newGoal) newGoal.addEventListener('click', function () { Views.go('goals'); });
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
  tx(0, c1, 'expense', '点卡', 22.5, 150, '在线 2.50 小时 × 5 角色', { source: 'quick' });

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

  D.state = {
    characters: characters, transactions: transactions, goals: goals,
    equipment: equipment, gearLogs: gearLogs,
    itemPrices: itemPrices,
    quickSettings: { accounts: 5, cardPrice: 15000 }
  };
  D.setCharFilter('all');
  if (persist) await D.persist();
  Views.refreshHeader();
  Views.dashboard();
};
