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
  if (detail.base.length) add('', detail.base.map((row) => D.equipmentStatText(row)).join(' · '), 'attribute',
    '<span class="eq-stat-pair">' + detail.base.map((row) => '<span class="eq-stat-item">' + Views.eqStatHtml(row) + '</span>').join('') + '</span>');
  for (const row of detail.extra) add('', D.equipmentStatText(row), 'attribute', Views.eqStatHtml(row));
  for (const row of detail.bonus.filter((row) => !detail.base.some((base) => base.key === row.key))) {
    add('宝石属性', D.equipmentStatText(row), 'gem', Views.eqStatHtml(row));
  }
  for (const row of detail.melt) add('', D.equipmentStatText(row), 'attribute',
    '<span class="eq-inline-label">熔炼</span> ' + Views.eqStatHtml(row));
  add('特技', detail.technique, 'special');
  detail.effects.forEach((effect) => add('特效', effect, 'special'));
  const socket = [], socketText = [];
  if (detail.forge !== null) { socket.push(UI.numberHtml(detail.forge, '段', { tag: 'strong' })); socketText.push(detail.forge + ' 段'); }
  if (rule.kind === 'accessory' && detail.forge !== null) { socket.push('星辉石'); socketText.push('星辉石'); }
  for (const gem of detail.gems) {
    socket.push(U.esc(gem.type) + (gem.level == null ? '' : '（' + UI.numberHtml(gem.level, '段', { tag: 'strong' }) + '）'));
    socketText.push(gem.type + (gem.level == null ? '' : '（' + gem.level + ' 段）'));
  }
  if (socket.length) add(rule.kind === 'accessory' ? '精炼' : detail.forge === null ? '宝石' : '锻炼', socketText.join(' '), 'upgrade', socket.join(' '));
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
