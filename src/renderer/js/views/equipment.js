'use strict';
/* 装备页 */
Views._eqFilter = { slot: '', status: '', kw: '' };

Views.equipment = function () {
  const el = document.getElementById('view');
  const f = Views._eqFilter;
  let list = D.scope(D.state.equipment);
  if (f.slot) list = list.filter(function (e) { return e.slot === f.slot; });
  if (f.status) list = list.filter(function (e) { return e.status === f.status; });
  if (f.kw) list = list.filter(function (e) {
    const kw = f.kw.toLowerCase();
    return (e.name || '').toLowerCase().includes(kw) || (e.special || '').toLowerCase().includes(kw) || (e.attributes || '').toLowerCase().includes(kw);
  });
  list.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

  const statusText = { active: '在用', stored: '仓库', sold: '已出售' };
  el.innerHTML =
    '<div class="filter-bar">' +
      '<span class="xmount" data-mount="slot"></span>' +
      '<span class="xmount" data-mount="status"></span>' +
      '<input type="text" data-f="kw" value="' + U.esc(f.kw) + '" placeholder="搜索名称 / 特技 / 属性" style="width:180px">' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-gold" data-act="add">＋ 新装备</button>' +
    '</div>' +

    (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
      '<th>部位</th><th>名称</th><th>属性摘要</th><th>特技/特效</th><th>宝石</th><th>状态</th><th>变动</th><th style="width:170px">操作</th>' +
      '</tr></thead><tbody>' + list.map(function (e) {
        const logs = D.gearLogsOf(e.id);
        const firstAttr = (e.attributes || '').split('\n')[0] || '—';
        return '<tr data-id="' + e.id + '">' +
          '<td><span class="badge gold">' + U.esc(e.slot) + '</span></td>' +
          '<td><b>' + U.esc(e.name) + '</b>' + (e.level ? '<div class="cell-sub">' + U.esc(e.level) + ' 级</div>' : '') + '</td>' +
          '<td class="ellipsis" title="' + U.esc(e.attributes || '') + '">' + U.esc(firstAttr) + '</td>' +
          '<td>' + U.esc(e.special || '—') + '</td>' +
          '<td>' + U.esc(e.gems || '—') + '</td>' +
          '<td><span class="badge ' + (e.status === 'active' ? 'in' : e.status === 'sold' ? 'out' : '') + '">' + (statusText[e.status] || e.status) + '</span></td>' +
          '<td>' + (logs.length ? U.fmtInt(logs.length) + ' 次' : '—') + '</td>' +
          '<td>' +
            '<button class="btn btn-sm btn-ghost" data-act="log">记变动</button> ' +
            '<button class="btn btn-sm btn-ghost" data-act="detail">详情</button> ' +
            '<button class="btn btn-sm btn-ghost" data-act="edit">编辑</button> ' +
            '<button class="btn btn-sm btn-ghost btn-danger" data-act="del">删除</button>' +
          '</td></tr>';
      }).join('') + '</tbody></table></div>'
    : '<div class="empty"><div class="ic">' + UI.icon('sword', 30) + '</div><p>' + (D.state.equipment.length ? '没有符合筛选条件的装备' : '还没有装备档案，把你的养老装备记进来吧') + '</p></div>');

  UI.select(el.querySelector('[data-mount="slot"]'), {
    options: [{ v: '', t: '全部部位' }].concat(D.slots.map(function (s) { return { v: s, t: s }; })),
    value: f.slot,
    onChange: function (v) { Views._eqFilter.slot = v; Views.equipment(); }
  });
  UI.select(el.querySelector('[data-mount="status"]'), {
    options: [{ v: '', t: '全部状态' }].concat(Object.keys(statusText).map(function (s) { return { v: s, t: statusText[s] }; })),
    value: f.status,
    onChange: function (v) { Views._eqFilter.status = v; Views.equipment(); }
  });
  const kw = el.querySelector('input[data-f="kw"]');
  if (kw) kw.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { Views._eqFilter.kw = kw.value; Views.equipment(); }
  });
  el.querySelector('[data-act="add"]').addEventListener('click', function () { Views.eqModal(); });

  el.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
    const eq = D.state.equipment.find(function (x) { return x.id === tr.dataset.id; });
    tr.querySelector('[data-act="edit"]').addEventListener('click', function () { Views.eqModal(eq); });
    tr.querySelector('[data-act="log"]').addEventListener('click', function () { Views.gearLogModal(eq); });
    tr.querySelector('[data-act="detail"]').addEventListener('click', function () { Views.eqDetailModal(eq); });
    tr.querySelector('[data-act="del"]').addEventListener('click', async function () {
      const n = D.gearLogsOf(eq.id).length;
      const ok = await UI.confirmModal({ title: '删除装备', message: '确定删除「' + eq.name + '」吗？' + (n ? '其 ' + n + ' 条变动记录会一并删除。' : ''), danger: true, confirmText: '删除' });
      if (!ok) return;
      D.state.equipment = D.state.equipment.filter(function (x) { return x.id !== eq.id; });
      D.state.gearLogs = D.state.gearLogs.filter(function (l) { return l.equipmentId !== eq.id; });
      await D.persist(); UI.toast('已删除'); Views.equipment();
    });
  });
};

