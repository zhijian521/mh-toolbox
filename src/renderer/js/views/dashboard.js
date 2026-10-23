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

Views.loadDemoData = async function () {
  const ok = await UI.confirmModal({ title: '加载示例数据', message: '将写入一套演示用的角色、收益、目标与装备数据，方便你快速了解界面。确定加载吗？', confirmText: '加载' });
  if (!ok) return;
  const cid = U.uid();
  const now = Date.now();
  const t = function (dayAgo, kind, cat, amt, minutes, note) {
    const d = new Date(); d.setDate(d.getDate() - dayAgo);
    return { id: U.uid(), characterId: cid, date: U.fmtDate(d), kind: kind, currency: 'cash', amount: amt, category: cat, minutes: minutes || 0, note: note || '', createdAt: now - dayAgo };
  };
  D.state = {
    characters: [{ id: cid, name: '养老一号', level: 69, school: '大唐官府', server: '紫禁城', createdAt: now }],
    transactions: [
      t(6, 'income', '捉鬼', 86, 95, '20个鬼'), t(6, 'income', '押镖', 30, 40, ''),
      t(5, 'income', '师门', 22, 30, ''), t(5, 'expense', '点卡', 16, 0, '5小时点卡'),
      t(4, 'income', '副本', 65, 120, '乌鸡+车迟'), t(3, 'income', '摆摊卖货', 140, 0, '卖了两件环装'),
      t(2, 'income', '捉鬼', 82, 90, ''), t(1, 'income', '封妖', 48, 60, ''),
      t(1, 'expense', '药品补给', 12, 0, '买血蓝'), t(0, 'income', '押镖', 30, 40, '今天的镖')
    ],
    goals: [{ id: U.uid(), characterId: cid, type: 'gear', title: '攒钱买 120 简易武器', target: 3000, current: 513, unit: '万', status: 'active', deadline: '', note: '目标三个月内拿下', createdAt: now, logs: [{ id: U.uid(), date: U.today(), delta: 513, note: '当前存款' }] }],
    equipment: [
      { id: U.uid(), characterId: cid, slot: '武器', name: '偃月青龙刀', level: 110, attributes: '伤害 +620\n命中 +380', special: '无级别限制', gems: '太阳石 x4', status: 'active', note: '上周换的', createdAt: now },
      { id: U.uid(), characterId: cid, slot: '项链', name: '碧水青龙项链', level: 100, attributes: '灵力 +168', special: '简易', gems: '舍利子 x3', status: 'active', note: '', createdAt: now }
    ],
    gearLogs: []
  };
  await D.persist();
  Views.refreshHeader();
  Views.dashboard();
  UI.toast('示例数据已加载');
};
