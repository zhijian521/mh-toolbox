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

Views.goalPersistOrder = async function (id, changes, action = 'move') {
  if (Views._goalOrderPending) return;
  Views._goalOrderPending = true;
  const el = document.getElementById('view'), grid = el.querySelector('.goal-grid');
  const controls = [...el.querySelectorAll('[data-act="move"]')].map((button) => [button, button.disabled]);
  if (changes.targetId && Views._goalFilter.sort !== 'manual') {
    changes.visibleIds = [...el.querySelectorAll('.goal-card')].map((card) => card.dataset.id);
  }
  controls.forEach(([button]) => { button.disabled = true; });
  if (grid) grid.setAttribute('aria-busy', 'true');
  try {
    await D.saveGoalOrder(id, changes);
    if (changes.targetId) Views._goalFilter.sort = 'manual';
    Views.goalRefresh();
    Views.goalFocusTarget(id, action)?.focus({ preventScroll: true });
    UI.toast('目标顺序已保存');
  } catch (error) { UI.toast(error.message, 'err'); }
  finally {
    Views._goalOrderPending = false;
    controls.forEach(([button, disabled]) => { button.disabled = disabled; });
    if (grid) grid.removeAttribute('aria-busy');
  }
};

Views.goalBindOrdering = function (el) {
  UI.bindCardOrdering(el, { grid: '.goal-grid', card: '.goal-card', kind: 'goal',
    pending: () => Views._goalOrderPending, onMove: Views.goalPersistOrder });
};

