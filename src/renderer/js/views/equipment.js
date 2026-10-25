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
  const eq = D.state.equipment.find((item) => item.id === id);
  const pending = index === 0 && character.pendingEquipmentSlots.includes(slot) && !eq;
  const locked = D.isJade(slot) && !character.soulJade.unlocked;
  const icons = { 武器: 'sword', 头盔: 'helmet', 项链: 'necklace', 衣服: 'armor', 腰带: 'belt', 鞋子: 'boots',
    戒指: 'ring', 耳饰: 'earring', 手镯: 'bracelet', 佩饰: 'pendant', '玉魄·阳': 'jade-yang', '玉魄·阴': 'jade-yin' };
  const attribute = eq ? (eq.jade ? eq.jade.base : eq.attributes || '').split('\n').find((line) => line.trim()) : '';
  const level = eq ? D.isJade(slot) ? (eq.jade ? eq.jade.dustLevel : 0) + ' 级' : eq.level ? eq.level + ' 级' : '' : '';
  return '<button class="eq-slot' + (eq ? ' is-filled' : '') + (pending ? ' is-pending' : '') + '" data-slot="' + U.esc(slot) +
    '"' + (eq ? ' data-eq-hover="' + U.esc(eq.id) + '"' : '') + ' aria-label="' + U.esc(slot + '：' +
    (eq ? eq.name + '，查看属性与操作' : locked ? '未解锁，设置命魂之玉' : pending ? '旧装备待选择' : '空位，选择装备')) + '">' +
    '<span class="eq-slot-heading"><span class="eq-slot-icon">' + UI.icon(icons[slot], 16) + '</span>' +
      '<span class="eq-slot-type">' + U.esc(slot) + '</span><span class="eq-slot-level"' +
      (eq && D.isJade(slot) ? ' aria-label="灵尘等级 ' + U.esc(level) + '"' : '') + '>' + U.esc(level) + '</span></span>' +
    '<span class="eq-slot-name">' + U.esc(eq ? eq.name : locked ? '未解锁' : pending ? '待选择' : '＋ 添加') + '</span>' +
    (eq ? '<span class="eq-slot-attribute">' + U.esc(attribute || '未录入属性') + '</span>' +
      (eq.special ? '<span class="eq-slot-special">' + U.esc(eq.special) + '</span>' : '') : '') + '</button>';
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
        '<h3>' + U.esc(character.name) + '</h3><p>' + U.esc([character.level ? character.level + ' 级' : '', character.school].filter(Boolean).join(' · ') || '角色档案') +
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
      const eq = D.state.equipment.find((item) => item.id === id);
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

Views.eqPropertiesHtml = function (eq) {
  const row = (label, value, kind) => '<div class="eq-property' + (kind ? ' eq-property-' + kind : '') + '"><dt>' +
    U.esc(label) + '</dt><dd>' + U.esc(value || '—') + '</dd></div>';
  let html = '<div class="eq-attribute-title"><b>' + U.esc(eq.name) + '</b><span>' + U.esc(eq.slot +
    (!D.isJade(eq.slot) && eq.level ? ' · ' + eq.level + ' 级' : '')) + '</span></div><dl class="eq-properties">';
  if (D.isJade(eq.slot) && eq.jade) {
    const jade = eq.jade;
    html += row('基础属性', jade.base, 'attribute') + row('附加属性', [jade.extra1, jade.extra2].filter(Boolean).join('\n'), 'attribute') +
      row('灵尘等级', jade.dustLevel + ' 级（含自带加成）', 'upgrade') + row('特效', eq.special, 'special') +
      row('开光孔', jade.holes + ' 个') + row(eq.slot === '玉魄·阳' ? '女娲灵契' : '女娲祝符',
        Array.from({ length: jade.holes }, (_, index) => '孔 ' + (index + 1) + '：' + (jade.enchantments[index] || '未强化')).join('\n'), 'special') +
      (jade.durability !== '' && jade.durability != null ? row('耐久', jade.durability + ' / 300') : '');
  } else {
    html += row('属性', eq.attributes, 'attribute') + row('特技 / 特效', eq.special, 'special') + row('宝石', eq.gems, 'upgrade');
  }
  return html + (eq.note ? row('备注', eq.note) : '') + '</dl>';
};

