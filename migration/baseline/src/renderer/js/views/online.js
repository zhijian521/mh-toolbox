'use strict';
/* 收益模块的在线表单、历史列表及未结束记录恢复。 */
Views._onlineRange = { preset: 'today' };
Views._onlinePage = 0;

Views.onlineTime = function (timestamp) {
  const date = new Date(timestamp);
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
};

Views.onlineTimestamp = function (date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return NaN;
  const parts = time.split(':').map(Number);
  if (parts[0] > 23 || parts[1] > 59 || parts[2] > 59) return NaN;
  const result = U.parseDate(date);
  if (U.fmtDate(result) !== date) return NaN;
  result.setHours(parts[0], parts[1], parts[2] || 0, 0);
  return result.getTime();
};

Views.onlineFormData = function (data, original) {
  const mode = original && original.mode === 'legacy' ? 'legacy' : data.mode;
  return Object.assign({}, original, {
    mode, characterId: data.characterId, date: data.date, note: data.note,
    startAt: mode === 'range' ? Views.onlineTimestamp(data.startDate, data.startTime) : null,
    endAt: mode === 'range' ? Views.onlineTimestamp(data.endDate, data.endTime) : null,
    minutes: Number(data.hours) * 60 + Number(data.extraMinutes),
    accounts: mode === 'legacy' ? null : data.accounts,
    cardPrice: mode === 'legacy' ? null : data.cardPrice,
    cost: mode === 'legacy' ? data.legacyCost : undefined
  });
};

Views.onlineModal = function (session, finishActiveId) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); return; }
  const original = session || {};
  const legacy = original.mode === 'legacy';
  const endAt = original.endAt || Date.now();
  const startAt = original.startAt || endAt - 3600000;
  const minutes = original.minutes || 60;
  UI.formModal({
    title: finishActiveId ? '补填结束时间' : session ? '编辑在线记录' : '补记在线',
    values: {
      characterId: original.characterId || Views.quickCharId(), mode: original.mode || 'range',
      startDate: U.fmtDate(new Date(startAt)), startTime: Views.onlineTime(startAt),
      endDate: U.fmtDate(new Date(endAt)), endTime: Views.onlineTime(endAt),
      date: original.date || U.today(), hours: Math.floor(minutes / 60), extraMinutes: minutes % 60,
      accounts: original.accounts || D.state.quickSettings.accounts,
      cardPrice: original.cardPrice || D.state.quickSettings.cardPrice,
      legacyCost: original.cost || 0, note: original.note || ''
    },
    fields: [
      { key: 'characterId', label: '归属角色', type: 'select', options: D.state.characters.map(c => ({ v: c.id, t: c.name })) },
      { key: 'mode', label: '填写方式', type: 'segment', options: [{ v: 'range', t: '时间段' }, { v: 'duration', t: '只填时长' }] },
      { key: 'startDate', label: '开始日期', type: 'date', required: true },
      { key: 'startTime', label: '开始时间', type: 'time', step: '1', required: true },
      { key: 'endDate', label: '结束日期', type: 'date', required: true },
      { key: 'endTime', label: '结束时间', type: 'time', step: '1', required: true },
      { key: 'date', label: '在线日期', type: 'date', required: true, full: true },
      { key: 'hours', label: '小时', type: 'number', required: true, min: 0, step: 1 },
      { key: 'extraMinutes', label: '分钟', type: 'number', required: true, min: 0, step: 1 },
      { key: 'accounts', label: '在线角色数', type: 'number', required: true, min: 1, step: 1 },
      { key: 'cardPrice', label: '点卡价格（梦幻币 / 点）', type: 'number', required: true, min: 1, step: 1 },
      { key: 'legacyCost', label: '历史点卡费用（万）', type: 'number', min: 0, step: '0.01', hint: '原记录未保存角色数和单价，费用按原值保留', full: true },
      { key: 'note', label: '备注', type: 'text', full: true }
    ],
    onRender: function (form, api) {
      const preview = document.createElement('p');
      preview.className = 'online-preview';
      preview.setAttribute('aria-live', 'polite');
      form.appendChild(preview);
      const update = function () {
        const range = !legacy && api.getVal('mode') === 'range';
        ['startDate', 'startTime', 'endDate', 'endTime'].forEach(key => api.show(key, range));
        ['date', 'hours', 'extraMinutes'].forEach(key => api.show(key, !range));
        ['accounts', 'cardPrice'].forEach(key => api.show(key, !legacy));
        api.show('mode', !legacy);
        api.show('legacyCost', legacy);
        const data = {};
        ['characterId', 'mode', 'startDate', 'startTime', 'endDate', 'endTime', 'date', 'hours',
          'extraMinutes', 'accounts', 'cardPrice', 'legacyCost', 'note'].forEach(key => { data[key] = api.getVal(key); });
        const record = D.makeSession(Views.onlineFormData(data, original));
        preview.textContent = Number.isFinite(record.minutes) && record.minutes > 0
          ? '在线 ' + (record.minutes / 60).toFixed(2) + ' 小时 · 点卡 ' + U.fmtMoney(record.cost) +
            (range ? ' · 跨天自动分摊' : ' · 未提供起止时间，无法检查时段重叠')
          : '填写在线时间后预览点卡费用';
      };
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      form.addEventListener('segchange', update);
      update();
    },
    validate: function (data) {
      if (data.mode !== 'range' && !legacy && (!Number.isInteger(data.hours) || !Number.isInteger(data.extraMinutes) || data.extraMinutes >= 60)) return '小时和分钟需为整数，分钟为 0～59';
      return D.sessionError(D.makeSession(Views.onlineFormData(data, original)), finishActiveId);
    },
    onSubmit: async function (data) {
      await D.saveSession(Views.onlineFormData(data, original), finishActiveId);
      if (finishActiveId) Views.clearQuickTimer();
      UI.toast('在线记录已保存，点卡成本已同步');
      Views.rerender();
    }
  });
};

