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
        Views.characters();
        root.querySelector('.char-card[data-id="' + CSS.escape(character.id) + '"] [data-act="pin"]').focus({ preventScroll: true });
      } catch (error) { UI.toast(error.message || '置顶失败，请重试', 'err'); }
      finally { button.disabled = false; }
    };
    card.querySelector('[data-act="sort"]').onclick = () => Views.charOrderModal(character);
    card.querySelector('[data-act="copy"]').onclick = () => Views.charCopyProgressModal(character);
    card.querySelector('[data-act="del"]').onclick = () => Views.charDelete(character);
  });
  root.scrollTop = scrollTop;
};

Views.charCardHtml = function (character) {
  const progress = D.normalizeCharacterProgress(character.progress);
  const heading = (title) => '<div class="char-section-head"><h3>' + title + '</h3></div>';
  const iconButton = (action, icon, label, extra = '') => '<button class="btn btn-sm char-icon-btn' +
    (action === 'del' ? ' btn-danger' : '') + '" data-act="' + action + '" title="' + label + '" aria-label="' + label + '"' + extra + '>' + UI.icon(icon, 15) + '</button>';
  const value = (label, number, unit) => '<div class="char-value"><dt>' + U.esc(label) + '</dt><dd' +
    (number == null ? ' class="is-empty"' : '') + '>' + (number == null ? '—' : U.esc(number) +
    (unit ? '<small>' + unit + '</small>' : '')) + '</dd></div>';
  const skills = (list) => list.length ? '<dl class="char-skills">' + list.map((skill) => value(skill.name, skill.level, '级')).join('') +
    '</dl>' : '<p class="char-unrecorded">未记录</p>';
  const training = (title, fields, values) => '<section><h4>' + title + '</h4><dl class="char-training-values">' +
    fields.map((field) => value(field.label, values[field.key], '')).join('') + '</dl></section>';
  return '<article class="char-card" data-id="' + U.esc(character.id) + '" aria-label="' + U.esc(character.name) + '的角色档案">' +
    '<header class="char-top"><div class="char-identity">' + UI.icon('hero', 40) + '<div><h2 class="char-name">' + U.esc(character.name) +
    '</h2><p class="char-sub">' + U.esc([character.level ? character.level + ' 级' : '', character.school, character.server].filter(Boolean).join(' · ')) +
    '</p></div></div><div class="char-toolbar">' +
      iconButton('pin', 'pin', character.pinned ? '取消置顶' : '置顶角色', ' aria-pressed="' + (character.pinned === true) + '"') +
      iconButton('sort', 'sort', '调整排序') + iconButton('copy', 'copy', '复制养成配置') + iconButton('del', 'trash', '删除角色') +
      iconButton('edit', 'edit', '编辑档案') + '</div></header>' +
    '<section class="char-section">' + heading('师门技能') + skills(progress.schoolSkills) + '</section>' +
    '<section class="char-section">' + heading('修炼') + '<div class="char-training">' +
      training('人物', D.characterTraining, progress.training) + training('召唤兽', D.petTraining, progress.petTraining) + '</div></section>' +
    '<section class="char-section">' + heading('辅助技能') + skills(progress.auxiliarySkills) + '</section>' +
    '<section class="char-section">' + heading('其他养成') + '<dl class="char-growth">' +
      value('乾元丹', progress.qianyuanPills, '个') + value('潜能果', progress.potentialFruits, '个') + '</dl>' +
      (progress.note ? '<p class="char-note">' + U.esc(progress.note) + '</p>' : '') + '</section></article>';
};

