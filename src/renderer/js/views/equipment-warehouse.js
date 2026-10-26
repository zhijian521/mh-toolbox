'use strict';
/* 角色装备仓库与筛选。 */
Views.eqWarehouseHtml = function (character) {
  const filter = Views._eqFilter;
  const group = D.equipmentGroups[filter.group];
  const references = D.equipmentReferenceIndex(character.id);
  const list = D.state.equipment.filter((eq) => eq.characterId === character.id &&
    (!filter.slot || eq.slot === filter.slot) && (!filter.group || (group ? group.slots.includes(eq.slot) : eq.slot === '其他')) &&
    (!filter.status || D.equipmentStatus(eq, references.get(eq.id) || []) === filter.status) && (!filter.kw ||
      D.equipmentSearchText(eq).toLowerCase().includes(filter.kw.toLowerCase())))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return '<div class="eq-warehouse-head"><div><h2>装备仓库</h2><p class="eq-muted">' + U.esc(character.name) +
    '的全部装备档案 · 共 ' + list.length + ' 件符合筛选</p></div><span class="eq-muted">穿戴目标：' +
    U.esc(character.equipmentSets[character.viewedEquipmentSet].name) + '</span></div>' +
    '<div class="filter-bar eq-filters"><span data-mount="group"></span><span data-mount="slot"></span><span data-mount="status"></span>' +
    '<input data-f="kw" aria-label="搜索装备" value="' + U.esc(filter.kw) + '" placeholder="搜索名称 / 属性 / 特技">' +
    '<button class="btn" data-act="search">搜索</button><button class="btn" data-act="reset">重置</button></div>' +
    (list.length ? '<div class="tbl-wrap"><table class="tbl eq-table"><thead><tr><th>部位 / 名称</th><th>属性摘要</th>' +
      '<th>状态 / 引用方案</th><th>操作</th></tr></thead><tbody>' + list.map((eq) => {
      const status = D.equipmentStatus(eq, references.get(eq.id) || []);
      const refs = references.get(eq.id) || [];
      return '<tr data-id="' + U.esc(eq.id) + '"><td><span class="cell-sub">' + U.esc(eq.slot) + '</span>' +
        '<button class="eq-name" data-act="detail" data-eq-hover="' + U.esc(eq.id) + '">' + U.esc(eq.name) + '</button>' +
        (!D.isJade(eq.slot) && eq.level ? '<span class="cell-sub">' + U.esc(eq.level) + ' 级</span>' : '') + '</td><td>' +
        Views.eqSlotPropertiesHtml(eq) + '</td><td>' +
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
    const eq = D.equipmentById(row.dataset.id);
    row.querySelector('[data-act="detail"]').onclick = () => Views.eqDetailModal(eq);
    row.querySelector('[data-act="edit"]').onclick = () => Views.eqModal(eq);
    row.querySelector('[data-act="log"]').onclick = () => Views.gearLogModal(eq);
    row.querySelector('[data-act="del"]').onclick = () => Views.eqDelete(eq);
    const equip = row.querySelector('[data-act="equip"]');
    if (equip) equip.onclick = () => Views.eqPickModal(character.id, character.viewedEquipmentSet, eq.slot);
  });
};