Views.onlineRows = function (sessions) {
  return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期 / 归属角色</th><th>在线时间</th>' +
    '<th>角色数 / 来源</th><th class="num">点卡消耗</th><th>操作</th></tr></thead><tbody>' +
    (sessions.length ? sessions.map(function (session) {
      const source = { timer: '自动计时', manual: '手动补记', legacy: '历史记录' }[session.source] || '手动补记';
      const period = session.mode === 'range'
        ? U.fmtDate(new Date(session.startAt)) + ' ' + Views.onlineTime(session.startAt) + ' 至 ' +
          U.fmtDate(new Date(session.endAt)) + ' ' + Views.onlineTime(session.endAt)
        : '仅记录时长';
      return '<tr data-session="' + U.esc(session.id) + '"><td>' + U.esc(session.date) +
        '<div class="cell-sub">' + U.esc(D.charName(session.characterId)) + '</div></td><td>' +
        U.esc((session.minutes / 60).toFixed(2) + ' 小时') + '<div class="cell-sub">' + U.esc(period) + '</div>' +
        (session.note ? '<div class="cell-sub">' + U.esc(session.note) + '</div>' : '') + '</td><td>' +
        (session.accounts ? session.accounts + ' 角色' : '未记录角色数') + '<div class="cell-sub">' + source + '</div></td>' +
        '<td class="num money-out">' + U.fmtMoney(session.cost) + '</td><td class="online-actions">' +
        '<button class="btn btn-sm btn-ghost" data-session-act="edit">编辑</button>' +
        '<button class="btn btn-sm btn-ghost btn-danger" data-session-act="delete">删除</button></td></tr>';
    }).join('') : '<tr><td colspan="5"><div class="empty"><p>该时间范围内暂无在线记录，可补记之前的游戏时间。</p></div></td></tr>') +
    '</tbody></table></div>';
};

Views.bindOnlineRows = function (el) {
  el.querySelectorAll('[data-session]').forEach(function (row) {
    const session = D.state.sessions.find(s => s.id === row.dataset.session);
    row.querySelector('[data-session-act="edit"]').onclick = () => Views.onlineModal(session);
    row.querySelector('[data-session-act="delete"]').onclick = async function () {
      if (!await UI.confirmModal({ title: '删除在线记录', message: '该段在线时长和关联的点卡支出会一并删除。', danger: true })) return;
      try {
        await D.commitOnline(() => D.removeSession(session.id));
        UI.toast('已删除在线记录及点卡支出');
        Views.rerender();
      } catch (error) { UI.toast(error.message, 'err'); }
    };
  });
};

