'use strict';
/* 手动与截图录入共用编辑器；各部位保留独立 DOM 草稿，包括未完成的数字输入。 */
UI.equipmentEditor = function (mount, opts) {
  const panels = new Map(), originalSlot = opts.slot;
  let slot;
  const blank = [{ v: '', t: '未选择' }];
  const options = (keys) => blank.concat(keys.map((key) => ({ v: key, t: D.equipmentStats[key] || key })));
  const changed = () => { if (opts.onChange) opts.onChange(api.read(), api.error()); };
  function field(root, key, label, type, value, extra = {}) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = UI.fieldHtml({ key, label, type, ...extra }, value);
    const row = wrapper.firstElementChild;
    root.appendChild(row);
    const input = row.querySelector('input:not([type="hidden"])');
    if (input && type === 'number') { input.step = extra.step || '1'; input.max = extra.max ?? Number.MAX_SAFE_INTEGER; }
    if (type === 'select') UI.select(row.querySelector('[data-xmount]'), { name: key, label, value: value ?? '', options: extra.options, searchable: !!extra.searchable });
    return row;
  }
  function section(panel, title, group, help) {
    const root = document.createElement('section'); root.className = 'eq-editor-section'; root.dataset.eqGroup = group;
    root.innerHTML = '<div class="eq-editor-heading"><h4>' + U.esc(title) + '</h4></div>' +
      (help ? '<p class="eq-editor-hint">' + U.esc(help) + '</p>' : '') + '<div class="eq-editor-fields"></div>';
    panel.appendChild(root); return root;
  }
  function list(panel, title, group, rows, pool, max, boost, signed) {
    const root = section(panel, title, group), content = root.querySelector('.eq-editor-fields');
    content.classList.add('eq-editor-rows');
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn btn-sm';
    add.textContent = '＋ 添加'; add.dataset.eqAdd = group; root.firstElementChild.appendChild(add);
    let sequence = 0;
    function append(value = { key: '', value: null, boost: null }) {
      const row = document.createElement('div'); row.className = 'eq-editor-stat'; row.dataset.eqRow = group;
      const prefix = 'eq-' + group + '-' + sequence++;
      field(row, prefix + '-key', '属性', 'select', value.key, { options: options(pool), searchable: true }).dataset.part = 'key';
      field(row, prefix + '-value', '数值', 'number', value.value, { min: signed ? -Number.MAX_SAFE_INTEGER : 0, placeholder: '未记录' }).dataset.part = 'value';
      if (boost) field(row, prefix + '-boost', '强化加成', 'number', value.boost, { min: 0, placeholder: '可不填' }).dataset.part = 'boost';
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-sm eq-editor-remove';
      remove.innerHTML = UI.icon('trash', 14); remove.setAttribute('aria-label', '移除' + title + '词条'); row.appendChild(remove);
      remove.onclick = () => { row.remove(); add.disabled = content.children.length >= max; changed(); add.focus(); };
      content.appendChild(row); add.disabled = content.children.length >= max;
      return row;
    }
    rows.forEach(append);
    add.onclick = () => { const row = append(); changed(); row.querySelector('button').focus(); };
  }
  function build(next, detail) {
    const rule = D.equipmentRule(next), panel = document.createElement('div');
    panel.className = 'eq-editor'; panel.dataset.eqEditor = next;
    const base = section(panel, rule.kind === 'jade' ? '基础属性' : '主要属性', 'base', '按游戏显示值填写；留空表示未记录。');
    const baseRoot = base.querySelector('.eq-editor-fields');
    if (rule.kind === 'gear') {
      rule.base.forEach((key) => field(baseRoot, 'eq-base-' + key, D.equipmentStats[key], 'number',
        detail.base.find((row) => row.key === key)?.value, { min: 0, placeholder: '未记录' }));
    } else if (['accessory', 'jade'].includes(rule.kind)) {
      field(baseRoot, 'eq-base-key', '属性', 'select', detail.base[0]?.key, { options: options(rule.base), searchable: true });
      field(baseRoot, 'eq-base-value', '数值', 'number', detail.base[0]?.value, { min: 0, placeholder: '未记录' });
      if (rule.kind === 'accessory') field(baseRoot, 'eq-base-boost', '强化加成（可选）', 'number', detail.base[0]?.boost, { min: 0 });
    } else base.remove();
    if (rule.extra.length) list(panel, '附加属性', 'extra', detail.extra, rule.extra,
      rule.kind === 'accessory' ? 3 : 2, ['accessory', 'jade'].includes(rule.kind), rule.kind === 'gear');
    if (rule.kind === 'gear') {
      list(panel, '宝石增加的属性', 'bonus', detail.bonus, rule.bonus, rule.bonus.length, false, false);
    }
    if (['gear', 'accessory'].includes(rule.kind)) {
      const special = section(panel, rule.kind === 'gear' ? '特技与特效' : '灵饰特效', 'special').querySelector('.eq-editor-fields');
      if (rule.kind === 'gear') field(special, 'eq-technique', '特技', 'select', detail.technique, { options: blank.concat(D.equipmentTechniques), searchable: true });
      const checks = document.createElement('div'); checks.className = 'eq-editor-effects';
      checks.innerHTML = '<span class="eq-editor-label">特效（可多选）</span>' + rule.effects.map((effect) =>
        '<label><input type="checkbox" name="eq-effect" value="' + U.esc(effect) + '"' +
        (detail.effects.includes(effect) ? ' checked' : '') + '> ' + U.esc(effect) + '</label>').join('');
      special.appendChild(checks);
    }
    if (['gear', 'accessory'].includes(rule.kind)) {
      const upgrade = section(panel, rule.kind === 'accessory' ? '精炼与钟灵石' : '宝石镶嵌', 'upgrade').querySelector('.eq-editor-fields');
      field(upgrade, 'eq-forge', rule.kind === 'accessory' ? '精炼等级' : '锻炼等级', 'number', detail.forge, { min: 0, max: 30 });
      if (rule.kind === 'accessory') {
        field(upgrade, 'eq-clock', '钟灵石效果', 'select', detail.clock.name, { options: blank.concat(D.equipmentClockEffects), searchable: true });
        field(upgrade, 'eq-clock-level', '钟灵石等级', 'number', detail.clock.level, { min: 1, max: 8 });
      } else {
        const gems = document.createElement('div'); gems.className = 'eq-editor-gems'; upgrade.appendChild(gems);
        rule.gems.forEach((type, i) => {
          const value = detail.gems.find((gem) => gem.type === type);
          const row = document.createElement('div'); row.className = 'eq-editor-gem'; row.dataset.gemType = type;
          row.innerHTML = '<label><input type="checkbox" name="eq-gem-' + i + '"' + (value ? ' checked' : '') + '> ' + U.esc(type) + '</label>';
          field(row, 'eq-gem-level-' + i, '已知等级（可选）', 'number', value?.level, { min: 0, max: 30, placeholder: '不确定可留空' });
          const check = row.querySelector('input[type="checkbox"]'), input = row.querySelector('input[type="number"]');
          input.disabled = !check.checked;
          check.addEventListener('change', () => { input.disabled = !check.checked; });
          gems.appendChild(row);
        });
      }
    }
    if (rule.kind === 'jade') {
      const jade = section(panel, '灵尘与奇袭', 'jade').querySelector('.eq-editor-fields');
      field(jade, 'eq-dust', '灵尘总等级', 'number', detail.jade.dust, { min: 0, max: 17 });
      field(jade, 'eq-assault', '奇袭类型', 'select', detail.jade.assault,
        { options: blank.concat(['奇袭法术', '奇袭特技', '奇袭道具']) });
      field(jade, 'eq-chance', '奇袭概率（%）', 'number', detail.jade.chance, { min: 0, max: 100, step: '0.01' });
      field(jade, 'eq-holes', '已解锁开光孔', 'select', String(detail.jade.holes),
        { options: [0, 1, 2, 3].map((n) => ({ v: String(n), t: n ? n + ' 个' : '未开光 / 未记录' })) });
      for (let i = 0; i < 3; i++) field(jade, 'eq-hole-' + i, '孔 ' + (i + 1) + ' · ' + (next === '玉魄·阳' ? '灵契' : '祝符'), 'text', detail.jade.enchantments[i] || '', { placeholder: '留空表示未强化' });
      const updateHoles = () => jade.querySelectorAll('[data-field^="eq-hole-"]').forEach((row, i) => {
        row.hidden = i >= Number(jade.querySelector('[name="eq-holes"]').value);
      });
      jade.addEventListener('change', updateHoles); updateHoles();
    }
    const more = document.createElement('details'); more.className = 'eq-editor-more';
    more.innerHTML = '<summary>其他信息</summary>'; panel.appendChild(more);
    const meta = section(more, '档案补充', 'metadata').querySelector('.eq-editor-fields');
    if (rule.kind === 'gear') {
      field(meta, 'eq-element', '五行', 'select', detail.element, { options: blank.concat(['金', '木', '水', '火', '土']) });
      list(more, '熔炼加成', 'melt', detail.melt, [...rule.base, ...rule.extra], rule.base.length + rule.extra.length, false, true);
    }
    field(meta, 'eq-durability', '耐久', 'number', detail.durability, { min: 0, max: rule.kind === 'jade' ? 300 : Number.MAX_SAFE_INTEGER });
    field(meta, 'eq-repair', '修理失败次数', 'number', detail.repair, { min: 0, max: 3 });
    field(meta, 'eq-suit', '套装效果（选填）', 'textarea', detail.suit, { full: true });
    field(meta, 'eq-runes', '符石 / 星位（选填）', 'text', detail.runes);
    field(meta, 'eq-maker', '制造者（选填）', 'text', detail.maker);
    if (detail.legacy || rule.kind === 'other') {
      const legacy = section(panel, rule.kind === 'other' ? '其他属性' : '原有属性 · 待核对', 'legacy',
        rule.kind === 'other' ? '' : '无法明确拆分的原文已保留，可核对后修改或清除。');
      field(legacy.querySelector('.eq-editor-fields'), 'eq-legacy', '原有内容', 'textarea', detail.legacy, { full: true });
    }
    panel.addEventListener('input', changed); panel.addEventListener('change', changed);
    return panel;
  }
  const value = (key) => mount.querySelector('[name="eq-' + key + '"]')?.value ?? '';
  const number = (key) => value(key) === '' ? null : Number(value(key));
  const api = {
    setSlot(next) {
      if (slot === next) return;
      UI.closePop();
      if (!panels.has(next)) panels.set(next, build(next, next === originalSlot ? D.equipmentDetails(opts.equipment || { slot: next }) : D.emptyEquipmentDetails()));
      slot = next; mount.replaceChildren(panels.get(next));
    },
    read() {
      const detail = D.emptyEquipmentDetails(), rule = D.equipmentRule(slot);
      if (rule.kind === 'gear') {
        detail.base = rule.base.filter((key) => number('base-' + key) !== null).map((key) => ({ key, value: number('base-' + key), boost: null }));
      } else if (value('base-key') || number('base-value') !== null || number('base-boost') !== null) {
        detail.base = [{ key: value('base-key'), value: number('base-value'), boost: number('base-boost') }];
      }
      for (const group of ['extra', 'bonus', 'melt']) detail[group] = [...mount.querySelectorAll('[data-eq-row="' + group + '"]')].map((row) => {
        const key = row.querySelector('[data-part="key"] input').value;
        const num = (part) => { const input = row.querySelector('[data-part="' + part + '"] input'); return !input || input.value === '' ? null : Number(input.value); };
        return { key, value: num('value'), boost: num('boost') };
      }).filter((row) => row.key || row.value !== null || row.boost !== null);
      detail.technique = value('technique'); detail.effects = [...mount.querySelectorAll('[name="eq-effect"]:checked')].map((input) => input.value);
      detail.forge = number('forge');
      detail.gems = [...mount.querySelectorAll('[data-gem-type]')].filter((row) => row.querySelector('input[type="checkbox"]').checked)
        .map((row) => ({ type: row.dataset.gemType, level: row.querySelector('input[type="number"]').value === '' ? null : Number(row.querySelector('input[type="number"]').value) }));
      detail.clock = { name: value('clock'), level: number('clock-level') };
      for (const key of ['element', 'suit', 'maker', 'runes', 'legacy']) detail[key] = value(key).trim();
      detail.durability = number('durability'); detail.repair = number('repair');
      detail.jade = { dust: number('dust'), assault: value('assault'), chance: number('chance'), holes: Number(value('holes') || 0),
        enchantments: Array.from({ length: Number(value('holes') || 0) }, (_, i) => value('hole-' + i).trim()) };
      return detail;
    },
    error() {
      if ([...mount.querySelectorAll('input[type="number"]')].some((input) => !input.disabled && !input.closest('[hidden]') && !input.validity.valid)) return '请检查属性数值';
      try { D.validateEquipmentDetails(slot, '', api.read()); return ''; } catch (error) { return error.message; }
    },
    snapshot() {
      return JSON.stringify([...panels].map(([key, panel]) => [key, [...panel.querySelectorAll('input,textarea')].map((input) =>
        [input.name, input.type === 'checkbox' ? input.checked : input.value, input.validity.badInput])]));
    },
  };
  api.setSlot(opts.slot);
  return api;
};
