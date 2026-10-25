'use strict';
/* 两类账本共享的筛选、表格与记录操作 */
Views._recordFilters = {};
Views.recordFilter = function (ledger) {
  return Views._recordFilters[ledger] || (Views._recordFilters[ledger] = {
    kind: '', category: '', recordType: '', currency: '', from: '', to: '', kw: '', page: 0
  });
};
Views.recordList = function (ledger) {
  const account = ledger === 'account';
  const el = document.getElementById('view');
  const f = Views.recordFilter(ledger);
  const render = function () { Views.recordList(ledger); };
  const list = Views.filteredRecords(ledger);
  const pages = Math.max(1, Math.ceil(list.length / 50));
  f.page = Math.min(f.page, pages - 1);
  const shown = list.slice(f.page * 50, (f.page + 1) * 50);
  const cats = account ? D.accountCats : D.incomeCats.concat(D.expenseCats);
  const allCats = Array.from(new Set(cats.concat(list.map(function (t) { return t.category; }))));
  el.innerHTML = (account ? '' : Views.earningsTabs('transactions')) +
    '<div class="filter-bar ledger-filters">' +
      '<span class="xmount" data-mount="kind"></span>' +
      '<span class="xmount" data-mount="type"></span>' +
      '<span class="xmount" data-mount="category"></span>' +
      '<span class="xmount" data-mount="from"></span><span>至</span><span class="xmount" data-mount="to"></span>' +
      '<input data-f="kw" value="' + U.esc(f.kw) + '" placeholder="搜索名称 / 备注" class="ledger-search" aria-label="搜索记录">' +
      '<button class="btn btn-sm btn-ghost" data-act="reset">重置</button><span class="spacer"></span>' +
      '<button class="btn" data-act="export">导出 CSV</button>' +
      '<button class="btn btn-gold" data-act="add">＋ ' + (account ? '记账号收支' : '记收益 / 物品') + '</button></div>' +
    (account ? Views.accountSummary(list) : Views.earningsSummary(list)) +
    Views.recordTable(shown, account) +
    '<div class="ledger-pagination"><span>共 ' + list.length + ' 笔 · 第 ' + (f.page + 1) + ' / ' + pages + ' 页</span>' +
      '<button class="btn btn-sm" data-act="prev"' + (f.page === 0 ? ' disabled' : '') + '>上一页</button>' +
      '<button class="btn btn-sm" data-act="next"' + (f.page + 1 >= pages ? ' disabled' : '') + '>下一页</button></div>';
  Views.bindRecordFilters(el, ledger, allCats, render);
  Views.bindRecordActions(el, ledger, render);
};

Views.filteredRecords = function (ledger) {
  const f = Views.recordFilter(ledger);
  return D.scope(ledger === 'account' ? D.accounts() : D.earnings()).filter(function (t) {
    return (!f.kind || t.kind === f.kind) && (!f.category || t.category === f.category) &&
      (!f.recordType || t.recordType === f.recordType) && (!f.currency || t.currency === f.currency || f.currency === 'cash' && t.currency === 'reserve') &&
      (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
      (!f.kw || [t.note, t.itemName, t.category, D.charName(t.characterId)].join(' ').toLowerCase().includes(f.kw.toLowerCase()));
  }).sort(function (a, b) { return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0); });
};

