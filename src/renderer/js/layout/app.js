'use strict';
/* 应用入口：路由与全局 UI */
Views._pages = [
  { id: 'dashboard', t: '总览', icon: 'chart', sub: '收益统计与目标进度' },
  { id: 'quick', t: '快速记录', icon: 'bolt', sub: '在线计时 · 点卡消耗 · 物品掉落速记' },
  { id: 'transactions', t: '收益记录', icon: 'ledger', sub: '记录每一笔收入与支出' },
  { id: 'goals', t: '目标', icon: 'target', sub: '存钱、装备与养成目标' },
  { id: 'equipment', t: '装备', icon: 'sword', sub: '装备档案与更新时间线' },
  { id: 'characters', t: '角色', icon: 'user', sub: '管理你的养老角色' },
  { id: 'backup', t: '备份与设置', icon: 'archive', sub: '数据备份、导入与关于' }
];
Views._current = 'dashboard';

Views.renderNav = function () {
  const nav = document.getElementById('nav');
  nav.innerHTML = Views._pages.map(function (p) {
    return '<div class="nav-item' + (p.id === Views._current ? ' on' : '') + '" data-page="' + p.id + '">' +
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
};

Views.refreshHeader = function () {
  const sel = document.getElementById('char-select');
  sel.innerHTML = '<option value="all">全部角色</option>' +
    D.state.characters.map(function (c) {
      return '<option value="' + U.esc(c.id) + '"' + (D.charFilter === c.id ? ' selected' : '') + '>' + U.esc(c.name) + '</option>';
    }).join('');
  if (!D.charById(D.charFilter)) { D.setCharFilter('all'); sel.value = 'all'; }
};

Views.go = function (page) {
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
  try {
    const info = await window.mh.info();
    document.getElementById('ver').textContent = info.version || '-';
  } catch (e) { /* 版本号获取失败不影响使用 */ }

  document.getElementById('char-select').addEventListener('change', function (e) {
    D.setCharFilter(e.target.value);
    Views.rerender();
  });
  document.getElementById('quick-add').addEventListener('click', function () { Views.txModal(); });
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
})().catch(function (err) {
  document.getElementById('view').innerHTML =
    '<div class="empty"><p>启动失败：' + U.esc(String(err && err.message || err)) + '</p></div>';
});
