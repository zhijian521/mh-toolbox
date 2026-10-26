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
    card.querySelector('[data-act="pin"]').onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await D.saveCharacterOrder(character.id, { pinned: !character.pinned });
        Views.charRefresh(character.id, 'pin');
      } catch (error) { UI.toast(error.message || '置顶失败，请重试', 'err'); }
      finally { button.disabled = false; }
    };
    card.querySelector('[data-act="sort"]').onclick = () => Views.charOrderModal(character);
    card.querySelector('[data-act="history"]').onclick = () => Views.charHistoryModal(character.id);
    card.querySelector('[data-act="copy"]').onclick = () => Views.charCopyProgressModal(character);
    card.querySelector('[data-act="del"]').onclick = () => Views.charDelete(character);
    card.querySelectorAll('[data-act="quick-edit"]').forEach((button) => {
      button.onclick = () => Views.charQuickModal(character.id, button.dataset.category, button.dataset.key);
    });
  });
  root.scrollTop = scrollTop;
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
    (action === 'del' ? ' btn-danger' : '') + '" data-act="' + action + '" title="' + label + '" aria-label="' + label + '"' + extra + '>' + UI.icon(icon, 15) + '</button>';
  const value = (label, number, unit, category, key = '') => '<div class="char-value"><dt>' + U.esc(label) + '</dt><dd' +
    (number == null ? ' class="is-empty"' : '') + '><button type="button" class="char-value-edit" data-act="quick-edit" data-category="' + category +
    '" data-key="' + U.esc(key) + '" title="点击修改' + U.esc(label) + '" aria-haspopup="dialog" aria-label="修改' + U.esc(label) +
    '，当前' + (number == null ? '未记录' : U.esc(number) + unit) + '">' + (number == null ? '—' : U.esc(number) +
    (unit ? '<small>' + unit + '</small>' : '')) + '</button></dd></div>';
  const skills = (list, category) => list.length ? '<dl class="char-skills">' + list.map((skill) => value(skill.name, skill.level, '级', category, skill.name)).join('') +
    '</dl>' : '<p class="char-unrecorded">未记录</p>';
  const training = (title, fields, values, category) => '<section><h4>' + title + '</h4><dl class="char-training-values">' +
    fields.map((field) => value(field.label, values[field.key], '', category, field.key)).join('') + '</dl></section>';
  return '<article class="char-card" data-id="' + U.esc(character.id) + '" aria-label="' + U.esc(character.name) + '的角色档案">' +
    '<header class="char-top"><div class="char-identity">' + UI.icon('hero', 40) + '<div><h2 class="char-name">' + U.esc(character.name) +
    '</h2><p class="char-sub">' + U.esc([character.level ? character.level + ' 级' : '', character.school, character.server].filter(Boolean).join(' · ')) +
    '</p></div></div><div class="char-toolbar">' +
      iconButton('pin', 'pin', character.pinned ? '取消置顶' : '置顶角色', ' aria-pressed="' + (character.pinned === true) + '"') +
      iconButton('sort', 'sort', '调整排序') + iconButton('history', 'calendar', '查看养成记录') +
      iconButton('copy', 'copy', '复制养成配置') + iconButton('del', 'trash', '删除角色') +
      iconButton('edit', 'edit', '编辑档案') + '</div></header>' +
    '<section class="char-section">' + heading('师门技能') + skills(progress.schoolSkills, 'schoolSkills') + '</section>' +
    '<section class="char-section">' + heading('修炼') + '<div class="char-training">' +
      training('人物', D.characterTraining, progress.training, 'training') + training('召唤兽', D.petTraining, progress.petTraining, 'petTraining') + '</div></section>' +
    '<section class="char-section">' + heading('辅助技能') + skills(progress.auxiliarySkills, 'auxiliarySkills') + '</section>' +
    '<section class="char-section">' + heading('其他养成') + '<dl class="char-growth">' +
      value('乾元丹', progress.qianyuanPills, '个', 'qianyuanPills') + value('潜能果', progress.potentialFruits, '个', 'potentialFruits') + '</dl>' +
      (progress.note ? '<p class="char-note">' + U.esc(progress.note) + '</p>' : '') + '</section></article>';
};

