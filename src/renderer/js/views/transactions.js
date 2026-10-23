'use strict';
/* 收益记录页 */
Views._txFilter = { kind: 'all', category: '', from: '', to: '', kw: '' };

Views.transactions = function () {
  const el = document.getElementById('view');
  const f = Views._txFilter;
  if (!D.state.characters.length) {
    el.innerHTML = Views.emptyNeedChar('先创建一个角色，才能开始记收益');
    return;
  }

  let list = D.scope(D.state.transactions);
  if (f.kind !== 'all') list = list.filter(function (t) { return t.kind === f.kind; });
  if (f.category) list = list.filter(function (t) { return t.category === f.category; });
  if (f.from) list = list.filter(function (t) { return t.date >= f.from; });
  if (f.to) list = list.filter(function (t) { return t.date <= f.to; });
  if (f.kw) list = list.filter(function (t) {
    const kw = f.kw.toLowerCase();
    return (t.note || '').toLowerCase().includes(kw) || (t.category || '').toLowerCase().includes(kw) || D.charName(t.characterId).toLowerCase().includes(kw);
  });
  list.sort(function (a, b) { return b.date === a.date ? (b.createdAt || 0) - (a.createdAt || 0) : (b.date > a.date ? 1 : -1); });

  const st = D.stats(list);
  const shown = list.slice(0, 200);
  const catOptions = [''].concat(f.kind === 'expense' ? D.expenseCats : f.kind === 'income' ? D.incomeCats : D.incomeCats.concat(D.expenseCats));

  el.innerHTML =
    '<div class="filter-bar">' +
      '<div class="seg" style="background:var(--panel2)">' +
        ['all:全部', 'income:收入', 'expense:支出'].map(function (s) {
          const a = s.split(':');
          return '<button type="button" class="seg-btn' + (f.kind === a[0] ? ' on' : '') + '" data-k="' + a[0] + '">' + a[1] + '</button>';
        }).join('') + '</div>' +
      '<select data-f="category">' + catOptions.map(function (c) {
        return '<option value="' + U.esc(c) + '"' + (f.category === c ? ' selected' : '') + '>' + (c ? c : '全部分类') + '</option>';
      }).join('') + '</select>' +
      '<input type="date" data-f="from" value="' + U.esc(f.from) + '" title="开始日期">' +
      '<span style="color:var(--muted)">~</span>' +
      '<input type="date" data-f="to" value="' + U.esc(f.to) + '" title="结束日期">' +
      '<input type="text" data-f="kw" value="' + U.esc(f.kw) + '" placeholder="搜索备注 / 分类" style="width:160px">' +
      '<button class="btn btn-sm btn-ghost" data-act="reset">重置</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-gold" data-act="add">＋ 记一笔</button>' +
    '</div>' +

    '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>日期</th><th>角色</th><th>收支</th><th>分类</th><th class="num">金额</th><th>用时</th><th>备注</th><th style="width:110px">操作</th>' +
    '</tr></thead><tbody>' +
    (shown.length ? shown.map(function (t) {
      return '<tr data-id="' + t.id + '">' +
        '<td>' + U.esc(t.date) + '</td>' +
        '<td>' + U.esc(D.charName(t.characterId)) + '</td>' +
        '<td><span class="badge ' + (t.kind === 'income' ? 'in' : 'out') + '">' + (t.kind === 'income' ? '收入' : '支出') + '</span></td>' +
        '<td>' + U.esc(t.category) + (t.currency === 'reserve' ? ' <span class="badge">储备</span>' : '') + '</td>' +
        '<td class="num"><span class="' + (t.kind === 'income' ? 'money-in' : 'money-out') + '">' + (t.kind === 'income' ? '+' : '-') + U.fmtMoney(t.amount) + '</span></td>' +
        '<td>' + U.fmtMinutes(t.minutes) + '</td>' +
        '<td class="ellipsis" title="' + U.esc(t.note || '') + '">' + U.esc(t.note || '—') + '</td>' +
        '<td><button class="btn btn-sm btn-ghost" data-act="edit">编辑</button> <button class="btn btn-sm btn-ghost btn-danger" data-act="del">删除</button></td>' +
      '</tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty" style="border:none;padding:28px"><p>' + (D.state.transactions.length ? '没有符合筛选条件的记录' : '还没有记录，点右上角「记一笔」开始吧') + '</p></div></td></tr>') +
    '</tbody></table></div>' +

    '<div class="card" style="margin-top:14px;padding:12px 18px;display:flex;gap:24px;flex-wrap:wrap;font-size:13px">' +
      '<span>共 <b style="color:var(--gold2)">' + U.fmtInt(list.length) + '</b> 笔</span>' +
      '<span>收入 <b class="money-in">' + U.fmtMoney(st.income) + '</b></span>' +
      '<span>支出 <b class="money-out">' + U.fmtMoney(st.expense) + '</b></span>' +
      '<span>净收益 <b style="color:' + (st.net >= 0 ? 'var(--green)' : 'var(--red)') + '">' + U.fmtMoney(st.net) + '</b></span>' +
      (list.length > 200 ? '<span class="badge">仅显示最近 200 条</span>' : '') +
    '</div>';

  el.querySelectorAll('[data-k]').forEach(function (b) {
    b.addEventListener('click', function () {
      f.kind = b.dataset.k; f.category = '';
      Views.transactions();
    });
  });
  el.querySelectorAll('[data-f]').forEach(function (inp) {
    inp.addEventListener('change', function () { f[inp.dataset.f] = inp.value; Views.transactions(); });
    if (inp.dataset.f === 'kw') inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { f.kw = inp.value; Views.transactions(); }
    });
  });
  el.querySelector('[data-act="reset"]').addEventListener('click', function () {
    Views._txFilter = { kind: 'all', category: '', from: '', to: '', kw: '' };
    Views.transactions();
  });
  el.querySelector('[data-act="add"]').addEventListener('click', function () { Views.txModal(); });
  el.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
    const id = tr.dataset.id;
    const tx = D.state.transactions.find(function (x) { return x.id === id; });
    tr.querySelector('[data-act="edit"]').addEventListener('click', function () { Views.txModal(tx); });
    tr.querySelector('[data-act="del"]').addEventListener('click', async function () {
      const ok = await UI.confirmModal({ title: '删除记录', message: '确定删除这条 ' + tx.date + ' 的「' + tx.category + '」记录吗？', danger: true, confirmText: '删除' });
      if (!ok) return;
      D.state.transactions = D.state.transactions.filter(function (x) { return x.id !== id; });
      await D.persist();
      UI.toast('已删除');
      Views.transactions();
    });
  });
};

