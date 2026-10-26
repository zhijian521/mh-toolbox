'use strict';
/* 目标计划：角色养成直接跟随档案，存钱与装备目标手动累计。 */
Views._goalFilter = { status: 'active', type: '', keyword: '', sort: 'manual' };

Views.goals = function () {
  const el = document.getElementById('view'), filter = Views._goalFilter;
  const scrollTop = el.scrollTop;
  const scoped = D.orderedGoals(D.goalsFor()).map((goal) => ({ goal, summary: D.goalSummary(goal) }));
  const keyword = filter.keyword.trim().toLocaleLowerCase();
  const list = scoped.filter(({ goal, summary }) => (filter.status === 'all' || summary.status === filter.status) &&
    (!filter.type || goal.type === filter.type) && (!keyword || [goal.title, goal.note,
      ...D.goalCharacters(goal).map((character) => character.name)].join(' ').toLocaleLowerCase().includes(keyword)));
  list.sort((a, b) => {
    if (filter.sort === 'manual') return 0;
    if (a.summary.status !== b.summary.status) return a.summary.status === 'active' ? -1 : 1;
    if (filter.sort === 'deadline' && a.summary.status === 'active') {
      const date = (a.goal.deadline || '9999-12-31').localeCompare(b.goal.deadline || '9999-12-31');
      if (date) return date;
    }
    if (filter.sort === 'progress' && a.summary.pct !== b.summary.pct) return b.summary.pct - a.summary.pct;
    return (b.goal.createdAt || 0) - (a.goal.createdAt || 0);
  });
  el.innerHTML = '<div class="filter-bar goal-filters"><div class="seg">' +
    [['active', '进行中'], ['done', '已完成'], ['all', '全部']].map(([status, label]) =>
      '<button type="button" class="seg-btn' + (filter.status === status ? ' on' : '') + '" data-s="' + status +
      '" aria-pressed="' + (filter.status === status) + '">' + label + ' ' +
      scoped.filter(({ summary }) => status === 'all' || summary.status === status).length + '</button>').join('') +
    '</div><span class="xmount" data-mount="type"></span><span class="xmount" data-mount="sort"></span>' +
    '<input data-filter="keyword" aria-label="搜索目标" placeholder="搜索目标、角色或备注" value="' + U.esc(filter.keyword) +
    '"><button class="btn" data-act="search">搜索</button></div>' +
    (list.length ? '<div class="goal-grid">' + list.map(({ goal, summary }) => Views.goalCardHtml(goal, summary)).join('') + '</div>' :
      '<div class="empty"><div class="ic">' + UI.icon('target', 30) + '</div><p>' +
      (scoped.length ? '没有符合筛选条件的目标' : '为全部角色或单个角色定一个小目标') + '</p>' +
      (scoped.length ? '<div class="btns"><button class="btn" data-act="reset">清除筛选</button></div>' : '') + '</div>');
  el.querySelectorAll('[data-s]').forEach((button) => {
    button.onclick = () => { filter.status = button.dataset.s; Views.goals(); };
  });
  UI.select(el.querySelector('[data-mount="type"]'), {
    options: [{ v: '', t: '全部类型' }, ...D.goalTypes], value: filter.type, label: '目标类型筛选',
    onChange: (value) => { filter.type = value; Views.goals(); },
  });
  UI.select(el.querySelector('[data-mount="sort"]'), {
    options: [{ v: 'manual', t: '自定义排序' }, { v: 'deadline', t: '到期优先' }, { v: 'progress', t: '进度优先' }, { v: 'newest', t: '最近创建' }],
    value: filter.sort, label: '目标排序', onChange: (value) => { filter.sort = value; Views.goals(); },
  });
  const search = () => { filter.keyword = el.querySelector('[data-filter="keyword"]').value.trim(); Views.goals(); };
  el.querySelector('[data-act="search"]').onclick = search;
  el.querySelector('[data-filter="keyword"]').onkeydown = (event) => { if (event.key === 'Enter') search(); };
  const reset = el.querySelector('[data-act="reset"]');
  if (reset) reset.onclick = () => { Object.assign(filter, { status: 'all', type: '', keyword: '' }); Views.goals(); };
  el.querySelectorAll('.goal-card').forEach((card) => {
    const goal = D.state.goals.find((item) => item.id === card.dataset.id);
    card.querySelector('[data-act="history"]').onclick = () => Views.goalHistoryModal(goal.id);
    card.querySelector('[data-act="edit"]').onclick = () => Views.goalModal(goal);
    card.querySelector('[data-act="del"]').onclick = async () => {
      const confirmed = await UI.confirmModal({ title: '删除目标', danger: true, confirmText: '删除',
        message: '删除目标「' + goal.title + '」及其手动进度？角色档案和养成记录会保留。' });
      if (!confirmed) return;
      try { await D.removeGoal(goal.id); UI.toast('已删除目标'); Views.goalRefresh(); }
      catch (error) { UI.toast(error.message, 'err'); }
    };
    const progress = card.querySelector('[data-act="progress"]');
    if (progress) progress.onclick = () => goal.tracking ? Views.goalGrowthModal(goal) : Views.goalProgressModal(goal);
    for (const [action, status] of [['done', 'done'], ['reopen', 'active']]) {
      const button = card.querySelector('[data-act="' + action + '"]');
      if (!button) continue;
      button.onclick = async () => {
        button.disabled = true;
        try { await D.setGoalStatus(goal.id, status); UI.toast(status === 'done' ? '目标已达成' : '已恢复进行中'); Views.goalRefresh(); }
        catch (error) { UI.toast(error.message, 'err'); }
        finally { button.disabled = false; }
      };
    }
  });
  Views.goalBindOrdering(el);
  el.scrollTop = scrollTop;
};

