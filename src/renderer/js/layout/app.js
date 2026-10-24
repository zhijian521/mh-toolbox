'use strict';
/* 应用入口：路由与全局 UI */
Views._pages = [
  { id: 'dashboard', t: '总览', icon: 'chart', sub: '日常收益 · 账号收支 · 目标进度' },
  { id: 'quick', t: '收益', icon: 'bolt', sub: '在线计时 · 物品速记 · 日常收支', records: 'transactions' },
  { id: 'account', t: '账号', icon: 'archive', sub: '装备交易 · 藏宝阁收支 · 点卡充值', records: 'accountRecords' },
  { id: 'goals', t: '目标', icon: 'target', sub: '存钱、装备与养成目标' },
  { id: 'equipment', t: '装备', icon: 'sword', sub: '装备档案与更新时间线' },
  { id: 'characters', t: '角色', icon: 'user', sub: '管理你的养老角色' },
  { id: 'backup', t: '备份与设置', icon: 'archive', sub: '数据备份、导入与关于' },
  { id: 'transactions', t: '收益记录', sub: '游戏币、物品获得与日常成本', parent: 'quick' },
  { id: 'onlineRecords', t: '在线记录', sub: '自动计时 · 手动补记 · 点卡成本', parent: 'quick' },
  { id: 'accountRecords', t: '账号记录', sub: '交易明细 · 币种与渠道筛选 · 装备关联', parent: 'account' }
];
Views._current = 'dashboard';

Views.renderNav = function () {
  const nav = document.getElementById('nav');
  const current = Views._pages.find(function (p) { return p.id === Views._current; });
  const selected = current.parent || current.id;
  nav.innerHTML = Views._pages.filter(function (p) { return !p.parent; }).map(function (p) {
    return '<div class="nav-item' + (p.id === selected ? ' on' : '') + '" data-page="' + p.id + '">' +
      '<span class="ic">' + UI.icon(p.icon, 17) + '</span><span>' + p.t + '</span></div>';
  }).join('');
  nav.querySelectorAll('[data-page]').forEach(function (item) {
    item.addEventListener('click', function () { Views.go(item.dataset.page); });
  });
};

Views.renderHeader = function () {
  const page = Views._pages.find(function (p) { return p.id === Views._current; });
  document.getElementById('page-title').textContent = page.t;
  document.getElementById('page-sub').textContent = page.sub;
  const add = document.getElementById('quick-add');
  add.hidden = !page.records;
  add.textContent = page.id === 'account' ? '＋ 记账号收支' : '＋ 手动记一笔';
  const records = document.getElementById('ledger-records');
  records.hidden = !page.records && !page.parent;
  records.textContent = page.parent ? '返回快速记录' : '查看记录';
};

Views.charOptions = function () {
  return [{ v: 'all', t: '全部角色' }].concat(
    D.state.characters.map(function (c) { return { v: c.id, t: c.name }; })
  );
};

Views.refreshHeader = function () {
  if (D.charFilter !== 'all' && !D.charById(D.charFilter)) D.setCharFilter('all');
  const sel = Views._charSel;
  if (sel) { sel.setOptions(Views.charOptions()); sel.set(D.charFilter); }
};

Views.go = function (page) {
  UI.closePop();
  Views._current = page;
  Views.renderNav();
  Views.renderHeader();
  Views.rerender();
  document.getElementById('view').scrollTop = 0;
};

Views.rerender = function () {
  Views.refreshHeader();
  (Views[Views._current] || Views.dashboard)();
};

(async function boot() {
  await D.init();
  Views._quick.recovering = !!D.state.activeSession;
  try {
    const info = await window.mh.info();
    document.getElementById('ver').textContent = info.version || '-';
  } catch (e) { /* 版本号获取失败不影响使用 */ }

  Views._charSel = UI.select(document.getElementById('char-select-mount'), {
    options: Views.charOptions(),
    value: D.charFilter,
    align: 'right',
    onChange: function (v) {
      D.setCharFilter(v);
      Views.rerender();
    }
  });
  document.getElementById('quick-add').addEventListener('click', function () { Views._current === 'account' ? Views.accountModal() : Views.txModal(); });
  document.getElementById('ledger-records').addEventListener('click', function () {
    const page = Views._pages.find(function (p) { return p.id === Views._current; });
    Views.go(page.parent || page.records);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') UI.closeModal();
  });

  Titlebar.init();
  if (window.Dev) Dev.restore();
  if (!localStorage.getItem('mh.dev')) {
    Views._current = D.state.characters.length ? 'dashboard' : 'characters';
  }
  Views.renderNav();
  Views.go(Views._current);
  if (Views._quick.recovering) Views.recoverOnline();
})().catch(function (err) {
  document.getElementById('view').innerHTML =
    '<div class="empty"><p>启动失败：' + U.esc(String(err && err.message || err)) + '</p></div>';
});