Views.charModal = function (character) {
  const progress = D.normalizeCharacterProgress(character && character.progress);
  const groups = [{ key: 'training', title: '人物修炼', fields: D.characterTraining },
    { key: 'petTraining', title: '召唤兽修炼', fields: D.petTraining }];
  let form;
  UI.formModal({
    title: character ? '编辑角色档案' : '添加角色', wide: true,
    values: Object.assign({}, character || { name: '', level: '', school: '大唐官府', server: '' }, progress,
      Object.fromEntries(groups.flatMap((group) => group.fields.map((field) =>
        [group.key + '_' + field.key, progress[group.key][field.key]])))),
    fields: [
      { key: 'name', label: '角色昵称', type: 'text', required: true, placeholder: '如：养老一号' },
      { key: 'level', label: '等级', type: 'number', min: 0, step: '1', placeholder: '如 69、109' },
      { key: 'school', label: '门派', type: 'select', options: D.schools },
      { key: 'server', label: '服务器', type: 'text', placeholder: '如：紫禁城' },
      ...groups.flatMap((group) => group.fields.map((field) => ({
        key: group.key + '_' + field.key, label: field.label, type: 'number', min: 0, step: '1', placeholder: '未记录',
      }))),
      { key: 'qianyuanPills', label: '乾元丹个数', type: 'number', min: 0, step: '1', placeholder: '未记录' },
      { key: 'potentialFruits', label: '潜能果个数', type: 'number', min: 0, step: '1', placeholder: '未记录' },
      { key: 'note', label: '养成备注', type: 'textarea', full: true, placeholder: '可记录经脉流派、坐骑成长、机缘等' },
    ],
    onRender: (element, api) => {
      form = element;
      form.classList.add('char-edit-form');
      const heading = (title) => '<h4 class="char-form-title">' + title + '</h4>';
      form.insertAdjacentHTML('afterbegin', heading('基础信息'));
      groups.forEach((group) => form.querySelector('[data-field="' + group.key + '_' + group.fields[0].key + '"]')
        .insertAdjacentHTML('beforebegin', heading(group.title)));
      form.querySelector('[data-field="qianyuanPills"]').insertAdjacentHTML('beforebegin', heading('其他养成'));
      for (const [key, title] of [['schoolSkills', '师门技能'], ['auxiliarySkills', '辅助技能']]) {
        const auxiliary = key === 'auxiliarySkills';
        const anchor = form.querySelector('[data-field="' + (auxiliary ? 'qianyuanPills' : 'training_attack') + '"]').previousElementSibling;
        anchor.insertAdjacentHTML('beforebegin', '<section class="char-skill-editor" data-skills="' + key + '">' +
          '<div class="char-section-head"><h4>' + title + '</h4>' + (!auxiliary ?
            '<button type="button" class="btn btn-sm" data-act="template">补齐门派技能</button>' : '') + '</div>' +
          '<div class="char-skill-labels"><span>技能名称</span><span>等级</span></div><div class="char-skill-rows"></div>' +
          '<button type="button" class="btn btn-sm char-skill-add" data-act="add-row">＋ 添加技能</button></section>');
        Views.charBindSkillEditor(form.querySelector('[data-skills="' + key + '"]'), progress[key], auxiliary, api);
      }
    },
    validate: () => form.reportValidity() ? '' : '请检查等级和数量，填写非负整数或留空',
    onSubmit: async (data) => {
      const values = Object.fromEntries(groups.map((group) => [group.key,
        Object.fromEntries(group.fields.map((field) => [field.key, data[group.key + '_' + field.key]]))]));
      for (const key of ['schoolSkills', 'auxiliarySkills']) values[key] = Views.charReadSkills(form.querySelector('[data-skills="' + key + '"]'));
      for (const key of ['qianyuanPills', 'potentialFruits', 'note']) values[key] = data[key];
      await D.saveCharacter({ name: data.name, level: data.level, school: data.school, server: data.server, progress: values }, character && character.id);
      Views.refreshHeader();
      Views.characters();
      UI.toast(character ? '角色档案已保存' : '角色已创建');
    },
  });
};

Views.charSkillRow = function (skill, auxiliary) {
  return '<div class="char-skill-row"><div class="char-skill-name">' + (auxiliary ? '<div data-mount="skill"></div>' : '') +
    '<div class="frow"><input name="skillName" aria-label="技能名称" value="' +
    U.esc(skill.name) + '" placeholder="技能名称"></div></div>' +
    '<div class="frow"><input name="skillLevel" type="number" min="0" step="1" aria-label="技能等级" value="' +
    U.esc(skill.level == null ? '' : skill.level) + '" placeholder="未记录"></div>' +
    '<button type="button" class="btn btn-sm btn-danger" data-act="remove" aria-label="移除此技能">移除</button></div>';
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
  const append = (skill) => {
    rows.insertAdjacentHTML('beforeend', Views.charSkillRow(skill, auxiliary));
    Views.charBindSkillRow(rows.lastElementChild, skill);
  };
  (skills.length ? skills : [{ name: '', level: null }]).forEach(append);
  rows.onclick = (event) => {
    const button = event.target.closest('[data-act="remove"]');
    if (button) { UI.closePop(); button.closest('.char-skill-row').remove(); editor.querySelector('[data-act="add-row"]').focus(); }
  };
  editor.querySelector('[data-act="add-row"]').onclick = () => {
    append({ name: '', level: null });
    rows.lastElementChild.querySelector(auxiliary ? '[data-mount="skill"] button' : 'input').focus();
  };
  const template = editor.querySelector('[data-act="template"]');
  if (template) template.onclick = () => {
    const draft = Views.charReadSkills(editor);
    if (draft.some((skill) => !skill.name)) { UI.toast('请先填写已有行的技能名称', 'err'); return; }
    const school = api.getVal('school');
    if (!D.schoolSkillNames[school]) { UI.toast('当前门派暂无技能模板', 'err'); return; }
    const filled = D.fillSchoolSkills(school, draft);
    rows.innerHTML = '';
    filled.forEach(append);
  };
};

