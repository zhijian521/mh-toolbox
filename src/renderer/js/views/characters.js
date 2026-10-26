'use strict';
/* 角色档案与手动养成记录。 */
Views.characters = function () {
  const root = document.getElementById('view');
  const scrollTop = root.scrollTop;
  const characters = D.orderedCharacters();
  root.innerHTML = '<div class="char-page">' +
    (characters.length ? '<div class="char-grid">' + characters.map(Views.charCardHtml).join('') + '</div>' :
      '<div class="empty"><div class="ic">' + UI.icon('user', 30) + '</div><p>为每个角色建立档案，记录技能和修炼。</p></div>') + '</div>';
  root.querySelectorAll('.char-card').forEach((card) => {
    const character = D.charById(card.dataset.id);
    card.querySelector('[data-act="edit"]').onclick = () => Views.charModal(character);
    card.querySelector('[data-act="history"]').onclick = () => Views.charHistoryModal(character.id);
    card.querySelector('[data-act="del"]').onclick = () => Views.charDelete(character);
    card.querySelectorAll('[data-act="quick-edit"]').forEach((button) => {
      button.onclick = () => Views.charQuickModal(character.id, button.dataset.category, button.dataset.key);
    });
  });
  UI.bindCardOrdering(root, { grid: '.char-grid', card: '.char-card', kind: 'character',
    pending: () => Views._charOrderPending, onMove: Views.charPersistOrder });
  root.scrollTop = scrollTop;
};

Views.charPersistOrder = function (id, changes) {
  return UI.persistCardOrder(Views, '_charOrderPending', {
    grid: '.char-grid', save: () => D.saveCharacterOrder(id, changes),
    onSaved: () => Views.charRefresh(id, 'move'), message: '角色顺序已保存',
  });
};

Views.charFocusTarget = function (id, action = 'edit') {
  if (Views._current !== 'characters') return null;
  const card = document.querySelector('.char-card[data-id="' + CSS.escape(id || '') + '"]');
  const selector = typeof action === 'object' ? '[data-act="quick-edit"][data-category="' + CSS.escape(action.category) +
    '"][data-key="' + CSS.escape(action.key) + '"]' : '[data-act="' + CSS.escape(action) + '"]';
  return (card && (card.querySelector(selector) || card.querySelector('[data-act="edit"]'))) ||
    document.getElementById('quick-add');
};

Views.charRefresh = function (id, action = 'edit') {
  Views.refreshHeader();
  if (Views._current !== 'characters') return;
  Views.characters();
  if (!document.querySelector('.modal')) Views.charFocusTarget(id, action).focus({ preventScroll: true });
};

Views.charCardHtml = function (character) {
  const progress = D.normalizeCharacterProgress(character.progress);
  const heading = (title) => '<div class="char-section-head"><h3>' + title + '</h3></div>';
  const iconButton = (action, icon, label, extra = '') => '<button class="btn btn-sm char-icon-btn' +
    (action === 'del' ? ' btn-danger' : action === 'move' ? ' card-drag-handle' : '') + '" data-act="' + action + '" title="' + label + '" aria-label="' + label + '"' + extra + '>' + UI.icon(icon, 15) + '</button>';
  const value = (label, number, unit, category, key = '') => '<div class="char-value"><dt>' + U.esc(label) + '</dt><dd' +
    (number == null ? ' class="is-empty"' : '') + '><button type="button" class="char-value-edit" data-act="quick-edit" data-category="' + category +
    '" data-key="' + U.esc(key) + '" title="点击修改' + U.esc(label) + '" aria-haspopup="dialog" aria-label="修改' + U.esc(label) +
    '，当前' + (number == null ? '未记录' : U.esc(number) + D.growthMetric(category, key).unit) + '">' +
    UI.numberHtml(number, unit) + '</button></dd></div>';
  const skills = (list, category) => list.length ? '<dl class="char-skills">' + list.map((skill) => value(skill.name, skill.level, '级', category, skill.name)).join('') +
    '</dl>' : '<p class="char-unrecorded">未记录</p>';
  const training = (title, fields, values, category) => '<section><h4>' + title + '</h4><dl class="char-training-values">' +
    fields.map((field) => value(field.label, values[field.key], '', category, field.key)).join('') + '</dl></section>';
  return '<article class="char-card" data-id="' + U.esc(character.id) + '" aria-label="' + U.esc(character.name) + '的角色档案">' +
    '<header class="char-top"><div class="char-identity">' + UI.icon('hero', 40) + '<div><h2 class="char-name">' + U.esc(character.name) +
    '</h2><p class="char-sub">' + U.esc([character.level ? character.level + ' 级' : '', character.school, character.server].filter(Boolean).join(' · ')) +
    '</p></div></div><div class="char-toolbar">' +
      iconButton('move', 'grip', '拖动排序，或用方向键前后移动', ' draggable="true"') + iconButton('history', 'calendar', '查看养成记录') +
      iconButton('del', 'trash', '删除角色') +
      iconButton('edit', 'edit', '编辑档案') + '</div></header>' +
    '<section class="char-section">' + heading('师门技能') + skills(progress.schoolSkills, 'schoolSkills') + '</section>' +
    '<section class="char-section">' + heading('修炼') + '<div class="char-training">' +
      training('人物', D.characterTraining, progress.training, 'training') + training('召唤兽', D.petTraining, progress.petTraining, 'petTraining') + '</div></section>' +
    '<section class="char-section">' + heading('辅助技能') + skills(progress.auxiliarySkills, 'auxiliarySkills') + '</section>' +
    '<section class="char-section">' + heading('其他养成') + '<dl class="char-growth">' +
      value('乾元丹', progress.qianyuanPills, '个', 'qianyuanPills') + value('潜能果', progress.potentialFruits, '个', 'potentialFruits') + '</dl>' +
      (progress.note ? '<p class="char-note">' + U.esc(progress.note) + '</p>' : '') + '</section></article>';
};

Views.charDelete = async function (character) {
  const count = ['transactions', 'sessions', 'goals', 'equipment'].reduce((total, key) =>
    total + D.state[key].filter((item) => item.characterId === character.id).length, 0);
  const ok = await UI.confirmModal({ title: '删除角色', danger: true, confirmText: '确认删除',
    message: '确定删除角色「' + character.name + '」吗？技能养成档案、养成变更记录及名下 ' + count +
      ' 条相关记录（收益/在线/账号账本/目标/装备）会一并删除，且无法恢复。' });
  if (!ok) return;
  const characters = D.orderedCharacters();
  const index = characters.findIndex((item) => item.id === character.id);
  const next = characters[index + 1] || characters[index - 1];
  const active = D.state.activeSession && D.state.activeSession.characterId === character.id;
  try {
    await D.removeCharacter(character.id);
    if (active) Views.clearQuickTimer();
    if (D.charFilter === character.id) D.setCharFilter('all');
    if (Views._current === 'characters') Views.charRefresh(next && next.id);
    else Views.rerender();
    UI.toast('角色已删除');
  } catch (error) {
    UI.toast(error.message || '删除失败，请重试', 'err');
  }
};