Views.charQuickModal = function (id, category, key) {
  const character = D.charById(id);
  let metric;
  try { metric = D.characterProgressMetric(character, category, key); }
  catch (error) { UI.toast(error.message, 'err'); return; }
  const training = ['training', 'petTraining'].includes(category);
  const valueHtml = (value) => value == null ? '<span class="char-quick-empty">未记录</span>' :
    '<strong>' + U.esc(value) + '</strong><small>' + metric.unit + '</small>';
  let input;
  UI.formModal({
    title: metric.label,
    values: { value: metric.value, changeDate: U.today(), changeNote: '' },
    fields: [
      { key: 'value', label: '调整数值', type: 'number', min: 0, step: '1', full: true, placeholder: '未记录' },
      { key: 'changeDate', label: '变更日期', type: 'date', full: true },
      { key: 'changeNote', label: '本次说明', type: 'text', full: true, placeholder: '选填' },
    ],
    returnFocus: () => Views.charFocusTarget(id, { category, key }),
    onRender: (form, _api, overlay) => {
      overlay.classList.add('char-modal', 'char-quick-modal');
      overlay.classList.toggle('is-training', training);
      form.classList.add('char-quick-form');
      form.insertAdjacentHTML('afterbegin', '<p class="char-quick-context">' + U.esc(character.name) + ' · ' + metric.group + '</p>' +
        '<p class="char-quick-current">当前：' + valueHtml(metric.value) + '</p>');
      const row = form.querySelector('[data-field="value"]');
      row.classList.add('char-quick-value');
      input = row.querySelector('input');
      input.inputMode = 'numeric'; input.max = Number.MAX_SAFE_INTEGER;
      const stepper = document.createElement('div');
      stepper.className = 'char-quick-stepper';
      stepper.innerHTML = '<button type="button" class="btn" data-step="-1" aria-label="减少 1">−</button>' +
        '<div class="char-quick-input"></div><button type="button" class="btn" data-step="1" aria-label="增加 1">＋</button>';
      stepper.querySelector('.char-quick-input').appendChild(input);
      stepper.querySelector('.char-quick-input').insertAdjacentHTML('beforeend', '<small>' + metric.unit + '</small>');
      row.appendChild(stepper);
      const preview = document.createElement('p');
      preview.className = 'char-quick-preview'; preview.setAttribute('aria-live', 'polite');
      row.after(preview);
      const update = () => {
        const value = D.characterNumber(input.value);
        const valid = input.validity.valid && (input.value === '' || value !== null);
        stepper.querySelector('[data-step="-1"]').disabled = !valid || value == null || value === 0;
        stepper.querySelector('[data-step="1"]').disabled = !valid || value === Number.MAX_SAFE_INTEGER;
        preview.innerHTML = valid ? '修改后：' + valueHtml(metric.value) + '<span class="char-quick-arrow">→</span>' + valueHtml(value) :
          '<span class="char-quick-empty">请填写非负整数或留空</span>';
      };
      stepper.querySelectorAll('[data-step]').forEach((button) => {
        button.onclick = () => {
          input.value = (D.characterNumber(input.value) ?? 0) + Number(button.dataset.step);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
      });
      input.addEventListener('input', update);
      input.addEventListener('change', update);
      const details = document.createElement('details');
      details.className = 'char-quick-details';
      details.innerHTML = '<summary>补充信息</summary><div></div>';
      for (const field of ['changeDate', 'changeNote']) details.lastElementChild.appendChild(form.querySelector('[data-field="' + field + '"]'));
      form.appendChild(details);
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.isComposing && event.target.matches('input:not([type="hidden"])')) {
          event.preventDefault(); form.requestSubmit();
        }
      });
      update(); input.focus(); input.select();
    },
    validate: () => input.reportValidity() && (input.value === '' || D.characterNumber(input.value) !== null) ? '' : '请填写非负整数或留空',
    onSubmit: async (data) => {
      await D.saveCharacterValue(id, category, key, data.value, { date: data.changeDate, note: data.changeNote });
      Views.charRefresh(id, { category, key });
      UI.toast('已保存');
    },
  });
};

