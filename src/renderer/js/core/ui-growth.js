'use strict';
/* 数字与单位分开呈现，页面通过语义样式决定颜色。 */
UI.numberHtml = function (value, unit = '', opts = {}) {
  if (value == null) return U.esc(opts.empty ?? '—');
  const tag = ['span', 'b', 'strong'].includes(opts.tag) ? opts.tag : 'span';
  return '<' + tag + (opts.numberClass ? ' class="' + U.esc(opts.numberClass) + '"' : '') + '>' +
    U.fmtNumber(value) + '</' + tag + '>' + (unit ? '<small' +
      (opts.unitClass ? ' class="' + U.esc(opts.unitClass) + '"' : '') + '>' + U.esc(unit) + '</small>' : '');
};

UI.growthHistoryValueHtml = function (value, change, before = false) {
  if (typeof value !== 'number') return '<span class="growth-history-text">' + U.esc(value == null ? '未记录' : String(value)) + '</span>';
  const training = D.growthMetrics.some((metric) => metric.kind === 'training' && metric.group === change.group);
  return UI.numberHtml(value, change.unit, {
    numberClass: 'growth-history-number' + (before ? ' is-before' : training ? ' is-training' : ''),
    unitClass: 'growth-history-unit',
  });
};

UI.growthHistoryValuesHtml = function (change) {
  return UI.growthHistoryValueHtml(change.kind === 'added' ? '未添加' : change.from, change, true) +
    '<span class="growth-history-arrow"> → </span>' +
    UI.growthHistoryValueHtml(change.kind === 'removed' ? '已移除' : change.to, change);
};

UI.growthHistoryTitle = function (change) {
  const text = (value) => value == null ? '未记录' : String(value) + (typeof value === 'number' ? change.unit : '');
  return (change.kind === 'added' ? '未添加' : text(change.from)) + ' → ' +
    (change.kind === 'removed' ? '已移除' : text(change.to));
};

UI.growthHistoryKindHtml = function (change) {
  const labels = { added: '新增', removed: '移除', recorded: '补录', cleared: '清空', increase: '提升', decrease: '调低', changed: '调整' };
  return (labels[change.kind] || labels.changed) + (change.kind === 'increase' ?
    ' <b class="growth-history-delta">+' + U.fmtNumber(change.to - change.from) + '</b>' : '');
};
