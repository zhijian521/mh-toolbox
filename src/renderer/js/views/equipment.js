'use strict';
/* 角色装备栏、三套搭配与共用仓库。 */
Views._eq = { characterId: '', warehouse: false, boardScroll: 0 };
Views._eqFilter = { group: '', slot: '', status: '', kw: '' };

Views.equipment = function () {
  UI.closePop();
  const root = document.getElementById('view');
  const scrollTop = root.scrollTop;
  const characters = D.state.characters;
  if (!characters.length) {
    root.innerHTML = '<div class="empty"><div class="ic">' + UI.icon('sword', 30) + '</div>' +
      '<p>先创建角色，再配置你的三套装备。</p><button class="btn" data-act="create">创建角色</button></div>';
    root.querySelector('[data-act="create"]').onclick = () => Views.go('characters');
    return;
  }
  if (Views._eq.warehouse) {
    const selected = characters.find((character) => character.id === Views._eq.characterId) || characters[0];
    const character = D.equipmentProfile(selected.id);
    Views._eq.characterId = character.id;
    root.innerHTML = '<div class="eq-page"><div class="eq-toolbar">' +
      '<button class="btn" data-act="back">返回装备栏</button></div>' + Views.eqWarehouseHtml(character) + '</div>';
    root.querySelector('[data-act="back"]').onclick = () => {
      Views._eq.warehouse = false;
      Views.equipment();
      root.scrollTop = Views._eq.boardScroll;
    };
    Views.eqBindWarehouse(root, character);
  } else {
    root.innerHTML = '<div class="eq-page"><div class="eq-roster">' +
      characters.map((item) => {
        const character = D.equipmentProfile(item.id);
        return Views.eqBoardHtml(character, character.viewedEquipmentSet);
      }).join('') + '</div></div>';
    root.querySelectorAll('[data-eq-character]').forEach((board) => {
      const character = D.equipmentProfile(board.dataset.eqCharacter);
      Views.eqBindBoard(board, character, character.viewedEquipmentSet);
    });
  }
  Views.eqBindTooltips(root);
  root.scrollTop = scrollTop;
};

Views.eqSlotHtml = function (character, index, slot) {
  const id = character.equipmentSets[index].slots[slot];
  const eq = D.equipmentById(id);
  const pending = index === 0 && character.pendingEquipmentSlots.includes(slot) && !eq;
  const locked = D.isJade(slot) && !character.soulJade.unlocked;
  const icons = { 武器: 'sword', 头盔: 'helmet', 项链: 'necklace', 衣服: 'armor', 腰带: 'belt', 鞋子: 'boots',
    戒指: 'ring', 耳饰: 'earring', 手镯: 'bracelet', 佩饰: 'pendant', '玉魄·阳': 'jade-yang', '玉魄·阴': 'jade-yin' };
  const recordedLevel = eq ? D.isJade(slot) ? D.equipmentDetails(eq).jade.dust : eq.level : null;
  const level = recordedLevel !== '' && recordedLevel != null ? recordedLevel + ' 级' : '';
  return '<button class="eq-slot' + (eq ? ' is-filled' : '') + (pending ? ' is-pending' : '') + '" data-slot="' + U.esc(slot) +
    '"' + (eq ? ' data-eq-hover="' + U.esc(eq.id) + '"' : '') + ' aria-label="' + U.esc(slot + '：' +
    (eq ? eq.name + '，查看属性与操作' : locked ? '未解锁，设置命魂之玉' : pending ? '旧装备待选择' : '空位，选择装备')) + '">' +
    '<span class="eq-slot-heading"><span class="eq-slot-icon">' + UI.icon(icons[slot], 16) + '</span>' +
      '<span class="eq-slot-type">' + U.esc(slot) + '</span><span class="eq-slot-level"' +
      (eq && D.isJade(slot) ? ' aria-label="灵尘等级 ' + U.esc(level) + '"' : '') + '>' + U.esc(level) + '</span></span>' +
    '<span class="eq-slot-name">' + U.esc(eq ? eq.name : locked ? '未解锁' : pending ? '待选择' : '＋ 添加') + '</span>' +
    (eq ? Views.eqSlotPropertiesHtml(eq) : '') + '</button>';
};

