'use strict';
/* 目标历史保留表格排版，日期范围和分页与角色养成记录共用。 */
Views.goalHistoryModal = function (id, state) {
  const goal = D.state.goals.find((item) => item.id === id);
  if (!goal) return;
  const automatic = !!goal.tracking, summary = D.goalSummary(goal);
  const number = (value, unit = goal.unit) => UI.growthHistoryValueHtml(value, { unit });
  const overlay = UI.openModal({
    title: (automatic ? '养成记录 · ' : '进度历史 · ') + goal.title, wide: true,
    returnFocus: () => Views.goalFocusTarget(id, 'history'),
    body: '<p class="goal-history-hint">' + (automatic ? '当前 ' + number(summary.achieved, '') + ' / ' + number(summary.members.length, '') +
      ' 个角色达标 · 以下为角色档案中该项目的养成变更' : '当前 ' + number(goal.current) +
      (goal.baseProgress ? ' · 历史基础进度 ' + number(goal.baseProgress) : '')) + '</p>' +
      '<div class="goal-history-filters"><div data-history="range"></div></div><div data-history="records"></div>',
    footer: '<button class="btn" data-act="close">关闭</button><button class="btn btn-gold" data-act="add"' +
      (automatic && !summary.members.length ? ' disabled' : '') + '>' + (automatic ? '更新养成' : '记进度') + '</button>',
  });
  overlay.classList.add('goal-modal', 'goal-history-modal');
  overlay.querySelector('[data-act="close"]').onclick = UI.requestCloseModal;
  overlay.querySelector('[data-act="add"]').onclick = () => automatic ? Views.goalGrowthModal(goal) : Views.goalProgressModal(goal);
  const history = UI.historyList(overlay, {
    state, countLabel: automatic ? '次变更' : '条记录', rangeLabel: '目标记录日期范围',
    emptyText: automatic ? '暂无该项目的养成变更；首次建档不生成记录' : '暂无进度记录',
    getEntries: (range) => automatic ? D.goalGrowthHistory(goal, range) : goal.logs.filter((log) =>
      (!range.from || log.date >= range.from) && (!range.to || log.date <= range.to)).slice().sort((a, b) =>
      b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)),
    renderEntries: (logs) => '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th>' + (automatic ? '<th>角色</th>' : '') +
      '<th>变化</th><th>备注</th>' + (automatic ? '' : '<th>操作</th>') + '</tr></thead><tbody>' + logs.map((log) =>
      '<tr data-id="' + U.esc(log.id) + '"><td>' + U.esc(log.date) + '</td>' + (automatic ? '<td>' + U.esc(log.characterName) + '</td>' : '') +
      '<td class="goal-history-values">' + (automatic ? UI.growthHistoryValuesHtml(log.change) +
        '<span class="goal-history-kind' + (log.change.kind === 'increase' ? ' is-increase' : '') + '">' +
        UI.growthHistoryKindHtml(log.change) + '</span>' :
        '<span class="goal-history-delta' + (log.delta > 0 ? ' is-increase' : log.delta === 0 ? ' is-zero' : '') + '">' +
        (log.delta > 0 ? '<span class="growth-history-delta">+</span>' : '') +
        UI.numberHtml(log.delta, goal.unit, { tag: 'b', numberClass: 'growth-history-delta', unitClass: 'growth-history-unit' }) + '</span>') +
      '</td><td>' + U.esc(log.note || '—') + '</td>' + (automatic ? '' : '<td><button class="btn btn-sm" data-act="edit">编辑</button> ' +
        '<button class="btn btn-sm btn-danger" data-act="delete">删除</button></td>') + '</tr>').join('') + '</tbody></table></div>',
    bindEntries: (records, logs) => {
      if (automatic) return;
      records.querySelectorAll('tr[data-id]').forEach((row) => {
        const log = logs.find((entry) => entry.id === row.dataset.id);
        row.querySelector('[data-act="edit"]').onclick = () => Views.goalProgressModal(goal, log);
        row.querySelector('[data-act="delete"]').onclick = async () => {
          const savedState = history.getState();
          const confirmed = await UI.confirmModal({ title: '删除进度', message: '删除这条进度记录并重新计算目标进度？', danger: true });
          if (confirmed) {
            try { await D.removeGoalProgress(id, log.id); Views.goalRefresh(); }
            catch (error) { UI.toast(error.message, 'err'); }
          }
          if (Views._current === 'goals') Views.goalHistoryModal(id, savedState);
        };
      });
    },
  });
};