Views.goalMemberHtml = function (member, goal) {
  const unit = '<small class="goal-number-unit">' + U.esc(goal.unit) + '</small>';
  return '<div class="goal-member" role="listitem"><span class="goal-member-name" title="' + U.esc(member.name) + '">' +
    U.esc(member.name) + '</span><span class="goal-member-value">' +
    (member.value === null ? '未记录' : '<b class="goal-number-current">' + U.fmtNumber(member.value) + '</b> <span class="goal-number-separator">/</span> <b class="goal-number-target">' + goal.target + '</b>' + unit) +
    '</span><span class="goal-member-state' + (member.done ? ' complete' : member.value === null ? ' unknown' : '') + '">' +
    (member.done ? '已达标' : member.value === null ? '待补录' : '还差 <b class="goal-number-remaining">' + member.remaining + '</b>' + unit) + '</span></div>';
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
  const unit = '<small class="goal-number-unit">' + U.esc(goal.unit || '万') + '</small>';
  const percent = '<b class="goal-number-pct">' + summary.pct + '</b><small class="goal-number-unit">%</small>';
  const numbers = goal.tracking ? '<span>达成 <b class="goal-number-achieved">' + summary.achieved + '</b> <span class="goal-number-separator">/</span> <b class="goal-number-total">' + summary.members.length +
    '</b> 个角色</span><span>' + percent + '</span>' :
    '<span>进度 ' + percent + '</span><span><b class="goal-number-current">' + U.fmtNumber(goal.current) + '</b>' + unit +
    ' <span class="goal-number-separator">/</span> <b class="goal-number-target">' + U.fmtNumber(goal.target) + '</b>' + unit + '</span>';
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

Views.goalModal = function (goal) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  const values = goal ? { ...goal, title: goal.title === D.goalDefaultTitle(goal) ? '' : goal.title,
    source: goal.tracking ? 'character' : 'manual',
    category: goal.tracking?.category || 'auxiliarySkills', metricKey: goal.tracking?.key || '强身术' } : {
    characterId: D.charFilter, type: 'progress', source: 'character', category: 'auxiliarySkills', metricKey: '强身术',
    title: '', target: 120, unit: '级', deadline: '', note: '',
  };
  let savedId = goal?.id;
  UI.formModal({
    title: goal ? '编辑目标' : '新建目标', wide: true, values,
    returnFocus: () => Views.goalFocusTarget(savedId),
    fields: [
      { key: 'type', label: '目标类型', type: 'select', options: D.goalTypes },
      { key: 'characterId', label: '适用角色', type: 'select', options: [{ v: 'all', t: '全部角色' },
        ...D.orderedCharacters().map((character) => ({ v: character.id, t: character.name }))] },
      { key: 'source', label: '进度来源', type: 'select', options: [{ v: 'character', t: '跟随角色档案' }, { v: 'manual', t: '手动累计' }] },
      { key: 'category', label: '养成分类', type: 'select', options: D.goalMetrics },
      { key: 'metricKey', label: '具体项目', type: 'select', options: D.goalMetricOptions(values.category, values.characterId) },
      { key: 'target', label: '目标数值', type: 'number', required: true, min: 0, step: '1' },
      { key: 'unit', label: '单位', type: 'text', placeholder: '如：万、元、级、个' },
      { key: 'deadline', label: '期望完成日期', type: 'date', hint: '选填' },
      { key: 'title', label: '目标名称', type: 'text', full: true, hint: '留空自动生成，也可以自己命名' },
      { key: 'note', label: '备注', type: 'textarea', full: true, placeholder: '选填' },
    ],
    onRender: (form, api, overlay) => {
      overlay.classList.add('goal-modal');
      const preview = document.createElement('div');
      preview.className = 'goal-form-preview full'; preview.setAttribute('aria-live', 'polite');
      form.querySelector('[data-field="title"]').before(preview);
      let signature = '', mode = '';
      const update = () => {
        const type = api.getVal('type'), source = api.getVal('source'), category = api.getVal('category');
        const automatic = type === 'progress' && source === 'character';
        const nextSignature = category + ':' + api.getVal('characterId');
        if (nextSignature !== signature) {
          const options = D.goalMetricOptions(category, api.getVal('characterId'));
          const selected = api.getVal('metricKey');
          if (goal?.tracking?.category === category && goal.tracking.key && !options.some((item) => item.v === goal.tracking.key)) {
            options.push({ v: goal.tracking.key, t: goal.tracking.key });
          }
          api.setOptions('metricKey', options.length ? options : [{ v: '', t: '请先在角色档案中添加技能' }]);
          api.setVal('metricKey', options.some((item) => item.v === selected) ? selected : options[0]?.v || '');
          signature = nextSignature;
        }
        api.show('source', type === 'progress'); api.show('category', automatic); api.show('unit', !automatic);
        api.show('metricKey', automatic && ['schoolSkills', 'auxiliarySkills', 'training', 'petTraining'].includes(category));
        const metric = D.goalMetrics.find((item) => item.v === category);
        const nextMode = automatic ? category : type;
        if (automatic || mode && nextMode !== mode) api.setVal('unit', automatic ? metric.unit : type === 'progress' ? '级' : '万');
        mode = nextMode;
        form.querySelector('[name="target"]').step = automatic ? '1' : '0.1';
        form.querySelector('[data-field="target"] label').textContent = automatic ? '每个角色的目标' : '累计目标数值';
        const draft = { characterId: api.getVal('characterId'), type, target: api.getVal('target'), unit: api.getVal('unit'),
          tracking: automatic ? { category, key: api.getVal('metricKey') } : null };
        form.querySelector('[name="title"]').placeholder = D.goalDefaultTitle(draft);
        const summary = automatic ? D.goalSummary(draft) : null;
        preview.textContent = automatic ? '每个角色分别达到 ' + (draft.target || '—') + draft.unit + ' · 当前 ' + summary.achieved +
          ' / ' + summary.members.length + ' 个已达标' + (summary.unknown ? '，' + summary.unknown + ' 个待补录' : '') +
          '。保存角色档案后自动更新。' : '由适用角色共同累计到 ' + (draft.target || '—') + draft.unit + '，通过「记进度」记录每次变化。';
        if (draft.characterId === 'all') preview.textContent += ' 全部角色包含后续新增角色。';
        if (automatic && goal?.logs.length) preview.textContent += ' 原手动进度保留，跟随模式不累计手动记录。';
      };
      form.addEventListener('change', update); form.addEventListener('input', update); update();
    },
    onSubmit: async (data) => {
      const saved = await D.saveGoal({ ...data, tracking: data.type === 'progress' && data.source === 'character' ?
        { category: data.category, key: data.metricKey } : null }, goal?.id);
      savedId = saved.id;
      if (!goal) Object.assign(Views._goalFilter, { status: D.goalSummary(saved).status, type: '', keyword: '' });
      Views.goalRefresh(); UI.toast(goal ? '目标已保存' : '目标已创建');
    },
  });
};

Views.goalGrowthModal = function (goal) {
  const members = D.goalSummary(goal).members;
  UI.formModal({
    title: '更新养成 · ' + D.goalMetricLabel(goal.tracking), wide: true,
    returnFocus: () => Views.goalFocusTarget(goal.id, 'progress'),
    values: Object.fromEntries(members.map((member, index) => ['member' + index, member.value])),
    fields: [
      ...members.map((member, index) => ({ key: 'member' + index, label: member.name, type: 'number', min: 0, step: '1',
        placeholder: '未记录', hint: '目标 ' + goal.target + goal.unit + (member.done ? ' · 已达标' : '') })),
      { key: 'date', label: '变更日期', type: 'date', required: true, default: U.today() },
      { key: 'note', label: '本次说明', type: 'text', placeholder: '选填，如：周末统一补强身' },
    ],
    onRender: (form, api, overlay) => {
      overlay.classList.add('goal-modal');
      const hint = document.createElement('p'); hint.className = 'goal-form-preview full';
      hint.textContent = '填写角色当前的实际等级或数量，一次保存到角色档案，并同步生成养成记录。留空表示未记录。';
      form.prepend(hint);
    },
    onSubmit: async (data) => {
      const count = await D.saveGoalGrowth(goal.id, Object.fromEntries(members.map((member, index) => [member.id, data['member' + index]])),
        { date: data.date, note: data.note });
      const current = D.state.goals.find((item) => item.id === goal.id);
      UI.toast('已更新 ' + count + ' 个角色' + (D.goalSummary(current).status === 'done' ? '，目标已达成' : ''));
      Views.goalRefresh();
    },
  });
};