Views.sessionsIn = function (range) {
  return D.scope(D.state.sessions).filter(session => D.sessionSlices(session).some(slice =>
    (!range.from || slice.date >= range.from) && (!range.to || slice.date <= range.to)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
};

Views.earningsTabs = function (selected) {
  return '<div class="filter-bar"><div class="seg">' + [
    { id: 'transactions', label: '收益明细' }, { id: 'onlineRecords', label: '在线记录' }
  ].map(tab => '<button class="seg-btn' + (tab.id === selected ? ' on' : '') + '" data-earnings-tab="' + tab.id + '">' + tab.label + '</button>').join('') + '</div></div>';
};
Views.bindEarningsTabs = function (el) {
  el.querySelectorAll('[data-earnings-tab]').forEach(button => { button.onclick = () => Views.go(button.dataset.earningsTab); });
};

Views.onlineRecords = function () {
  const el = document.getElementById('view');
  const range = U.rangeFor(Views._onlineRange);
  const sessions = Views.sessionsIn(range);
  const pages = Math.max(1, Math.ceil(sessions.length / 50));
  Views._onlinePage = Math.min(Views._onlinePage, pages - 1);
  const stats = D.onlineStats(D.charFilter, range.from, range.to);
  el.innerHTML = Views.earningsTabs('onlineRecords') +
    '<div class="online-filter"><div data-range-filter="online"></div><button class="btn btn-gold" data-add-online>＋ 补记在线</button></div>' +
    '<div class="ledger-summary"><span>在线时长 <b>' + (stats.minutes / 60).toFixed(2) + ' 小时</b></span>' +
    '<span>点卡消耗 <b class="money-out">' + U.fmtMoney(stats.cost) + '</b></span><span>共 ' + stats.count + ' 段</span>' +
    '<span class="ledger-hint">统计按所选日期分摊，列表显示完整时段</span></div>' +
    Views.onlineRows(sessions.slice(Views._onlinePage * 50, (Views._onlinePage + 1) * 50)) +
    '<div class="ledger-pagination"><span>第 ' + (Views._onlinePage + 1) + ' / ' + pages + ' 页</span>' +
    '<button class="btn btn-sm" data-online-prev' + (Views._onlinePage === 0 ? ' disabled' : '') + '>上一页</button>' +
    '<button class="btn btn-sm" data-online-next' + (Views._onlinePage + 1 >= pages ? ' disabled' : '') + '>下一页</button></div>';
  UI.dateRange(el.querySelector('[data-range-filter]'), { value: Views._onlineRange, label: '在线记录时间',
    onChange: value => { Views._onlineRange = value; Views._onlinePage = 0; Views.onlineRecords(); } });
  el.querySelector('[data-add-online]').onclick = () => Views.onlineModal();
  el.querySelector('[data-online-prev]').onclick = () => { Views._onlinePage--; Views.onlineRecords(); };
  el.querySelector('[data-online-next]').onclick = () => { Views._onlinePage++; Views.onlineRecords(); };
  Views.bindEarningsTabs(el);
  Views.bindOnlineRows(el);
};

Views.clearQuickTimer = function () {
  if (Views._quick.interval) clearInterval(Views._quick.interval);
  Views._quick.interval = null;
  Views._quick.recovering = false;
};

Views.adjustOnlineStart = function () {
  const active = D.state.activeSession;
  if (!active) return;
  UI.formModal({
    title: '调整本次开始时间',
    values: { startDate: U.fmtDate(new Date(active.startAt)), startTime: Views.onlineTime(active.startAt) },
    fields: [
      { key: 'startDate', label: '开始日期', type: 'date', required: true },
      { key: 'startTime', label: '开始时间', type: 'time', step: '1', required: true }
    ],
    onSubmit: async function (data) {
      await D.adjustSessionStart(Views.onlineTimestamp(data.startDate, data.startTime));
      UI.toast('开始时间已更新');
      Views.rerender();
    }
  });
};

Views.recoverOnline = function () {
  const active = D.state.activeSession;
  if (!active) return;
  UI.openModal({
    title: '有一段在线记录尚未结束',
    body: '<p class="online-recovery-text">' + U.esc(D.charName(active.characterId)) + ' · ' +
      U.esc(U.fmtDate(new Date(active.startAt)) + ' ' + Views.onlineTime(active.startAt)) +
      ' 开始。继续计时会计入应用关闭期间的时间；如已下线，请补填实际结束时间。</p>',
    footer: '<button class="btn" data-recover="finish">补填结束时间</button><button class="btn btn-gold" data-recover="continue">继续计时</button>'
  });
  document.querySelector('[data-recover="finish"]').onclick = () => Views.onlineModal(Object.assign({}, active, { mode: 'range', source: 'timer' }), active.id);
  document.querySelector('[data-recover="continue"]').onclick = function () {
    Views._quick.recovering = false;
    if (!Views._quick.interval) Views._quick.interval = setInterval(Views.quickTick, 1000);
    UI.closeModal();
    UI.toast('已继续本次计时，未结束期间计入在线时间');
    Views.rerender();
  };
};