Views.txModal = function (tx) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  const catsFor = function (kind) { return kind === 'expense' ? D.expenseCats : D.incomeCats; };
  const isNew = !tx;
  UI.formModal({
    title: isNew ? '记一笔收益' : '编辑收益记录',
    submitText: isNew ? '记入' : '保存',
    values: tx || {
      characterId: D.charFilter !== 'all' ? D.charFilter : (D.state.characters[0] || {}).id,
      date: U.today(), kind: 'income', currency: 'cash', amount: '', minutes: '', note: ''
    },
    fields: [
      { key: 'characterId', label: '角色', type: 'select', required: true, options: D.state.characters.map(function (c) { return { v: c.id, t: c.name }; }) },
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'kind', label: '收支类型', type: 'segment', options: [{ v: 'income', t: '收入' }, { v: 'expense', t: '支出' }] },
      { key: 'currency', label: '货币', type: 'segment', options: [{ v: 'cash', t: '现金' }, { v: 'reserve', t: '储备金' }] },
      { key: 'category', label: '活动分类', type: 'select', required: true, options: catsFor(tx ? tx.kind : 'income') },
      { key: 'amount', label: '金额（万）', type: 'number', required: true, step: '0.1', min: 0, placeholder: '如 86.5' },
      { key: 'minutes', label: '本次用时（分钟）', type: 'number', min: 0, placeholder: '选填，用于算时薪', hint: '选填' },
      { key: 'note', label: '备注', type: 'text', full: true, placeholder: '如：20 个鬼 / 卖了两件环装' }
    ],
    onRender: function (form, api) {
      form.addEventListener('segchange', function (e) {
        if (e.detail.key === 'kind') api.setOptions('category', catsFor(e.detail.val));
      });
    },
    onSubmit: async function (data) {
      if (isNew) {
        D.state.transactions.push({
          id: U.uid(), characterId: data.characterId, date: data.date,
          kind: data.kind, currency: data.currency, category: data.category,
          amount: data.amount, minutes: data.minutes || 0, note: data.note || '',
          createdAt: Date.now()
        });
      } else {
        Object.assign(tx, data, { minutes: data.minutes || 0, note: data.note || '' });
      }
      await D.persist();
      UI.toast(isNew ? '已记入 ✓' : '已保存 ✓');
      Views.rerender();
    }
  });
};

Views.emptyNeedChar = function (msg) {
  return '<div class="empty"><div class="ic">' + UI.icon('user', 30) + '</div><p>' + U.esc(msg) + '</p>' +
    '<div class="btns"><button class="btn btn-gold" onclick="Views.go(\'characters\')">去创建角色</button></div></div>';
};