Views.charModal = function (character) {
  const progress = D.normalizeCharacterProgress(character && character.progress);
  const number = (key, label) => ({ key, label, type: 'number', min: 0, step: '1', placeholder: '未记录' });
  const sections = [
    { key: 'basic', title: '基础信息', fields: [
      { key: 'name', label: '角色昵称', type: 'text', required: true, placeholder: '如：养老一号' },
      { ...number('level', '等级'), placeholder: '如 69、109' },
      { key: 'school', label: '门派', type: 'select', options: D.schools },
      { key: 'server', label: '服务器', type: 'text', placeholder: '如：紫禁城' },
    ] },
    { key: 'schoolSkills', title: '师门技能', skills: true },
    { key: 'training', title: '人物修炼', fields: D.characterTraining.map((field) => number('training_' + field.key, field.label)) },
    { key: 'petTraining', title: '召唤兽修炼', fields: D.petTraining.map((field) => number('petTraining_' + field.key, field.label)) },
    { key: 'auxiliarySkills', title: '辅助技能', skills: true },
    { key: 'growth', title: '其他养成', fields: [number('qianyuanPills', '乾元丹个数'), number('potentialFruits', '潜能果个数'),
      { key: 'note', label: '养成备注', type: 'textarea', full: true, placeholder: '可记录经脉流派、坐骑成长、机缘等' } ] },
  ];
  const values = Object.assign({}, character || { name: '', level: '', school: '大唐官府', server: '' }, progress);
  if (character) {
    sections.find((section) => section.key === 'growth').fields.push(
      { key: 'changeDate', label: '变更日期', type: 'date', default: U.today(),
        hint: '养成变化自动记入此日，可补选实际提升日期。' },
      { key: 'changeNote', label: '本次变更说明', type: 'text', placeholder: '选填，如：周末补满人物修炼',
        hint: '仅随本次变化保存，昵称、备注和排序等调整不生成记录。' },
    );
  }
  for (const key of ['training', 'petTraining']) {
    for (const [field, value] of Object.entries(progress[key])) values[key + '_' + field] = value;
  }
  let form, schoolChoice, savedId = character && character.id;
  const editors = {};
  UI.formModal({
    title: character ? '编辑角色档案' : '添加角色', wide: true,
    values, fields: sections.flatMap((section) => section.fields || []),
    returnFocus: () => Views.charFocusTarget(savedId),
    onRender: (element, api, overlay) => {
      overlay.classList.add('char-modal');
      form = element;
      form.classList.add('char-edit-form');
      for (const section of sections) {
        const group = document.createElement('section');
        group.className = 'char-edit-section' + (section.skills ? ' char-skill-editor' : '');
        group.dataset.section = section.key;
        if (section.skills) group.dataset.skills = section.key;
        group.innerHTML = '<div class="char-section-head"><h4 class="char-form-title" id="char-section-' + section.key + '" tabindex="-1">' + section.title + '</h4>' +
          (section.key === 'schoolSkills' ? '<button type="button" class="btn btn-sm" data-act="template">补齐门派技能</button>' : '') + '</div>';
        for (const field of section.fields || []) group.appendChild(form.querySelector('[data-field="' + field.key + '"]'));
        if (section.skills) {
          group.insertAdjacentHTML('beforeend', '<div class="char-skill-labels" aria-hidden="true"><div><span>技能名称</span><span>等级</span></div>' +
            '<div><span>技能名称</span><span>等级</span></div></div><div class="char-skill-rows"></div>' +
            '<button type="button" class="btn btn-sm char-skill-add" data-act="add-row">＋ 添加技能</button>');
          editors[section.key] = Views.charBindSkillEditor(group, progress[section.key], section.key === 'auxiliarySkills', api);
        }
        form.appendChild(group);
      }
      Views.charBindSectionNav(overlay, sections);
      schoolChoice = Views.charBindSchoolChoice(form, api, editors.schoolSkills);
    },
    validate: () => schoolChoice.validate() || (form.reportValidity() ? '' : '请检查等级和数量，填写非负整数或留空'),
    onSubmit: async (data) => {
      const draft = { name: data.name, level: data.level, school: data.school, server: data.server, progress: {} };
      for (const key of ['training', 'petTraining']) {
        draft.progress[key] = Object.fromEntries(Object.keys(progress[key]).map((field) => [field, data[key + '_' + field]]));
      }
      for (const [key, editor] of Object.entries(editors)) draft.progress[key] = editor.read();
      for (const key of ['qianyuanPills', 'potentialFruits', 'note']) draft.progress[key] = data[key];
      const saved = await D.saveCharacter(draft, character && character.id, { date: data.changeDate, note: data.changeNote });
      savedId = saved.id;
      Views.charRefresh(savedId);
      UI.toast(character ? '角色档案已保存' : '角色已创建');
    },
  });
};