Views.recordTable = function (shown, account) {
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期 / 角色</th><th>类型 / 分类</th><th>记录内容</th>' +
      (account ? '<th>渠道</th>' : '<th>状态 / 用时</th>') +
      '<th class="num">' + (account ? '实收 / 实付' : '金额 / 估值') + '</th><th class="ledger-actions">操作</th></tr></thead><tbody>' +
    (shown.length ? shown.map(function (t) {
      const item = t.recordType === 'item';
      const amount = item ? D.itemHoldingValue(t) : account ? t.amount + (t.kind === 'income' ? -t.fee : t.fee) : t.amount;
      const note = item ? t.itemName + ' ×' + t.quantity : t.note || '—';
      return '<tr data-id="' + U.esc(t.id) + '"><td>' + U.esc(t.date) + '<div class="cell-sub">' + U.esc(D.charName(t.characterId)) + '</div></td>' +
        '<td><span class="badge ' + (item ? 'gold' : t.kind === 'income' ? 'in' : 'out') + '">' + (item ? '物品' : t.kind === 'income' ? '收入' : '支出') + '</span><div class="cell-sub">' + U.esc(t.category) + '</div></td>' +
        '<td class="ellipsis" title="' + U.esc(note + (item && t.note ? ' · ' + t.note : '')) + '">' + U.esc(note) +
          (t.equipmentId ? '<div class="cell-sub">关联装备：' + U.esc((D.state.equipment.find(function (e) { return e.id === t.equipmentId; }) || {}).name || '档案已删除') + '</div>' : '') +
          (t.itemRecordId ? '<div class="cell-sub">物品出售结算 · ' + t.saleQuantity + ' 件</div>' : '') + '</td>' +
        '<td>' + (account ? U.esc(t.channel) : item ? '<span class="badge">' + U.esc(D.itemStatuses[t.status]) + '</span><div class="cell-sub">剩余 ' + D.itemRemaining(t) + ' / 获得 ' + t.quantity + '</div>' : U.fmtMinutes(t.minutes)) + '</td>' +
        '<td class="num"><span class="' + (item ? 'money-estimate' : t.kind === 'income' ? 'money-in' : 'money-out') + '">' +
          (item ? '' : t.kind === 'income' ? '+' : '−') + U.fmtAmount(amount, t.currency) + '</span><div class="cell-sub">' +
          (item ? '参考估值，不计入游戏币收入' : account ? (t.currency === 'rmb' ? '人民币' : t.currency === 'reserve' ? '储备金' : '梦幻币') + (t.fee ? ' · 手续费 ' + U.fmtAmount(t.fee, t.currency) : '') : t.currency === 'reserve' ? '储备金' : '游戏币') + '</div></td>' +
        '<td class="ledger-actions">' + (item && t.status !== 'sold' ? '<button class="btn btn-sm btn-ghost" data-act="sell">出售</button>' : '') +
          '<button class="btn btn-sm btn-ghost" data-act="edit">编辑</button>' +
          (!item && !t.sessionId && !t.itemRecordId && !t.equipmentId && t.currency !== 'rmb' && t.currency !== 'reserve' ? '<button class="btn btn-sm btn-ghost" data-act="move">转账本</button>' : '') +
          '<button class="btn btn-sm btn-ghost btn-danger" data-act="del">删除</button></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty"><p>暂无记录，可以新增一笔或调整筛选条件。</p></div></td></tr>') +
    '</tbody></table></div>';
};

Views.bindRecordFilters = function (el, ledger, allCats, render) {
  const account = ledger === 'account';
  const f = Views.recordFilter(ledger);
  const select = function (mount, key, options) {
    UI.select(el.querySelector('[data-mount="' + mount + '"]'), { options: options, value: f[key], onChange: function (v) { f[key] = v; f.page = 0; render(); } });
  };
  select('kind', 'kind', [{ v: '', t: '全部收支' }, { v: 'income', t: '收入 / 获得' }, { v: 'expense', t: '支出' }]);
  select('type', account ? 'currency' : 'recordType', account
    ? [{ v: '', t: '全部币种' }, { v: 'rmb', t: '人民币' }, { v: 'cash', t: '梦幻币' }]
    : [{ v: '', t: '全部内容' }, { v: 'money', t: '游戏币' }, { v: 'item', t: '物品' }]);
  select('category', 'category', [{ v: '', t: '全部分类' }].concat(allCats.map(function (c) { return { v: c, t: c }; })));
  if (!account) Views.bindEarningsTabs(el);
  ['from', 'to'].forEach(function (key) {
    UI.date(el.querySelector('[data-mount="' + key + '"]'), { value: f[key], placeholder: key === 'from' ? '开始日期' : '结束日期', onChange: function (v) {
      const next = Object.assign({}, f, { [key]: v });
      if (next.from && next.to && next.from > next.to) { UI.toast('开始日期不能晚于结束日期', 'err'); render(); return; }
      f[key] = v; f.page = 0; render();
    } });
  });
  el.querySelector('[data-f="kw"]').addEventListener('keydown', function (e) { if (e.key === 'Enter') { f.kw = e.target.value.trim(); f.page = 0; render(); } });
  el.querySelector('[data-act="reset"]').onclick = function () { delete Views._recordFilters[ledger]; render(); };
  el.querySelector('[data-act="add"]').onclick = function () { account ? Views.accountModal() : Views.txModal(); };
  el.querySelector('[data-act="prev"]').onclick = function () { f.page--; render(); };
  el.querySelector('[data-act="next"]').onclick = function () { f.page++; render(); };
  el.querySelector('[data-act="export"]').onclick = async function () {
    try {
      f.kw = el.querySelector('[data-f="kw"]').value.trim();
      render();
      const result = await window.mh.exportCsv(D.recordsCsv(Views.filteredRecords(ledger)), (account ? '账号记录-' : '收益记录-') + U.today() + '.csv');
      if (result.ok) UI.toast('已导出全部符合筛选的记录');
      else if (!result.canceled) UI.toast('导出失败：' + result.error, 'err');
    } catch (error) { UI.toast(error.message, 'err'); }
  };
};

Views.bindRecordActions = function (el, ledger, render) {
  const account = ledger === 'account';
  el.querySelectorAll('tr[data-id]').forEach(function (row) {
    const tx = D.state.transactions.find(function (t) { return t.id === row.dataset.id; });
    row.querySelector('[data-act="edit"]').onclick = function () { account ? Views.accountModal(tx) : Views.txModal(tx); };
    const sell = row.querySelector('[data-act="sell"]');
    if (sell) sell.onclick = function () { Views.itemSellModal(tx); };
    const move = row.querySelector('[data-act="move"]');
    if (move) move.onclick = function () { account ? Views.txModal(tx, true) : Views.accountModal(tx, true); };
    row.querySelector('[data-act="del"]').onclick = async function () {
      const linked = tx.sessionId ? '整段在线记录与所有日期的关联点卡支出会一并删除。' : tx.saleId ? '关联的全部出售收入也会删除。' : tx.itemRecordId ? '本次成交数量将恢复到物品库存。' : tx.equipmentId ? '关联的装备变动也会删除。' : '';
      const ok = await UI.confirmModal({ title: '删除记录', message: '确定删除这条记录吗？' + linked, danger: true, confirmText: '删除' });
      if (!ok) return;
      try {
        if (tx.sessionId) await D.commitOnline(() => D.removeSession(tx.sessionId));
        else await D.commit(() => D.removeTransaction(tx.id));
        UI.toast('已删除'); render();
      } catch (e) { UI.toast(e.message, 'err'); }
    };
  });
};
Views.earningsSummary = function (list) {
  const st = D.stats(list);
  return '<div class="ledger-summary"><span>游戏币收入 <b class="money-in">' + U.fmtMoney(st.income) + '</b></span>' +
    '<span>日常成本 <b class="money-out">' + U.fmtMoney(st.expense) + '</b></span><span>净收益 <b>' + U.fmtMoney(st.net) + '</b></span>' +
    '<span>持有物品估值 <b class="money-estimate">' + U.fmtMoney(st.itemEstimate) + '</b></span></div>';
};
Views.accountSummary = function (list) {
  return '<div class="account-totals">' + ['rmb', 'cash'].map(function (currency) {
    const st = D.accountStats(list, currency);
    return '<div class="ledger-summary"><b>' + (currency === 'rmb' ? '人民币' : '梦幻币') + '</b><span>收入 <b class="money-in">' + U.fmtAmount(st.income, currency) + '</b></span>' +
      '<span>支出 <b class="money-out">' + U.fmtAmount(st.expense, currency) + '</b></span><span>收支差额 <b>' + U.fmtAmount(st.net, currency) + '</b></span></div>';
  }).join('') + '</div>';
};