Views.goalProgressModal = function (goal, log) {
  UI.formModal({
    title: (log ? '编辑进度 · ' : '记进度 · ') + goal.title, values: log || {}, submitText: '记入',
    returnFocus: () => Views.goalFocusTarget(goal.id, 'progress'),
    fields: [
      { key: 'date', label: '日期', type: 'date', required: true, default: U.today() },
      { key: 'delta', label: '进度变化', type: 'number', required: true, step: '0.1', placeholder: '单位：' + (goal.unit || '万'),
        hint: '正数增加、负数减少；当前进度最低为 0' },
      { key: 'note', label: '备注', type: 'text', full: true, placeholder: '如：本月捉鬼净收益' },
    ],
    onSubmit: async (data) => {
      await D.saveGoalProgress(goal.id, data, log?.id); UI.toast('进度已更新'); Views.goalRefresh();
    },
  });
};

Views.goalHistoryModal = function (id) {
  const goal = D.state.goals.find((item) => item.id === id);
  if (!goal) return;
  const automatic = !!goal.tracking;
  const logs = automatic ? D.goalGrowthHistory(goal) : goal.logs.slice().sort((a, b) =>
    b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const number = (value, unit = goal.unit) => Views.growthHistoryValueHtml(value, { unit });
  const summary = D.goalSummary(goal);
  const overlay = UI.openModal({
    title: (automatic ? '养成记录 · ' : '进度历史 · ') + goal.title, wide: true,
    returnFocus: () => Views.goalFocusTarget(id, 'history'),
    body: '<p class="goal-history-hint">' + (automatic ? '当前 ' + number(summary.achieved, '') + ' / ' + number(summary.members.length, '') +
      ' 个角色达标 · 以下为角色档案中该项目的养成变更' : '当前 ' + number(goal.current) +
      (goal.baseProgress ? ' · 历史基础进度 ' + number(goal.baseProgress) : '')) + '</p>' +
      (logs.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th>' + (automatic ? '<th>角色</th>' : '') +
        '<th>变化</th><th>备注</th>' + (automatic ? '' : '<th>操作</th>') + '</tr></thead><tbody>' + logs.map((log) =>
        '<tr data-id="' + U.esc(log.id) + '"><td>' + U.esc(log.date) + '</td>' + (automatic ? '<td>' + U.esc(log.characterName) + '</td>' : '') +
        '<td class="goal-history-values">' + (automatic ? Views.growthHistoryValueHtml(log.change.from, log.change, true) +
          '<span class="growth-history-arrow"> → </span>' + Views.growthHistoryValueHtml(log.change.to, log.change) :
          '<span class="goal-history-delta' + (log.delta > 0 ? ' is-increase' : log.delta === 0 ? ' is-zero' : '') + '"><b class="growth-history-delta">' +
          (log.delta > 0 ? '+' : '') + U.fmtNumber(log.delta) + '</b><small class="growth-history-unit">' + U.esc(goal.unit) + '</small></span>') +
        '</td><td>' + U.esc(log.note || '—') + '</td>' + (automatic ? '' : '<td><button class="btn btn-sm" data-act="edit">编辑</button> ' +
          '<button class="btn btn-sm btn-danger" data-act="delete">删除</button></td>') + '</tr>').join('') + '</tbody></table></div>' :
        '<div class="empty"><p>' + (automatic ? '暂无该项目的养成变更；首次建档不生成记录' : '暂无进度记录') + '</p></div>'),
    footer: '<button class="btn" data-act="close">关闭</button><button class="btn btn-gold" data-act="add">' +
      (automatic ? '更新养成' : '记进度') + '</button>',
  });
  overlay.querySelector('[data-act="close"]').onclick = UI.requestCloseModal;
  overlay.querySelector('[data-act="add"]').onclick = () => automatic ? Views.goalGrowthModal(goal) : Views.goalProgressModal(goal);
  if (automatic) return;
  overlay.querySelectorAll('tr[data-id]').forEach((row) => {
    const log = logs.find((entry) => entry.id === row.dataset.id);
    row.querySelector('[data-act="edit"]').onclick = () => Views.goalProgressModal(goal, log);
    row.querySelector('[data-act="delete"]').onclick = async () => {
      const confirmed = await UI.confirmModal({ title: '删除进度', message: '删除这条进度记录并重新计算目标进度？', danger: true });
      if (confirmed) {
        try { await D.removeGoalProgress(id, log.id); Views.goalRefresh(); }
        catch (error) { UI.toast(error.message, 'err'); }
      }
      if (Views._current === 'goals') Views.goalHistoryModal(id);
    };
  });
};