Views.charBindSectionNav = function (overlay, sections) {
  const nav = document.createElement('nav');
  nav.className = 'char-edit-nav'; nav.setAttribute('aria-label', '档案分区');
  nav.innerHTML = sections.map((section) => '<button type="button" class="btn btn-sm" data-section-target="' + section.key +
    '" aria-controls="char-section-' + section.key + '">' + section.title + '</button>').join('');
  overlay.querySelector('.modal-head').after(nav);
  const body = overlay.querySelector('.modal-body');
  const groups = [...body.querySelectorAll('[data-section]')];
  let destination;
  const update = () => {
    if (destination && Math.abs(body.scrollTop - destination.top) > 1) destination = null;
    const top = body.getBoundingClientRect().top + 20;
    const active = destination ? destination.group : groups.filter((group) => group.getBoundingClientRect().top <= top).pop() || groups[0];
    nav.querySelectorAll('button').forEach((button) => {
      const current = button.dataset.sectionTarget === active.dataset.section;
      button.classList.toggle('on', current);
      if (current) button.setAttribute('aria-current', 'location'); else button.removeAttribute('aria-current');
    });
  };
  nav.onclick = (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    UI.closePop();
    const group = body.querySelector('[data-section="' + button.dataset.sectionTarget + '"]');
    body.scrollTop += group.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
    destination = { group, top: body.scrollTop };
    group.querySelector('h4').focus({ preventScroll: true });
    update();
  };
  body.addEventListener('scroll', update, { passive: true });
  update();
};

Views.charBindSchoolChoice = function (form, api, editor) {
  const notice = document.createElement('div');
  notice.className = 'char-school-choice'; notice.hidden = true;
  notice.setAttribute('role', 'group'); notice.setAttribute('aria-label', '更换门派后的技能处理');
  notice.innerHTML = '<p></p><div><button type="button" class="btn btn-sm" data-act="keep-skills">保留现有技能</button>' +
    '<button type="button" class="btn btn-sm" data-act="replace-skills">替换为新门派技能</button></div>';
  form.querySelector('[data-section="basic"]').appendChild(notice);
  const template = form.querySelector('[data-act="template"]');
  let skillSchool = api.getVal('school');
  const settle = () => { skillSchool = api.getVal('school'); notice.hidden = true; template.disabled = false; };
  form.querySelector('[data-field="school"]').addEventListener('change', () => {
    const school = api.getVal('school');
    if (school === skillSchool || !editor.read().length) { settle(); return; }
    notice.hidden = false; template.disabled = true;
    notice.querySelector('p').textContent = '门派由「' + skillSchool + '」改为「' + school + '」，请选择如何处理现有师门技能。';
    notice.querySelector('[data-act="replace-skills"]').textContent = D.schoolSkillNames[school] ? '替换为新门派技能' : '清空师门技能';
  });
  notice.querySelector('[data-act="keep-skills"]').onclick = settle;
  notice.querySelector('[data-act="replace-skills"]').onclick = () => {
    editor.replace(D.fillSchoolSkills(api.getVal('school'), []));
    settle();
  };
  return { validate: () => {
    if (notice.hidden) return '';
    notice.querySelector('button').focus();
    return '更换门派后，请选择如何处理现有师门技能';
  } };
};

Views.charSkillRow = function (skill, auxiliary) {
  return '<div class="char-skill-row"><div class="char-skill-name">' + (auxiliary ? '<div data-mount="skill"></div>' : '') +
    '<div class="frow"><input name="skillName" aria-label="技能名称" value="' +
    U.esc(skill.name) + '" placeholder="技能名称"></div></div>' +
    '<div class="frow"><input name="skillLevel" type="number" min="0" step="1" aria-label="技能等级" value="' +
    U.esc(skill.level == null ? '' : skill.level) + '" placeholder="未记录"></div>' +
    '<div class="char-skill-actions"><button type="button" class="btn btn-sm char-skill-move" data-act="previous" title="前移此技能" aria-label="前移此技能">' +
    UI.icon('chev-left', 13) + '</button><button type="button" class="btn btn-sm char-skill-move" data-act="next" title="后移此技能" aria-label="后移此技能">' +
    UI.icon('chev-right', 13) + '</button><button type="button" class="btn btn-sm btn-danger" data-act="remove" aria-label="移除此技能">移除</button></div></div>';
};