Views.goalPersistOrder = function (id, changes) {
  const draft = { ...changes };
  if (changes.targetId && Views._goalFilter.sort !== 'manual') {
    draft.visibleIds = [...document.querySelectorAll('.goal-card')].map((card) => card.dataset.id);
  }
  return UI.persistCardOrder(Views, '_goalOrderPending', {
    grid: '.goal-grid', save: () => D.saveGoalOrder(id, draft),
    onSaved: () => {
      if (changes.targetId) Views._goalFilter.sort = 'manual';
      Views.goalRefresh();
      if (!document.querySelector('.modal')) Views.goalFocusTarget(id, 'move')?.focus({ preventScroll: true });
    }, message: '目标顺序已保存',
  });
};

Views.goalBindOrdering = function (el) {
  UI.bindCardOrdering(el, { grid: '.goal-grid', card: '.goal-card', kind: 'goal',
    pending: () => Views._goalOrderPending, onMove: Views.goalPersistOrder });
};

Views.goalNumberHtml = function (value, kind, unit = '') {
  return UI.numberHtml(value, unit, { tag: 'b', numberClass: 'goal-number-' + kind, unitClass: 'goal-number-unit' });
};

Views.goalMemberHtml = function (member, goal) {
  const number = Views.goalNumberHtml;
  return '<div class="goal-member" role="listitem"><span class="goal-member-name" title="' + U.esc(member.name) + '">' +
    U.esc(member.name) + '</span><span class="goal-member-value">' +
    (member.value === null ? '未记录' : number(member.value, 'current') + ' <span class="goal-number-separator">/</span> ' + number(goal.target, 'target', goal.unit)) +
    '</span><span class="goal-member-state' + (member.done ? ' complete' : member.value === null ? ' unknown' : '') + '">' +
    (member.done ? '已达标' : member.value === null ? '待补录' : '还差 ' + number(member.remaining, 'remaining', goal.unit)) + '</span></div>';
};