Views.eqModal = function (eq) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  const isNew = !eq;
  UI.formModal({
    title: isNew ? '新装备档案' : '编辑装备',
    values: eq || {
      characterId: D.charFilter !== 'all' ? D.charFilter : (D.state.characters[0] || {}).id,
      slot: '武器', name: '', level: '', attributes: '', special: '', gems: '', status: 'active', note: ''
    },
    fields: [
      { key: 'characterId', label: '角色', type: 'select', required: true, options: D.state.characters.map(function (c) { return { v: c.id, t: c.name }; }) },
      { key: 'slot', label: '部位', type: 'select', options: D.slots },
      { key: 'name', label: '装备名称', type: 'text', required: true, placeholder: '如：偃月青龙刀' },
      { key: 'level', label: '装备等级', type: 'number', min: 0, hint: '如 110、120、130' },
      { key: 'attributes', label: '关键属性', type: 'textarea', full: true, placeholder: '每行一条，如：\n伤害 +620\n命中 +380' },
      { key: 'special', label: '特技 / 特效', type: 'text', placeholder: '如：无级别限制 / 简易' },
      { key: 'gems', label: '宝石', type: 'text', placeholder: '如：太阳石 x4' },
      { key: 'status', label: '状态', type: 'segment', options: [{ v: 'active', t: '在用' }, { v: 'stored', t: '仓库' }, { v: 'sold', t: '已出售' }] },
      { key: 'note', label: '备注', type: 'text', full: true }
    ],
    onSubmit: async function (data) {
      if (isNew) {
        D.state.equipment.push(Object.assign({ id: U.uid(), createdAt: Date.now() }, data));
      } else {
        Object.assign(eq, data);
      }
      await D.persist(); UI.toast(isNew ? '装备已登记' : '已保存'); Views.equipment();
    }
  });
};