Views.charBindSkillRow = function (row, skill) {
  const mount = row.querySelector('[data-mount="skill"]');
  if (!mount) return;
  const input = row.querySelector('[name="skillName"]');
  const update = (value) => {
    input.parentElement.hidden = value !== 'custom';
    if (value !== 'custom') input.value = value;
    mount.querySelector('button').setAttribute('aria-label', '选择辅助技能');
  };
  const select = UI.select(mount, {
    options: [{ v: '', t: '请选择技能' }, ...D.auxiliarySkillNames, { v: 'custom', t: '自定义技能' }],
    value: skill.name ? D.auxiliarySkillNames.includes(skill.name) ? skill.name : 'custom' : '',
    onChange: (value) => {
      update(value);
      (value === 'custom' ? input : mount.querySelector('button')).focus();
    },
  });
  update(select.get());
};

Views.charReadSkills = function (editor) {
  return [...editor.querySelectorAll('.char-skill-row')].map((row) => ({
    name: row.querySelector('[name="skillName"]').value.trim(), level: row.querySelector('[name="skillLevel"]').value,
  })).filter((skill) => skill.name || skill.level !== '');
};

Views.charBindSkillEditor = function (editor, skills, auxiliary, api) {
  const rows = editor.querySelector('.char-skill-rows');
  const updateOrder = () => [...rows.children].forEach((row, index) => {
    row.querySelector('[data-act="previous"]').disabled = index === 0;
    row.querySelector('[data-act="next"]').disabled = index === rows.children.length - 1;
  });
  const append = (skill) => {
    rows.insertAdjacentHTML('beforeend', Views.charSkillRow(skill, auxiliary));
    Views.charBindSkillRow(rows.lastElementChild, skill);
  };
  const replace = (list) => { UI.closePop(); rows.innerHTML = ''; list.forEach(append); updateOrder(); };
  (skills.length ? skills : [{ name: '', level: null }]).forEach(append);
  updateOrder();
  rows.onclick = (event) => {
    const button = event.target.closest('.char-skill-actions button');
    if (!button || button.disabled) return;
    UI.closePop();
    const row = button.closest('.char-skill-row');
    if (button.dataset.act === 'remove') {
      row.remove();
      editor.querySelector('[data-act="add-row"]').focus();
    } else {
      if (button.dataset.act === 'previous') rows.insertBefore(row, row.previousElementSibling);
      else rows.insertBefore(row.nextElementSibling, row);
    }
    updateOrder();
    if (button.dataset.act !== 'remove') {
      (button.disabled ? row.querySelector('.char-skill-move:not(:disabled)') : button).focus();
    }
  };
  editor.querySelector('[data-act="add-row"]').onclick = () => {
    append({ name: '', level: null });
    updateOrder();
    rows.lastElementChild.querySelector(auxiliary ? '[data-mount="skill"] button' : 'input').focus();
  };
  const template = editor.querySelector('[data-act="template"]');
  if (template) template.onclick = () => {
    const draft = Views.charReadSkills(editor);
    if (draft.some((skill) => !skill.name)) { UI.toast('请先填写已有行的技能名称', 'err'); return; }
    const school = api.getVal('school');
    if (!D.schoolSkillNames[school]) { UI.toast('当前门派暂无技能模板', 'err'); return; }
    const filled = D.fillSchoolSkills(school, draft);
    replace(filled);
  };
  return { read: () => Views.charReadSkills(editor), replace };
};