Views.eqBoardHtml = function (character, index) {
  const soul = character.soulJade;
  const pending = character.pendingEquipmentSlots;
  return '<section class="eq-board" data-eq-character="' + U.esc(character.id) + '" aria-label="' + U.esc(character.name) + '的装备栏">' +
    (pending.length ? '<p class="eq-notice">旧档案中「' + U.esc(pending.join('、')) +
      '」的第一套穿戴待确认。请在对应格子选择装备或暂不配置，全部档案已保留在仓库。</p>' : '') +
      '<div class="eq-section-head"><h2>装备</h2><span>悬停查看 · 点击换装</span></div>' +
      '<div class="eq-body-grid">' + D.equipmentGroups.gear.slots.map((slot) => Views.eqSlotHtml(character, index, slot)).join('') +
        '<div class="eq-portrait"><div class="eq-plan-tabs" role="group" aria-label="' + U.esc(character.name) + '的装备方案">' +
        character.equipmentSets.map((item, number) => {
          const active = number === character.activeEquipmentSet;
          const label = '方案 ' + (number + 1) + '：' + item.name + (active ? '（当前使用）' : '');
          return '<button class="eq-plan' + (number === index ? ' on' : '') + (active ? ' is-active' : '') +
            '" data-set="' + number + '" title="' + U.esc(label) + '" aria-label="' + U.esc(label) +
            '" aria-pressed="' + (number === index) + '">' + (number + 1) + '</button>';
        }).join('') + '</div><div class="eq-identity">' + UI.icon('hero', 48) +
        '<h3>' + U.esc(character.name) + '</h3><p>' + [character.level ? character.level + ' 级' : '', character.school].filter(Boolean)
          .map((text) => '<span>' + U.esc(text) + '</span>').join('') +
        '</p><div class="eq-plan-state">' + (index === character.activeEquipmentSet ? '<span>使用中</span>' :
          '<button class="btn btn-sm" data-act="activate">使用此套</button>') + '</div></div></div></div>' +
      '<div class="eq-section-head"><h2>灵饰</h2></div>' +
      '<div class="eq-accessory-grid">' + D.equipmentGroups.accessory.slots.map((slot) => Views.eqSlotHtml(character, index, slot)).join('') + '</div>' +
      '<div class="eq-section-head eq-soul-head"><div><h2>命魂之玉</h2><p>' +
        (soul.unlocked ? U.esc(soul.attribute) + ' · 修炼 ' + soul.level + ' 级' : '尚未解锁') +
        '</p></div><button class="btn btn-sm" data-act="soul">修炼设置</button></div>' +
      '<div class="eq-jade-grid">' + D.equipmentGroups.jade.slots.map((slot) => Views.eqSlotHtml(character, index, slot)).join('') + '</div>' +
      '<div class="eq-board-actions"><button class="btn btn-sm" data-act="warehouse">装备仓库</button>' +
        '<div class="eq-actions"><button class="btn btn-sm" data-act="rename">改名</button>' +
        '<button class="btn btn-sm" data-act="copy">复制方案</button></div></div></section>';
};

Views.eqBindBoard = function (root, character, index) {
  root.querySelectorAll('[data-set]').forEach((button) => {
    button.onclick = () => Views.eqCommit(() => { D.equipmentProfile(character.id).viewedEquipmentSet = Number(button.dataset.set); });
  });
  root.querySelectorAll('[data-slot]').forEach((button) => {
    button.onclick = () => {
      UI.closePop();
      const id = character.equipmentSets[index].slots[button.dataset.slot];
      const eq = D.equipmentById(id);
      if (eq) Views.eqDetailModal(eq, { characterId: character.id, index });
      else Views.eqPickModal(character.id, index, button.dataset.slot);
    };
  });
  root.querySelector('[data-act="rename"]').onclick = () => Views.eqRenameModal(character.id);
  root.querySelector('[data-act="copy"]').onclick = () => Views.eqCopyModal(character.id, index);
  root.querySelector('[data-act="soul"]').onclick = () => Views.soulJadeModal(character.id);
  const activate = root.querySelector('[data-act="activate"]');
  if (activate) activate.onclick = () => Views.eqCommit(() => { D.equipmentProfile(character.id).activeEquipmentSet = index; }, '已切换当前使用方案');
  root.querySelector('[data-act="warehouse"]').onclick = () => {
    const view = document.getElementById('view');
    Views._eq.boardScroll = view.scrollTop;
    Views._eq.characterId = character.id;
    Views._eq.warehouse = true;
    Views._eqFilter = { group: '', slot: '', status: '', kw: '' };
    Views.equipment();
    view.scrollTop = 0;
  };
};

Views.eqCommit = async function (change, message) {
  try {
    await D.commitEquipment(change);
    UI.closeModal();
    Views.equipment();
    if (message) UI.toast(message);
    return true;
  } catch (error) {
    UI.toast(error.message || '保存失败，请重试', 'err');
    return false;
  }
};

Views.eqBindTooltips = function (root) {
  root.querySelectorAll('[data-eq-hover]').forEach((anchor) => {
    const show = () => {
      const eq = D.equipmentById(anchor.dataset.eqHover);
      if (!eq) return;
      const pop = UI.openPop(anchor, Views.eqPropertiesHtml(eq) + '<p class="eq-caption">点击查看详情与变动记录</p>');
      pop.classList.add('eq-tooltip-pop');
      pop.id = 'equipment-tooltip';
      pop.setAttribute('role', 'tooltip');
      root.querySelectorAll('[aria-describedby="equipment-tooltip"]').forEach((item) => item.removeAttribute('aria-describedby'));
      anchor.setAttribute('aria-describedby', pop.id);
      requestAnimationFrame(Views.eqPositionTooltip);
    };
    const hide = () => {
      anchor.removeAttribute('aria-describedby');
      if (document.querySelector('.eq-tooltip-pop')) UI.closePop();
    };
    anchor.addEventListener('mouseenter', show);
    anchor.addEventListener('mouseleave', () => { if (document.activeElement !== anchor) hide(); });
    anchor.addEventListener('focus', show);
    anchor.addEventListener('blur', hide);
    anchor.addEventListener('keydown', (event) => { if (event.key === 'Escape') { hide(); event.preventDefault(); } });
  });
};

Views.eqPositionTooltip = function () {
  const pop = document.querySelector('.eq-tooltip-pop');
  if (!pop || !pop._anchor.isConnected) return;
  const bounds = pop._anchor.getBoundingClientRect();
  const view = document.getElementById('view').getBoundingClientRect();
  if (bounds.bottom <= view.top || bounds.top >= view.bottom) { UI.closePop(); return; }
  let left = bounds.right + 10;
  if (left + pop.offsetWidth > innerWidth - 8) left = bounds.left - pop.offsetWidth - 10;
  pop.style.left = Math.max(8, Math.min(left, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = Math.max(8, Math.min(bounds.top, innerHeight - pop.offsetHeight - 8)) + 'px';
};