Views.eqBindTooltips = function (root) {
  root.querySelectorAll('[data-eq-hover]').forEach((anchor) => {
    const show = () => {
      const eq = D.state.equipment.find((item) => item.id === anchor.dataset.eqHover);
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
    anchor.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
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

Views.eqPickModal = function (characterId, index, slot) {
  const character = D.equipmentProfile(characterId);
  if (D.isJade(slot) && !character.soulJade.unlocked) { Views.soulJadeModal(characterId); return; }
  const candidates = D.state.equipment.filter((eq) => eq.characterId === characterId && eq.slot === slot && eq.status !== 'sold');
  const current = character.equipmentSets[index].slots[slot];
  const overlay = UI.openModal({
    title: character.equipmentSets[index].name + ' · 选择' + slot,
    body: '<p class="eq-muted">从当前角色的仓库选择。替换只影响这一套方案。</p><div class="eq-picker">' +
      (candidates.length ? candidates.map((eq) => '<button class="eq-pick-item' + (eq.id === current ? ' is-current' : '') +
        '" data-pick="' + U.esc(eq.id) + '"><b>' + U.esc(eq.name) + '</b><span>' +
        U.esc((eq.jade ? eq.jade.base : eq.attributes || '').split('\n')[0] || '未录入属性') + '</span><small>' +
        U.esc(D.equipmentReferences(eq.id).map((reference) => reference.name).join(' / ') || '未配置') + '</small></button>').join('') :
        '<p class="eq-picker-empty">仓库里还没有这个部位的装备，可以直接新增。</p>') + '</div>',
    footer: '<button class="btn" data-act="cancel">取消</button>' +
      (current || (index === 0 && character.pendingEquipmentSlots.includes(slot))
        ? '<button class="btn" data-act="unequip">' + (current ? '卸下本套装备' : '暂不配置') + '</button>' : '') +
      '<button class="btn btn-gold" data-act="new">＋ 新增并装备</button>',
  });
  overlay.querySelector('[data-act="cancel"]').onclick = UI.closeModal;
  overlay.querySelector('[data-act="new"]').onclick = () => Views.eqModal(null, { characterId, index, slot });
  overlay.querySelectorAll('[data-pick]').forEach((button) => {
    button.onclick = () => Views.eqCommit(() => D.assignEquipment(characterId, index, slot, button.dataset.pick), '已更新装备搭配');
  });
  const unequip = overlay.querySelector('[data-act="unequip"]');
  if (unequip) unequip.onclick = () => Views.eqCommit(() => D.assignEquipment(characterId, index, slot, ''), '已卸下，装备档案保留');
};

Views.eqRenameModal = function (characterId) {
  const character = D.equipmentProfile(characterId);
  UI.formModal({
    title: '装备方案改名',
    values: Object.fromEntries(character.equipmentSets.map((set, index) => ['set' + index, set.name])),
    fields: D.equipmentSetNames.map((name, index) => ({ key: 'set' + index, label: name, type: 'text', required: true, full: true })),
    validate: (data) => Object.values(data).some((name) => name.length > 20) ? '方案名称最多 20 个字' : '',
    onSubmit: async (data) => {
      await D.commitEquipment(() => {
        D.equipmentProfile(characterId).equipmentSets.forEach((set, index) => { set.name = data['set' + index]; });
      });
      Views.equipment(); UI.toast('方案名称已保存');
    },
  });
};

Views.eqCopyModal = function (characterId, from) {
  const character = D.equipmentProfile(characterId);
  UI.formModal({
    title: '复制「' + character.equipmentSets[from].name + '」',
    fields: [{ key: 'target', label: '复制到', type: 'select', full: true,
      options: character.equipmentSets.flatMap((set, index) => index === from ? [] : [{ v: String(index), t: set.name }]),
      hint: '覆盖目标方案的搭配，保留目标名称；全部装备档案和账本收支不变。' }],
    onSubmit: async (data) => {
      await D.commitEquipment(() => D.copyEquipmentSet(characterId, from, Number(data.target)));
      Views.equipment(); UI.toast('装备搭配已复制');
    },
  });
};

Views.soulJadeModal = function (characterId) {
  const character = D.equipmentProfile(characterId);
  UI.formModal({
    title: '命魂之玉 · ' + character.name,
    values: character.soulJade,
    fields: [
      { key: 'unlocked', label: '已解锁命魂之玉', type: 'check', hint: '三套共用。取消解锁将卸下三套中的玉魄，档案保留。' },
      { key: 'attribute', label: '基础属性', type: 'select', options: D.soulAttributes },
      { key: 'level', label: '修炼等级', type: 'number', min: 0, hint: '0～15 级，以游戏内实际修炼为准' },
    ],
    onRender: (form, api) => {
      const update = () => { api.show('attribute', api.getVal('unlocked')); api.show('level', api.getVal('unlocked')); };
      form.addEventListener('change', update); update();
    },
    validate: (data) => data.unlocked && (!Number.isInteger(data.level) || data.level > 15)
      ? '修炼等级需为 0～15 的整数' : '',
    onSubmit: async (data) => {
      await D.commitEquipment(() => {
        const profile = D.equipmentProfile(characterId);
        profile.soulJade = { unlocked: data.unlocked, attribute: data.attribute, level: Number(data.level) || 0 };
        if (!data.unlocked) profile.equipmentSets.forEach((set) => D.equipmentGroups.jade.slots.forEach((slot) => { delete set.slots[slot]; }));
      });
      Views.equipment(); UI.toast('命魂之玉已保存');
    },
  });
};

Views.eqWarehouseHtml = function (character) {
  const filter = Views._eqFilter;
  const group = D.equipmentGroups[filter.group];
  const list = D.state.equipment.filter((eq) => eq.characterId === character.id &&
    (!filter.slot || eq.slot === filter.slot) && (!filter.group || (group ? group.slots.includes(eq.slot) : eq.slot === '其他')) &&
    (!filter.status || D.equipmentStatus(eq) === filter.status) && (!filter.kw ||
      [eq.name, eq.attributes, eq.special, eq.gems, eq.note, eq.jade && JSON.stringify(eq.jade)].join(' ').toLowerCase().includes(filter.kw.toLowerCase())))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return '<div class="eq-warehouse-head"><div><h2>装备仓库</h2><p class="eq-muted">' + U.esc(character.name) +
    '的全部装备档案 · 共 ' + list.length + ' 件符合筛选</p></div><span class="eq-muted">穿戴目标：' +
    U.esc(character.equipmentSets[character.viewedEquipmentSet].name) + '</span></div>' +
    '<div class="filter-bar eq-filters"><span data-mount="group"></span><span data-mount="slot"></span><span data-mount="status"></span>' +
    '<input data-f="kw" aria-label="搜索装备" value="' + U.esc(filter.kw) + '" placeholder="搜索名称 / 属性 / 特技">' +
    '<button class="btn" data-act="search">搜索</button><button class="btn" data-act="reset">重置</button></div>' +
    (list.length ? '<div class="tbl-wrap"><table class="tbl eq-table"><thead><tr><th>部位 / 名称</th><th>属性摘要</th>' +
      '<th>状态 / 引用方案</th><th>操作</th></tr></thead><tbody>' + list.map((eq) => {
      const status = D.equipmentStatus(eq);
      const refs = D.equipmentReferences(eq.id);
      return '<tr data-id="' + U.esc(eq.id) + '"><td><span class="cell-sub">' + U.esc(eq.slot) + '</span>' +
        '<button class="eq-name" data-act="detail" data-eq-hover="' + U.esc(eq.id) + '">' + U.esc(eq.name) + '</button>' +
        (!D.isJade(eq.slot) && eq.level ? '<span class="cell-sub">' + U.esc(eq.level) + ' 级</span>' : '') + '</td><td>' +
        '<div class="eq-table-attribute">' + U.esc((eq.jade ? eq.jade.base : eq.attributes || '').split('\n')[0] || '—') + '</div>' +
        '<div class="cell-sub ' + (eq.special ? 'eq-table-special' : 'eq-table-upgrade') + '">' +
        U.esc(eq.special || (eq.jade ? '灵尘 ' + eq.jade.dustLevel + ' 级' : eq.gems || '')) + '</div></td><td>' +
        '<span class="badge ' + (status === 'active' ? 'in' : status === 'sold' ? 'out' : '') + '">' + D.equipmentStatuses[status] + '</span>' +
        '<div class="cell-sub">' + U.esc(refs.map((ref) => ref.name).join(' / ') || '—') + '</div></td><td class="eq-table-actions">' +
        (eq.status !== 'sold' && eq.slot !== '其他' ? '<button class="btn btn-sm" data-act="equip">配置</button>' : '') +
        '<button class="btn btn-sm" data-act="log">记变动</button><button class="btn btn-sm" data-act="edit">编辑</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del">删除</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="empty"><div class="ic">' + UI.icon('archive', 30) +
      '</div><p>没有符合筛选条件的装备，可调整筛选或新增装备。</p></div>');
};

Views.eqBindWarehouse = function (root, character) {
  const filter = Views._eqFilter;
  const selects = {
    group: [{ v: '', t: '全部类型' }, ...Object.entries(D.equipmentGroups).map(([v, group]) => ({ v, t: group.name })), { v: 'other', t: '其他' }],
    slot: [{ v: '', t: '全部部位' }, ...D.slots.map((slot) => ({ v: slot, t: slot }))],
    status: [{ v: '', t: '全部状态' }, ...Object.entries(D.equipmentStatuses).map(([v, t]) => ({ v, t }))],
  };
  Object.entries(selects).forEach(([key, options]) => UI.select(root.querySelector('[data-mount="' + key + '"]'), {
    options, value: filter[key], onChange: (value) => { filter[key] = value; Views.equipment(); },
  }));
  const search = () => { filter.kw = root.querySelector('[data-f="kw"]').value.trim(); Views.equipment(); };
  root.querySelector('[data-f="kw"]').onkeydown = (event) => { if (event.key === 'Enter') search(); };
  root.querySelector('[data-act="search"]').onclick = search;
  root.querySelector('[data-act="reset"]').onclick = () => { Views._eqFilter = { group: '', slot: '', status: '', kw: '' }; Views.equipment(); };
  root.querySelectorAll('tr[data-id]').forEach((row) => {
    const eq = D.state.equipment.find((item) => item.id === row.dataset.id);
    row.querySelector('[data-act="detail"]').onclick = () => Views.eqDetailModal(eq);
    row.querySelector('[data-act="edit"]').onclick = () => Views.eqModal(eq);
    row.querySelector('[data-act="log"]').onclick = () => Views.gearLogModal(eq);
    row.querySelector('[data-act="del"]').onclick = () => Views.eqDelete(eq);
    const equip = row.querySelector('[data-act="equip"]');
    if (equip) equip.onclick = () => Views.eqPickModal(character.id, character.viewedEquipmentSet, eq.slot);
  });
};

Views.eqModal = function (eq, context) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  context = context || {};
  const id = eq && eq.id;
  const jade = eq && eq.jade || {};
  const references = id ? D.equipmentReferences(id) : [];
  const values = Object.assign({ characterId: context.characterId || Views._eq.characterId || D.state.characters[0].id,
    slot: context.slot || '武器', status: 'stored', equipNow: !!context.slot }, eq || {}, {
    jadeBase: jade.base || '', jadeExtra1: jade.extra1 || '', jadeExtra2: jade.extra2 || '',
    dustLevel: jade.dustLevel || 0, holes: String(jade.holes || 1), durability: jade.durability == null ? '' : jade.durability,
    hole1: jade.enchantments && jade.enchantments[0] || '', hole2: jade.enchantments && jade.enchantments[1] || '',
    hole3: jade.enchantments && jade.enchantments[2] || '', status: eq && eq.status === 'sold' ? 'sold' : 'stored',
  });
  UI.formModal({
    title: id ? '编辑装备档案' : '新增装备档案', values,
    fields: [
      { key: 'characterId', label: '角色', type: 'select', options: D.state.characters.map((character) => ({ v: character.id, t: character.name })) },
      { key: 'slot', label: '部位', type: 'select', options: D.slots },
      { key: 'name', label: '装备名称', type: 'text', required: true, placeholder: '填写游戏中的装备名称' },
      { key: 'level', label: '装备等级', type: 'number', min: 0 },
      { key: 'attributes', label: '装备属性', type: 'textarea', full: true, placeholder: '每行一条，如：伤害 +620' },
      { key: 'jadeBase', label: '玉魄基础属性', type: 'text', required: true, full: true, placeholder: '如：伤害 +15' },
      { key: 'jadeExtra1', label: '附加属性一', type: 'text', required: true, placeholder: '按游戏中显示数值填写' },
      { key: 'jadeExtra2', label: '附加属性二', type: 'text', required: true },
      { key: 'special', label: '特技 / 特效', type: 'text', full: true },
      { key: 'gems', label: '宝石', type: 'text', full: true, placeholder: '如：太阳石 ×4' },
      { key: 'dustLevel', label: '灵尘总等级', type: 'number', min: 0, hint: '含同属性自带加成，按游戏显示录入' },
      { key: 'holes', label: '已解锁开光孔', type: 'select', options: ['1', '2', '3'] },
      { key: 'hole1', label: '孔一 · 灵契 / 祝符', type: 'text', hint: '阳玉填写女娲灵契，阴玉填写女娲祝符；留空表示未强化' },
      { key: 'hole2', label: '孔二 · 灵契 / 祝符', type: 'text' },
      { key: 'hole3', label: '孔三 · 灵契 / 祝符', type: 'text' },
      { key: 'durability', label: '当前耐久（可选）', type: 'number', min: 0, hint: '0～300' },
      { key: 'status', label: '持有状态', type: 'segment', options: [{ v: 'stored', t: '持有' }, { v: 'sold', t: '已出售' }] },
      { key: 'equipNow', label: '保存后放入正在查看的方案', type: 'check', hint: '替换该部位的装备；原装备档案和其他方案保留' },
      { key: 'note', label: '备注', type: 'textarea', full: true },
    ],
    onRender: (form, api) => {
      if (references.length) form.insertAdjacentHTML('afterbegin', '<p class="eq-notice eq-form-notice">引用方案：' +
        U.esc(references.map((ref) => ref.name).join('、')) + '。改角色、改部位或设为出售会清空这些方案的对应格子。</p>');
      const update = () => {
        const isJade = D.isJade(api.getVal('slot'));
        ['level', 'attributes', 'gems'].forEach((key) => api.show(key, !isJade));
        ['jadeBase', 'jadeExtra1', 'jadeExtra2', 'dustLevel', 'holes', 'durability'].forEach((key) => api.show(key, isJade));
        ['hole1', 'hole2', 'hole3'].forEach((key, index) => api.show(key, isJade && index < Number(api.getVal('holes'))));
        api.show('equipNow', !id && api.getVal('status') !== 'sold' && api.getVal('slot') !== '其他');
        form.querySelector('[data-field="special"] label').textContent = isJade ? '玉魄特效' : '特技 / 特效';
      };
      form.addEventListener('change', update); form.addEventListener('segchange', update); update();
    },
    onSubmit: async (data) => {
      const record = { characterId: data.characterId, slot: data.slot, name: data.name, level: data.level,
        attributes: data.attributes, special: data.special, gems: data.gems, status: data.status, note: data.note };
      if (D.isJade(data.slot)) record.jade = {
        base: data.jadeBase, extra1: data.jadeExtra1, extra2: data.jadeExtra2, dustLevel: data.dustLevel,
        holes: Number(data.holes), durability: data.durability,
        enchantments: [data.hole1, data.hole2, data.hole3].slice(0, Number(data.holes)),
      };
      await D.commitEquipment(() => {
        const saved = D.saveEquipment(record, id);
        if (!id && data.equipNow && data.status !== 'sold' && data.slot !== '其他') {
          const index = data.characterId === context.characterId && context.index != null ? context.index
            : D.equipmentProfile(data.characterId).viewedEquipmentSet;
          D.assignEquipment(data.characterId, index, data.slot, saved.id);
        }
      });
      Views._eq.characterId = data.characterId;
      Views.equipment(); UI.toast(id ? '装备档案已保存' : '装备已登记');
    },
  });
};

Views.eqDelete = async function (eq) {
  const references = D.equipmentReferences(eq.id);
  const ok = await UI.confirmModal({ title: '删除装备', danger: true, confirmText: '删除',
    message: '确定删除「' + eq.name + '」吗？' + (references.length ? '将清空「' + references.map((ref) => ref.name).join('、') +
      '」中的对应格子。' : '') + '装备变动记录一并删除，账号账本收支保留并解除关联。' });
  if (ok) await Views.eqCommit(() => D.removeEquipment(eq.id), '装备档案已删除');
};

Views.gearLogModal = function (equipment) {
  const id = equipment.id;
  const references = D.equipmentReferences(id);
  const actions = D.gearActions.filter((action) => D.isJade(equipment.slot)
    ? !['craft', 'gem'].includes(action.v) : !['dust', 'consecrate'].includes(action.v));
  UI.formModal({
    title: '装备变动 · ' + equipment.name,
    values: { date: U.today(), action: 'buy', currency: 'cash', channel: '游戏内', amount: '', sync: true },
    fields: [
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'action', label: '动作', type: 'select', options: actions.map((action) => ({ v: action.v, t: action.t })) },
      { key: 'currency', label: '币种', type: 'segment', options: [{ v: 'cash', t: '梦幻币 · 万' }, { v: 'rmb', t: '人民币 · 元' }] },
      { key: 'channel', label: '渠道', type: 'select', options: D.channels },
      { key: 'amount', label: '成交金额', type: 'number', step: '0.01', min: 0 },
      { key: 'sync', label: '同时记入账号账本', type: 'check', default: true, hint: '购入、售出和强化开支可同步' },
      { key: 'note', label: '备注', type: 'text', full: true },
    ],
    onRender: (form, api) => {
      form.insertAdjacentHTML('afterbegin', '<p class="eq-notice eq-form-notice" data-sale-warning hidden>售出将清空「' +
        U.esc(references.map((ref) => ref.name).join('、')) + '」中的对应格子；撤销交易后，可重新选择穿戴。</p>');
      const update = () => {
        api.show('sync', D.gearAction(api.getVal('action')).dir !== 0);
        form.querySelector('[data-sale-warning]').hidden = api.getVal('action') !== 'sell' || !references.length;
        form.querySelector('[data-field="amount"] label').textContent = '成交金额（' + (api.getVal('currency') === 'rmb' ? '元' : '万梦幻币') + '）';
      };
      form.addEventListener('change', update); form.addEventListener('segchange', update); update();
    },
    onSubmit: async (data) => {
      await D.commitEquipment(() => {
        const eq = D.state.equipment.find((item) => item.id === id);
        if (!eq) throw new Error('装备档案已删除');
        const action = D.gearAction(data.action);
        if (data.sync && action.dir !== 0) {
          const tx = { id: U.uid(), ledger: 'account', recordType: 'money', characterId: eq.characterId,
            date: data.date, kind: action.dir > 0 ? 'income' : 'expense', currency: data.currency,
            category: ['craft', 'gem', 'dust', 'consecrate'].includes(data.action) ? '养成投入' : '装备交易',
            amount: data.amount || 0, fee: 0, minutes: 0, channel: data.channel, equipmentId: id, gearAction: data.action,
            note: data.note || '装备「' + eq.name + '」' + action.t, createdAt: Date.now() };
          D.state.transactions.push(tx); D.syncAccountEquipment(tx);
        } else {
          D.state.gearLogs.push({ id: U.uid(), equipmentId: id, characterId: eq.characterId, date: data.date,
            action: data.action, amount: data.amount || 0, currency: data.currency, note: data.note || '', synced: false, createdAt: Date.now() });
          D.syncEquipmentStatus(id);
        }
      });
      Views.equipment(); UI.toast('变动已记录');
    },
  });
};

Views.eqDetailModal = function (eq, context) {
  if (!eq) return;
  const character = D.equipmentProfile(eq.characterId);
  const index = context ? context.index : character.viewedEquipmentSet;
  const equipped = character.equipmentSets[index].slots[eq.slot] === eq.id;
  const logs = D.gearLogsOf(eq.id);
  const references = D.equipmentReferences(eq.id);
  const overlay = UI.openModal({
    title: eq.slot + ' · ' + eq.name, wide: true,
    body: '<div class="backup-grid eq-detail"><section>' + Views.eqPropertiesHtml(eq) +
      '<p class="eq-caption">' + U.esc(D.charName(eq.characterId)) + ' · ' + D.equipmentStatuses[D.equipmentStatus(eq)] + '</p>' +
      '<p class="eq-muted">引用方案：' + U.esc(references.map((ref) => ref.name).join(' / ') || '未配置') + '</p></section>' +
      '<section><h3>装备时间线</h3>' + (logs.length ? '<div class="timeline">' + logs.map((log) => {
        const action = D.gearAction(log.action);
        return '<div class="tl-item"><div class="tl-head"><span class="badge ' + (action.dir > 0 ? 'in' : action.dir < 0 ? 'out' : '') + '">' +
          U.esc(action.t) + '</span><span>' + (log.amount ? U.fmtAmount(log.amount, log.currency) : '') + '</span></div>' +
          '<div class="tl-date">' + U.esc(log.date) + '</div>' + (log.note ? '<div class="tl-note">' + U.esc(log.note) + '</div>' : '') + '</div>';
      }).join('') + '</div>' : '<p class="eq-muted">暂无变动记录</p>') + '</section></div>',
    footer: '<button class="btn btn-danger" data-act="del">删除</button><button class="btn" data-act="edit">编辑</button>' +
      '<button class="btn" data-act="log">记变动</button>' + (eq.status !== 'sold' && eq.slot !== '其他'
        ? '<button class="btn btn-gold" data-act="wear">' + (equipped ? '换装 / 卸下' : '配置到「' + U.esc(character.equipmentSets[index].name) + '」') + '</button>' : ''),
  });
  overlay.querySelector('[data-act="edit"]').onclick = () => Views.eqModal(eq);
  overlay.querySelector('[data-act="log"]').onclick = () => Views.gearLogModal(eq);
  overlay.querySelector('[data-act="del"]').onclick = () => Views.eqDelete(eq);
  const wear = overlay.querySelector('[data-act="wear"]');
  if (wear) wear.onclick = () => equipped ? Views.eqPickModal(eq.characterId, index, eq.slot)
    : Views.eqCommit(() => D.assignEquipment(eq.characterId, index, eq.slot, eq.id), '已更新装备搭配');
};