Views.charOrderModal = function (character) {
  const group = D.orderedCharacters().filter((item) => (item.pinned === true) === (character.pinned === true));
  UI.formModal({
    title: '调整排序 · ' + character.name,
    returnFocus: () => Views.charFocusTarget(character.id, 'sort'),
    values: { position: String(group.findIndex((item) => item.id === character.id)) },
    fields: [{ key: 'position', label: character.pinned ? '置顶角色中的位置' : '普通角色中的位置', type: 'select', full: true,
      options: group.map((item, index) => ({ v: String(index), t: '第 ' + (index + 1) + ' 位 · ' + item.name })),
      hint: '置顶角色始终排在普通角色前；取消置顶后回到普通组首位。' }],
    onRender: (_form, _api, overlay) => overlay.classList.add('char-modal'),
    onSubmit: async (data) => {
      await D.saveCharacterOrder(character.id, { position: Number(data.position) });
      Views.charRefresh(character.id, 'sort');
      UI.toast('角色顺序已保存');
    },
  });
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

Views.charCopyProgressModal = function (character) {
  const sources = D.orderedCharacters().filter((item) => item.id !== character.id);
  if (!sources.length) { UI.toast('请先添加另一个角色', 'err'); return; }
  const sections = [
    ['schoolSkills', '师门技能'], ['auxiliarySkills', '辅助技能'], ['training', '人物修炼'],
    ['petTraining', '召唤兽修炼'], ['qianyuanPills', '乾元丹'], ['potentialFruits', '潜能果'], ['note', '养成备注'],
  ];
  const describe = (key, value) => {
    const number = (value) => value == null ? '—' : String(value);
    if (Array.isArray(value)) return value.length ? value.map((skill) => skill.name + ' ' + number(skill.level)).join('、') : '未记录';
    if (key === 'training' || key === 'petTraining') {
      return (key === 'training' ? D.characterTraining : D.petTraining).map((field) => field.label + ' ' + number(value[field.key])).join('、');
    }
    return key === 'note' ? value || '未记录' : number(value);
  };
  let readPlan;
  UI.formModal({
    title: '复制养成配置 · ' + character.name, submitText: '复制选中项目', wide: true,
    returnFocus: () => Views.charFocusTarget(character.id, 'copy'),
    fields: [
      { key: 'source', label: '来源角色', type: 'select', options: sources.map((item) =>
        ({ v: item.id, t: item.name + ' · ' + (item.school || '未选门派') })), full: true,
        hint: '勾选要复制的项目，核对下方预览后保存；师门技能仅支持相同门派。' },
      ...sections.map(([key, label]) => ({ key, label, type: 'check', default: key !== 'schoolSkills' && key !== 'note' })),
      { key: 'skipEmpty', label: '跳过未记录项', type: 'check', default: true,
        hint: '保留目标已有数值及独有技能，技能按来源顺序排列；明确填写的 0 正常复制。关闭后完整覆盖所选项目。' },
    ],
    onRender: (form, api, overlay) => {
      overlay.classList.add('char-modal');
      for (const [key] of sections) form.querySelector('[data-field="' + key + '"]').classList.remove('full');
      const preview = document.createElement('section');
      preview.className = 'char-copy-preview'; preview.setAttribute('aria-label', '复制预览');
      form.appendChild(preview);
      readPlan = () => {
        const keys = sections.filter(([key]) => api.getVal(key)).map(([key]) => key);
        return D.characterCopyChanges(character.id, api.getVal('source'), keys, api.getVal('skipEmpty'));
      };
      const update = () => {
        try {
          const changes = readPlan();
          const progress = D.normalizeCharacterProgress(D.charById(character.id).progress);
          preview.innerHTML = '<h4>复制预览</h4><table class="tbl char-copy-table"><thead><tr><th>项目</th><th>当前</th><th>复制后</th></tr></thead><tbody>' +
            sections.filter(([key]) => api.getVal(key)).map(([key, label]) => '<tr><th scope="row">' + label + '</th><td>' + U.esc(describe(key, progress[key])) +
              '</td><td>' + (Object.hasOwn(changes, key) ? U.esc(describe(key, changes[key])) : '<span class="char-copy-unchanged">保持原值</span>') + '</td></tr>').join('') + '</tbody></table>';
        } catch (error) { preview.innerHTML = '<p class="char-copy-error">' + U.esc(error.message) + '</p>'; }
      };
      form.addEventListener('change', update);
      update();
    },
    validate: () => {
      try { return Object.keys(readPlan()).length ? '' : '所选项目没有可复制的变更'; }
      catch (error) { return error.message; }
    },
    onSubmit: async (data) => {
      await D.copyCharacterProgress(character.id, data.source, sections.filter(([key]) => data[key]).map(([key]) => key), data.skipEmpty);
      Views.charRefresh(character.id, 'copy'); UI.toast('养成配置已复制');
    },
  });
};