Views.goalCardHtml = function (goal, summary) {
  const done = summary.status === 'done';
  const days = goal.deadline ? U.daysLeft(goal.deadline) : null;
  const deadline = !done && days !== null ? (days < 0 ? '已逾期 ' + -days + ' 天' : days === 0 ? '今天到期' : '剩 ' + days + ' 天') : '';
  const iconButton = (action, icon, label) => '<button type="button" class="btn btn-sm goal-icon-btn' +
    (action === 'del' ? ' btn-danger' : action === 'move' ? ' card-drag-handle' : '') +
    '" data-act="' + action + '" title="' + label + '" aria-label="' + label + '"' +
    (action === 'move' ? ' draggable="true"' : '') + '>' + UI.icon(icon, 15) + '</button>';
  const scope = goal.characterId === 'all' ? '全部角色' : D.charName(goal.characterId);
  const number = Views.goalNumberHtml, unit = goal.unit || '万';
  const percent = number(summary.pct, 'pct', '%');
  const numbers = goal.tracking ? '<span>达成 ' + number(summary.achieved, 'achieved') +
    ' <span class="goal-number-separator">/</span> ' + number(summary.members.length, 'total') + ' 个角色</span><span>' + percent + '</span>' :
    '<span>进度 ' + percent + '</span><span>' + number(goal.current, 'current', unit) +
    ' <span class="goal-number-separator">/</span> ' + number(goal.target, 'target', unit) + '</span>';
  const pendingFirst = goal.tracking ? summary.members.slice().sort((a, b) => Number(a.done) - Number(b.done)) : [];
  const members = goal.tracking ? '<p class="goal-caption">' + U.esc(D.goalMetricLabel(goal.tracking)) + ' · 每个角色 ' + goal.target + U.esc(goal.unit) +
    (summary.unknown ? ' · ' + summary.unknown + ' 个待补录' : '') + '</p><div class="goal-members" role="list" aria-label="各角色养成进度">' +
    pendingFirst.map((member) => Views.goalMemberHtml(member, goal)).join('') + '</div>' : '';
  return '<article class="goal-card' + (done ? ' done' : '') + '" data-id="' + U.esc(goal.id) + '"><div class="goal-head">' +
    '<h2 class="goal-title">' + U.esc(goal.title) + '</h2><div class="goal-tools">' +
    iconButton('move', 'grip', '拖动排序，或用方向键前后移动') +
    iconButton('edit', 'edit', '编辑目标') +
    iconButton('del', 'trash', '删除目标') + '</div></div><div class="goal-meta"><span class="badge ' +
    (goal.type === 'money' ? 'gold' : goal.type === 'gear' ? 'purple' : 'blue') + '">' + U.esc(D.goalTypeText(goal.type)) + '</span><span>' + U.esc(scope) +
    '</span><span>' + (goal.tracking ? '跟随角色档案' : goal.characterId === 'all' ? '共同累计' : '手动累计') + '</span>' +
    (deadline ? '<span class="' + (days < 0 ? 'goal-overdue' : '') + '" title="' + U.esc(goal.deadline) + '">' + deadline + '</span>' : '') +
    (done ? '<span>' + (goal.tracking ? '已全部达标' : U.esc(goal.doneAt || '') + ' 达成') + '</span>' : '') + '</div>' +
    '<div class="goal-nums">' + numbers + '</div><div class="progress' + (done ? ' ok' : '') +
    '" role="progressbar" aria-label="目标进度" aria-valuenow="' + summary.pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + summary.pct + '%"></i></div>' +
    members + (goal.tracking && !summary.members.length ? '<p class="goal-caption">暂无适用角色，添加角色后自动参与目标。</p>' : '') +
    (goal.note ? '<p class="goal-note">' + U.esc(goal.note) + '</p>' : '') + '<div class="goal-actions">' +
    (goal.tracking ? '<button class="btn btn-sm btn-gold" data-act="progress"' + (summary.members.length ? '' : ' disabled') + '>更新养成</button>' : done ?
      '<button class="btn btn-sm" data-act="reopen">恢复进行</button>' : '<button class="btn btn-sm btn-gold" data-act="progress">＋ 记进度</button>' +
      '<button class="btn btn-sm" data-act="done">标记完成</button>') + '<button class="btn btn-sm" data-act="history">' +
    (goal.tracking ? '养成记录' : '进度历史') + '</button></div></article>';
};

Views.goalRefresh = function () {
  if (Views._current === 'goals') Views.goals();
  else if (Views._current === 'dashboard') Views.dashboard();
};

Views.goalFocusTarget = function (id, action = 'edit') {
  if (Views._current !== 'goals') return null;
  return document.querySelector('.goal-card[data-id="' + CSS.escape(id || '') + '"] [data-act="' + action + '"]') ||
    document.getElementById('quick-add');
};
