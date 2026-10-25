'use strict';
/* 装备选择、方案与档案弹窗。 */
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
      '<button class="btn" data-act="screenshot">截图录入</button>' +
      '<button class="btn btn-gold" data-act="new">＋ 新增并装备</button>',
  });
  overlay.querySelector('[data-act="cancel"]').onclick = UI.requestCloseModal;
  overlay.querySelector('[data-act="new"]').onclick = () => Views.eqModal(null, { characterId, index, slot });
  overlay.querySelector('[data-act="screenshot"]').onclick = () => Views.eqImportModal({ characterId, index, slot });
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
      await D.recordEquipmentChange(id, data);
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
      '<p class="eq-muted">引用方案：' + U.esc(references.map((ref) => ref.name).join(' / ') || '未配置') + '</p>' +
      (eq.ocrText ? '<details class="eq-ocr-text"><summary>识别原文</summary><pre>' + U.esc(eq.ocrText) + '</pre></details>' : '') + '</section>' +
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
