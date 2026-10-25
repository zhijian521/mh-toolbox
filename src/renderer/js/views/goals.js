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
      '<span class="xmount" data-mount="type"></span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-gold" data-act="add">＋ 新目标</button>' +
    '</div>' +
    (list.length ? '<div class="goal-grid">' + list.map(goalCard).join('') + '</div>'
      : '<div class="empty"><div class="ic">' + UI.icon('target', 30) + '</div><p>' + (D.state.goals.length ? '没有符合筛选条件的目标' : '还没有目标，创建一个养老小目标吧') + '</p></div>');

  function goalCard(g) {
    const pct = g.target ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
    const done = g.status === 'done';
    const dl = g.deadline ? (done ? '' : (U.daysLeft(g.deadline) >= 0 ? '剩 ' + U.daysLeft(g.deadline) + ' 天' : '已过期 ' + (-U.daysLeft(g.deadline)) + ' 天')) : '';
    return '<div class="goal-card' + (done ? ' done' : '') + '" data-id="' + U.esc(g.id) + '">' +
      '<div class="goal-head"><div class="goal-title">' + U.esc(g.title) + '</div>' +
      '<span class="badge ' + (g.type === 'money' ? 'gold' : g.type === 'gear' ? 'purple' : 'blue') + '">' + U.esc(D.goalTypeText(g.type)) + '</span></div>' +
      '<div class="goal-meta"><span>' + U.esc(D.charName(g.characterId)) + '</span>' + (dl ? '<span>' + U.esc(dl) + '</span>' : '') + (g.doneAt && done ? '<span>' + U.esc(g.doneAt) + ' 达成</span>' : '') + '</div>' +
      '<div class="goal-nums"><span>进度 <b>' + pct + '%</b></span><span><b>' + U.fmtNumber(g.current) + U.esc(g.unit || '万') + '</b> / ' + U.fmtNumber(g.target) + U.esc(g.unit || '万') + '</span></div>' +
      '<div class="progress' + (done ? ' ok' : '') + '"><i style="width:' + pct + '%"></i></div>' +
      (g.note ? '<div style="font-size:12px;color:var(--muted)">' + U.esc(g.note) + '</div>' : '') +
      '<div class="goal-actions">' +
        (done ? '<button class="btn btn-sm" data-act="reopen">恢复进行</button>'
              : '<button class="btn btn-sm btn-gold" data-act="progress">＋ 记进度</button>' +
                '<button class="btn btn-sm" data-act="done">标记完成</button>') +
        '<button class="btn btn-sm" data-act="history">进度历史</button>' +
        '<button class="btn btn-sm" data-act="edit">编辑</button>' +
        '<button class="btn btn-sm btn-ghost btn-danger" data-act="del">删除</button>' +
      '</div></div>';
  }

  el.querySelectorAll('[data-s]').forEach(function (b) {
    b.addEventListener('click', function () { f.status = b.dataset.s; Views.goals(); });
  });
  UI.select(el.querySelector('[data-mount="type"]'), {
    options: [{ v: '', t: '全部类型' }].concat(D.goalTypes),
    value: f.type,
    onChange: function (v) { Views._goalFilter.type = v; Views.goals(); }
  });
  el.querySelector('[data-act="add"]').addEventListener('click', function () { Views.goalModal(); });

  el.querySelectorAll('.goal-card').forEach(function (card) {
    const g = D.state.goals.find(function (x) { return x.id === card.dataset.id; });
    card.querySelector('[data-act="history"]').onclick = () => Views.goalHistoryModal(g.id);
    card.querySelector('[data-act="edit"]').addEventListener('click', function () { Views.goalModal(g); });
    card.querySelector('[data-act="del"]').addEventListener('click', async function () {
      const ok = await UI.confirmModal({ title: '删除目标', message: '确定删除目标「' + g.title + '」吗？进度记录会一并删除。', danger: true, confirmText: '删除' });
      if (!ok) return;
      try { await D.removeGoal(g.id); UI.toast('已删除'); Views.goals(); }
      catch (error) { UI.toast(error.message, 'err'); }
    });
    const pBtn = card.querySelector('[data-act="progress"]');
    if (pBtn) pBtn.addEventListener('click', function () { Views.goalProgressModal(g); });
    const dBtn = card.querySelector('[data-act="done"]');
    if (dBtn) dBtn.addEventListener('click', async function () {
      try { await D.setGoalStatus(g.id, 'done'); UI.toast('恭喜！目标已达成'); Views.goals(); }
      catch (error) { UI.toast(error.message, 'err'); }
    });
    const rBtn = card.querySelector('[data-act="reopen"]');
    if (rBtn) rBtn.addEventListener('click', async function () {
      try { await D.setGoalStatus(g.id, 'active'); UI.toast('已恢复进行中'); Views.goals(); }
      catch (error) { UI.toast(error.message, 'err'); }
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
      await D.saveGoal(data, g && g.id); UI.toast(isNew ? '目标已创建' : '已保存 ✓'); Views.goals();
    }
  });
};

