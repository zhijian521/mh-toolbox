'use strict';
/* 格子、详情、浮卡、仓库共用属性行，数字和标签分别呈现。 */
Views.eqStatHtml = function (row) {
  return '<span class="eq-stat-label">' + U.esc(D.equipmentStats[row.key]) + '</span> ' +
    '<strong class="eq-stat-number">' + (row.value >= 0 ? '+' : '−') + U.esc(Math.abs(row.value)) + '</strong>' +
    (row.boost == null ? '' : ' <span class="eq-stat-boost">[<strong>' + (row.boost >= 0 ? '+' : '−') + U.esc(Math.abs(row.boost)) + '</strong>]</span>');
};

Views.eqPropertyRows = function (eq, full = false) {
  const detail = D.equipmentDetails(eq), rule = D.equipmentRule(eq.slot), rows = [];
  const add = (label, value, kind = '', html) => { if (value !== '' && value != null) rows.push({ label, value, kind, html: html || U.esc(value) }); };
  for (const group of ['base', 'extra', 'bonus', 'melt']) {
    const prefix = group === 'melt' ? '熔炼' : group === 'bonus' ? '宝石加成' : '';
    for (const row of detail[group]) add(prefix, D.equipmentStatText(row), 'attribute', (prefix ? '<span class="eq-inline-label">' + prefix + '</span> ' : '') + Views.eqStatHtml(row));
  }
  add('特技', detail.technique, 'special');
  detail.effects.forEach((effect) => add('特效', effect, 'special'));
  if (detail.forge !== null) add(rule.kind === 'accessory' ? '精炼' : '锻炼', detail.forge + ' 级', 'upgrade', UI.numberHtml(detail.forge, '级'));
  detail.gems.forEach((gem) => add('宝石', gem.type + (gem.level == null ? '' : ' ×' + gem.level), 'upgrade', U.esc(gem.type) +
    (gem.level == null ? '' : ' ×' + UI.numberHtml(gem.level))));
  if (detail.clock.name) add('钟灵石', detail.clock.name + ' ' + detail.clock.level + ' 级', 'special', U.esc(detail.clock.name) + ' ' + UI.numberHtml(detail.clock.level, '级'));
  add('套装', detail.suit, 'special'); add('符石', detail.runes, 'upgrade');
  if (rule.kind === 'jade') {
    if (detail.jade.dust !== null) add('灵尘', detail.jade.dust + ' 级', 'upgrade', UI.numberHtml(detail.jade.dust, '级'));
    if (detail.jade.assault) add('奇袭', detail.jade.assault + (detail.jade.chance == null ? '' : ' ' + detail.jade.chance + '%'), 'special',
      U.esc(detail.jade.assault) + (detail.jade.chance == null ? '' : ' ' + UI.numberHtml(detail.jade.chance, '%')));
    if (detail.jade.holes) add('开光', detail.jade.holes + ' 孔', '', UI.numberHtml(detail.jade.holes, '孔'));
    detail.jade.enchantments.forEach((value, i) => add('孔 ' + (i + 1), value || '未强化', 'special'));
  }
  if (detail.legacy) add('原有属性', detail.legacy, 'legacy');
  if (full) {
    add('五行', detail.element);
    if (detail.durability !== null) add('耐久', detail.durability);
    if (detail.repair !== null) add('修理失败', detail.repair + ' 次');
    add('制造者', detail.maker); add('备注', eq.note);
  }
  return rows;
};

Views.eqSlotPropertiesHtml = function (eq) {
  const rows = Views.eqPropertyRows(eq);
  return '<span class="eq-slot-properties">' + (rows.length ? rows.map((row) =>
    '<span class="eq-slot-line eq-property-' + row.kind + '">' +
    (row.label && !['attribute', 'legacy'].includes(row.kind) ? '<span class="eq-inline-label">' + U.esc(row.label) + '</span> ' : '') +
    row.html + '</span>').join('') : '<span class="eq-slot-line eq-property-legacy">未录入属性</span>') + '</span>';
};

Views.eqPropertiesHtml = function (eq) {
  return '<div class="eq-attribute-title"><b>' + U.esc(eq.name) + '</b><span>' + U.esc(eq.slot +
    (!D.isJade(eq.slot) && eq.level ? ' · ' + eq.level + ' 级' : '')) + '</span></div><dl class="eq-properties">' +
    Views.eqPropertyRows(eq, true).map((row) => '<div class="eq-property eq-property-' + row.kind + '"><dt>' +
      U.esc(row.label || '属性') + '</dt><dd>' + row.html + '</dd></div>').join('') + '</dl>';
};
