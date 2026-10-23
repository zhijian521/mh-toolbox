'use strict';
/* 目标页 */
Views._goalFilter = { status: 'active', type: '' };

Views.goals = function () {
  const el = document.getElementById('view');
  const f = Views._goalFilter;
  let list = D.scope(D.state.goals);
  if (f.status !== 'all') list = list.filter(function (g) { return g.status === f.status; });
  if (f.type) list = list.filter(function (g) { return g.type === f.type; });
  list.sort(function (a, b) {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  el.innerHTML =
    '<div class="filter-bar">' +
      '<div class="seg" style="background:var(--panel2)">' +
        [['active', '进行中'], ['done', '已完成'], ['all', '全部']].map(function (a) {
          return '<button type="button" class="seg-btn' + (f.status === a[0] ? ' on' : '') + '" data-s="' + a[0] + '">' + a[1] + '</button>';
        }).join('') + '</div>' +
      '<select data-f="type"><option value="">全部类型</option>' +
        D.goalTypes.map(function (t) { return '<option value="' + t.v + '"' + (f.type === t.v ? ' selected' : '') + '>' + t.t + '</option>'; }).join('') + '</select>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-gold" data-act="add">＋ 新目标</button>' +
    '</div>' +
    (list.length ? '<div class="goal-grid">' + list.map(goalCard).join('') + '</div>'
      : '<div class="empty"><div class="ic">' + UI.icon('target', 30) + '</div><p>' + (D.state.goals.length ? '没有符合筛选条件的目标' : '还没有目标，创建一个养老小目标吧') + '</p></div>');

  function goalCard(g) {
    const pct = g.target ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
    const done = g.status === 'done';
    const dl = g.deadline ? (done ? '' : (U.daysLeft(g.deadline) >= 0 ? '剩 ' + U.daysLeft(g.deadline) + ' 天' : '已过期 ' + (-U.daysLeft(g.deadline)) + ' 天')) : '';
    return '<div class="goal-card' + (done ? ' done' : '') + '" data-id="' + g.id + '">' +
      '<div class="goal-head"><div class="goal-title">' + U.esc(g.title) + '</div>' +
      '<span class="badge ' + (g.type === 'money' ? 'gold' : g.type === 'gear' ? 'purple' : 'blue') + '">' + U.esc(D.goalTypeText(g.type)) + '</span></div>' +
      '<div class="goal-meta"><span>' + U.esc(D.charName(g.characterId)) + '</span>' + (dl ? '<span>' + U.esc(dl) + '</span>' : '') + (g.deadline && done ? '<span>' + U.esc(g.deadline) + ' 达成</span>' : '') + '</div>' +
      '<div class="goal-nums"><span>进度 <b>' + pct + '%</b></span><span><b>' + U.fmtMoney(g.current) + '</b> / ' + U.fmtMoney(g.target) + (g.unit && g.unit !== '万' ? '（' + U.esc(g.unit) + '）' : '') + '</span></div>' +
      '<div class="progress' + (done ? ' ok' : '') + '"><i style="width:' + pct + '%"></i></div>' +
      (g.note ? '<div style="font-size:12px;color:var(--muted)">' + U.esc(g.note) + '</div>' : '') +
      '<div class="goal-actions">' +
        (done ? '<button class="btn btn-sm" data-act="reopen">恢复进行</button>'
              : '<button class="btn btn-sm btn-gold" data-act="progress">＋ 记进度</button>' +
                '<button class="btn btn-sm" data-act="done">标记完成</button>') +
        '<button class="btn btn-sm btn-ghost" data-act="edit">编辑</button>' +
        '<button class="btn btn-sm btn-ghost btn-danger" data-act="del">删除</button>' +
      '</div></div>';
  }

  el.querySelectorAll('[data-s]').forEach(function (b) {
    b.addEventListener('click', function () { f.status = b.dataset.s; Views.goals(); });
  });
  el.querySelector('select[data-f="type"]').addEventListener('change', function (e) { f.type = e.target.value; Views.goals(); });
  el.querySelector('[data-act="add"]').addEventListener('click', function () { Views.goalModal(); });

  el.querySelectorAll('.goal-card').forEach(function (card) {
    const g = D.state.goals.find(function (x) { return x.id === card.dataset.id; });
    card.querySelector('[data-act="edit"]').addEventListener('click', function () { Views.goalModal(g); });
    card.querySelector('[data-act="del"]').addEventListener('click', async function () {
      const ok = await UI.confirmModal({ title: '删除目标', message: '确定删除目标「' + g.title + '」吗？进度记录会一并删除。', danger: true, confirmText: '删除' });
      if (!ok) return;
      D.state.goals = D.state.goals.filter(function (x) { return x.id !== g.id; });
      await D.persist(); UI.toast('已删除'); Views.goals();
    });
    const pBtn = card.querySelector('[data-act="progress"]');
    if (pBtn) pBtn.addEventListener('click', function () { Views.goalProgressModal(g); });
    const dBtn = card.querySelector('[data-act="done"]');
    if (dBtn) dBtn.addEventListener('click', async function () {
      g.status = 'done'; g.doneAt = U.today();
      if (g.target && g.current < g.target) g.current = g.target;
      await D.persist(); UI.toast('恭喜！目标已达成'); Views.goals();
    });
    const rBtn = card.querySelector('[data-act="reopen"]');
    if (rBtn) rBtn.addEventListener('click', async function () {
      g.status = 'active';
      await D.persist(); UI.toast('已恢复进行中'); Views.goals();
    });
  });
};

Views.goalModal = function (g) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  const isNew = !g;
  UI.formModal({
    title: isNew ? '新建目标' : '编辑目标',
    values: g || {
      characterId: D.charFilter !== 'all' ? D.charFilter : (D.state.characters[0] || {}).id,
      type: 'money', title: '', target: '', unit: '万', deadline: '', note: ''
    },
    fields: [
      { key: 'characterId', label: '角色', type: 'select', required: true, options: D.state.characters.map(function (c) { return { v: c.id, t: c.name }; }) },
      { key: 'type', label: '目标类型', type: 'select', options: D.goalTypes },
      { key: 'title', label: '目标标题', type: 'text', required: true, full: true, placeholder: '如：攒钱买 120 简易武器' },
      { key: 'target', label: '目标数值', type: 'number', required: true, step: '0.1', min: 0, hint: '存钱/装备目标通常填金额（万）' },
      { key: 'unit', label: '单位', type: 'text', default: '万', placeholder: '万' },
      { key: 'deadline', label: '期望完成日期', type: 'date', hint: '选填' },
      { key: 'note', label: '备注', type: 'textarea', full: true, placeholder: '记点想法…' }
    ],
    onSubmit: async function (data) {
      if (isNew) {
        D.state.goals.push({
          id: U.uid(), characterId: data.characterId, type: data.type, title: data.title,
          target: data.target, unit: data.unit || '万', current: 0, status: 'active',
          deadline: data.deadline || '', note: data.note || '', createdAt: Date.now(), logs: []
        });
      } else {
        Object.assign(g, data, { unit: data.unit || '万', deadline: data.deadline || '', note: data.note || '' });
      }
      await D.persist(); UI.toast(isNew ? '目标已创建' : '已保存 ✓'); Views.goals();
    }
  });
};

Views.goalProgressModal = function (g) {
  UI.formModal({
    title: '记进度 · ' + g.title,
    submitText: '记入',
    fields: [
      { key: 'date', label: '日期', type: 'date', required: true, default: U.today() },
      { key: 'delta', label: '进度变化', type: 'number', required: true, step: '0.1', placeholder: '如 200（万）', hint: '填正数增加进度' },
      { key: 'note', label: '备注', type: 'text', full: true, placeholder: '如：本月捉鬼净收益' }
    ],
    onSubmit: async function (data) {
      g.current = Math.max(0, (Number(g.current) || 0) + data.delta);
      g.logs.push({ id: U.uid(), date: data.date, delta: data.delta, note: data.note || '' });
      await D.persist(); UI.toast('进度已更新 ✓'); Views.goals();
    }
  });
};