Views.goalProgressModal = function (g, log) {
  UI.formModal({
    title: (log ? '编辑进度 · ' : '记进度 · ') + g.title,
    values: log || {},
    submitText: '记入',
    fields: [
      { key: 'date', label: '日期', type: 'date', required: true, default: U.today() },
      { key: 'delta', label: '进度变化', type: 'number', required: true, step: '0.1', placeholder: '单位：' + (g.unit || '万'), hint: '正数增加、负数减少；当前进度最低为 0' },
      { key: 'note', label: '备注', type: 'text', full: true, placeholder: '如：本月捉鬼净收益' }
    ],
    onSubmit: async function (data) {
      await D.saveGoalProgress(g.id, data, log && log.id);
      UI.toast('进度已更新'); Views.goals();
    }
  });
};

Views.goalHistoryModal = function (id) {
  const goal = D.state.goals.find((item) => item.id === id);
  if (!goal) return;
  const logs = goal.logs.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const overlay = UI.openModal({
    title: '进度历史 · ' + goal.title, wide: true,
    body: '<p class="char-form-hint">当前 ' + U.fmtNumber(goal.current) + U.esc(goal.unit) +
      (goal.baseProgress ? ' · 历史基础进度 ' + U.fmtNumber(goal.baseProgress) + U.esc(goal.unit) : '') + '</p>' +
      (logs.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th><th>变化</th><th>备注</th><th>操作</th></tr></thead><tbody>' +
        logs.map((log) => '<tr data-id="' + U.esc(log.id) + '"><td>' + U.esc(log.date) + '</td><td>' +
          (log.delta > 0 ? '+' : '') + U.fmtNumber(log.delta) + U.esc(goal.unit) + '</td><td>' + U.esc(log.note || '—') +
          '</td><td><button class="btn btn-sm" data-act="edit">编辑</button> <button class="btn btn-sm btn-danger" data-act="delete">删除</button></td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty"><p>暂无进度记录</p></div>'),
    footer: '<button class="btn" data-act="close">关闭</button><button class="btn btn-gold" data-act="add">记进度</button>',
  });
  overlay.querySelector('[data-act="close"]').onclick = UI.requestCloseModal;
  overlay.querySelector('[data-act="add"]').onclick = () => Views.goalProgressModal(goal);
  overlay.querySelectorAll('tr[data-id]').forEach((row) => {
    const log = logs.find((entry) => entry.id === row.dataset.id);
    row.querySelector('[data-act="edit"]').onclick = () => Views.goalProgressModal(goal, log);
    row.querySelector('[data-act="delete"]').onclick = async () => {
      const ok = await UI.confirmModal({ title: '删除进度', message: '删除这条进度记录并重新计算目标进度？', danger: true });
      if (!ok) { Views.goalHistoryModal(id); return; }
      try { await D.removeGoalProgress(id, log.id); Views.goals(); Views.goalHistoryModal(id); }
      catch (error) { UI.toast(error.message, 'err'); Views.goalHistoryModal(id); }
    };
  });
};