Views.gearLogModal = function (eq) {
  UI.formModal({
    title: '装备变动 · ' + eq.name,
    submitText: '记入',
    fields: [
      { key: 'date', label: '日期', type: 'date', required: true, default: U.today() },
      { key: 'action', label: '动作', type: 'select', required: true, options: D.gearActions.map(function (a) { return { v: a.v, t: a.t }; }) },
      { key: 'amount', label: '金额（万）', type: 'number', step: '0.1', min: 0, hint: '购入/打造/宝石为支出，售出为收入' },
      { key: 'sync', label: '', type: 'check', default: true, hint: '购入/打造/售出时自动生成一笔收益记录' },
      { key: 'note', label: '备注', type: 'text', full: true, placeholder: '如：换下 100 级刀，卖了 120 万' }
    ],
    onRender: function (form, api) {
      const toggle = function () {
        const row = form.querySelector('[name="sync"]').closest('.frow');
        row.style.display = ['buy', 'sell', 'craft'].includes(api.getVal('action')) ? '' : 'none';
      };
      form.querySelector('[name="action"]').addEventListener('change', toggle);
      toggle();
    },
    onSubmit: async function (data) {
      const act = D.gearAction(data.action);
      D.state.gearLogs.push({
        id: U.uid(), equipmentId: eq.id, characterId: eq.characterId,
        date: data.date, action: data.action, amount: data.amount || 0,
        note: data.note || '', synced: false, createdAt: Date.now()
      });
      if (data.action === 'sell') eq.status = 'sold';
      if (data.sync && act.dir !== 0 && data.amount) {
        D.state.transactions.push({
          id: U.uid(), characterId: eq.characterId, date: data.date,
          kind: act.dir > 0 ? 'income' : 'expense', currency: 'cash',
          category: act.dir > 0 ? '摆摊卖货' : (data.action === 'buy' ? '装备购入' : (data.action === 'gem' ? '其他支出' : '打造费用')),
          amount: data.amount, minutes: 0,
          note: '装备「' + eq.name + '」' + act.t, createdAt: Date.now()
        });
      }
      await D.persist(); UI.toast('变动已记录 ✓'); Views.equipment();
    }
  });
};

Views.eqDetailModal = function (eq) {
  const logs = D.gearLogsOf(eq.id);
  const attrs = (eq.attributes || '').split('\n').filter(Boolean);
  const ov = UI.openModal({
    title: eq.slot + ' · ' + eq.name,
    wide: true,
    body:
      '<div class="backup-grid">' +
        '<div>' +
          '<div class="kv"><span class="k">角色</span><span class="v">' + U.esc(D.charName(eq.characterId)) + '</span></div>' +
          '<div class="kv"><span class="k">等级</span><span class="v">' + U.esc(eq.level || '—') + '</span></div>' +
          '<div class="kv"><span class="k">特技/特效</span><span class="v">' + U.esc(eq.special || '—') + '</span></div>' +
          '<div class="kv"><span class="k">宝石</span><span class="v">' + U.esc(eq.gems || '—') + '</span></div>' +
          '<div class="kv"><span class="k">备注</span><span class="v">' + U.esc(eq.note || '—') + '</span></div>' +
          (attrs.length ? '<div class="kv"><span class="k">属性</span><span class="v" style="white-space:pre-line">' + U.esc(attrs.join('\n')) + '</span></div>' : '') +
        '</div>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:700;margin-bottom:12px">更新时间线</div>' +
          (logs.length ? '<div class="timeline">' + logs.map(function (l) {
            const act = D.gearAction(l.action);
            return '<div class="tl-item">' +
              '<div class="tl-head"><span class="badge ' + (act.dir > 0 ? 'in' : act.dir < 0 ? 'out' : '') + '">' + act.t + '</span>' +
              '<span class="' + (l.amount ? (act.dir > 0 ? 'money-in' : act.dir < 0 ? 'money-out' : '') : 'money-zero') + '">' + (l.amount ? U.fmtMoney(l.amount) : '') + '</span></div>' +
              '<div class="tl-date">' + U.esc(l.date) + '</div>' +
              (l.note ? '<div class="tl-note">' + U.esc(l.note) + '</div>' : '') +
            '</div>';
          }).join('') + '</div>' : '<div class="empty" style="padding:20px"><p>暂无变动记录</p></div>') +
        '</div>' +
      '</div>',
    footer: '<button class="btn" data-act="close">关闭</button><button class="btn btn-gold" data-act="add-log">＋ 记一次变动</button>'
  });
  ov.querySelector('[data-act="close"]').addEventListener('click', UI.closeModal);
  ov.querySelector('[data-act="add-log"]').addEventListener('click', function () {
    UI.closeModal();
    Views.gearLogModal(eq);
  });
};