Views.charOrderModal = function (character) {
  const group = D.orderedCharacters().filter((item) => (item.pinned === true) === (character.pinned === true));
  UI.formModal({
    title: '调整排序 · ' + character.name,
    values: { position: String(group.findIndex((item) => item.id === character.id)) },
    fields: [{ key: 'position', label: character.pinned ? '置顶角色中的位置' : '普通角色中的位置', type: 'select', full: true,
      options: group.map((item, index) => ({ v: String(index), t: '第 ' + (index + 1) + ' 位 · ' + item.name })),
      hint: '置顶角色始终排在普通角色前；取消置顶后回到普通组首位。' }],
    onSubmit: async (data) => {
      await D.saveCharacterOrder(character.id, { position: Number(data.position) });
      Views.characters();
      UI.toast('角色顺序已保存');
    },
  });
};

Views.charDelete = async function (character) {
  const count = ['transactions', 'sessions', 'goals', 'equipment'].reduce((total, key) =>
    total + D.state[key].filter((item) => item.characterId === character.id).length, 0);
  const ok = await UI.confirmModal({ title: '删除角色', danger: true, confirmText: '确认删除',
    message: '确定删除角色「' + character.name + '」吗？技能养成档案及名下 ' + count +
      ' 条相关记录（收益/在线/账号账本/目标/装备）会一并删除，且无法恢复。' });
  if (!ok) return;
  const active = D.state.activeSession && D.state.activeSession.characterId === character.id;
  try {
    await D.removeCharacter(character.id);
    if (active) Views.clearQuickTimer();
    if (D.charFilter === character.id) D.setCharFilter('all');
    Views.refreshHeader();
    Views.characters();
    UI.toast('角色已删除');
  } catch (error) {
    UI.toast(error.message || '删除失败，请重试', 'err');
  }
};

Views.charCopyProgressModal = function (character) {
  const sources = D.state.characters.filter((item) => item.id !== character.id);
  if (!sources.length) { UI.toast('请先添加另一个角色', 'err'); return; }
  const sections = [
    ['schoolSkills', '师门技能'], ['auxiliarySkills', '辅助技能'], ['training', '人物修炼'],
    ['petTraining', '召唤兽修炼'], ['qianyuanPills', '乾元丹'], ['potentialFruits', '潜能果'], ['note', '养成备注'],
  ];
  UI.formModal({
    title: '复制养成配置 · ' + character.name, submitText: '覆盖选中项目',
    fields: [
      { key: 'source', label: '来源角色', type: 'select', options: sources.map((item) =>
        ({ v: item.id, t: item.name + ' · ' + (item.school || '未选门派') })), full: true,
        hint: '选中项目会替换目标角色的原记录；其他项目保留。师门技能仅支持相同门派。' },
      ...sections.map(([key, label]) => ({ key, label, type: 'check', default: key !== 'schoolSkills' && key !== 'note' })),
    ],
    validate: (data) => {
      const source = D.charById(data.source);
      if (!source) return '来源角色不存在';
      if (!sections.some(([key]) => data[key])) return '请选择要复制的项目';
      return data.schoolSkills && (!character.school || source.school !== character.school) ? '师门技能需选择相同门派的角色' : '';
    },
    onSubmit: async (data) => {
      const progress = D.normalizeCharacterProgress(D.charById(data.source).progress);
      await D.saveCharacterProgress(character.id, Object.fromEntries(sections.filter(([key]) => data[key]).map(([key]) => [key, progress[key]])));
      Views.characters(); UI.toast('养成配置已复制');
    },
  });
};
