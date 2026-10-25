'use strict';
/* 角色档案与手动养成记录。 */
Views.characters = function () {
  const root = document.getElementById('view');
  const scrollTop = root.scrollTop;
  const characters = D.state.characters.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  root.innerHTML = '<div class="char-page">' +
    (characters.length ? '<div class="char-grid">' + characters.map(Views.charCardHtml).join('') + '</div>' :
      '<div class="empty"><div class="ic">' + UI.icon('user', 30) + '</div><p>为每个角色建立档案，记录技能和修炼。</p></div>') + '</div>';
  root.querySelectorAll('.char-card').forEach((card) => {
    const character = D.charById(card.dataset.id);
    card.querySelector('[data-act="edit"]').onclick = () => Views.charModal(character);
    card.querySelector('[data-act="schoolSkills"]').onclick = () => Views.charSkillsModal(character, 'schoolSkills');
    card.querySelector('[data-act="auxiliarySkills"]').onclick = () => Views.charSkillsModal(character, 'auxiliarySkills');
    card.querySelector('[data-act="training"]').onclick = () => Views.charTrainingModal(character);
    card.querySelector('[data-act="growth"]').onclick = () => Views.charGrowthModal(character);
    card.querySelector('[data-act="copy"]').onclick = () => Views.charCopyProgressModal(character);
    card.querySelector('[data-act="del"]').onclick = () => Views.charDelete(character);
  });
  root.scrollTop = scrollTop;
};

Views.charCardHtml = function (character) {
  const progress = D.normalizeCharacterProgress(character.progress);
  const heading = (title, action) => '<div class="char-section-head"><h3>' + title + '</h3>' +
    '<button class="btn btn-sm" data-act="' + action + '" aria-label="编辑' + title + '">编辑</button></div>';
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
    '</p></div></div><button class="btn btn-sm" data-act="edit">编辑档案</button></header>' +
    '<section class="char-section">' + heading('师门技能', 'schoolSkills') + skills(progress.schoolSkills) + '</section>' +
    '<section class="char-section">' + heading('修炼', 'training') + '<div class="char-training">' +
      training('人物', D.characterTraining, progress.training) + training('召唤兽', D.petTraining, progress.petTraining) + '</div></section>' +
    '<section class="char-section">' + heading('辅助技能', 'auxiliarySkills') + skills(progress.auxiliarySkills) + '</section>' +
    '<section class="char-section">' + heading('其他养成', 'growth') + '<dl class="char-growth">' +
      value('乾元丹', progress.qianyuanPills, '个') + value('潜能果', progress.potentialFruits, '个') + '</dl>' +
      (progress.note ? '<p class="char-note">' + U.esc(progress.note) + '</p>' : '') + '</section>' +
    '<footer class="char-actions"><button class="btn btn-sm" data-act="copy">复制养成配置</button><button class="btn btn-sm btn-danger" data-act="del">删除角色</button></footer></article>';
};

Views.charModal = function (character) {
  UI.formModal({
    title: character ? '编辑角色' : '添加角色',
    values: character || { name: '', level: '', school: '大唐官府', server: '' },
    fields: [
      { key: 'name', label: '角色昵称', type: 'text', required: true, placeholder: '如：养老一号' },
      { key: 'level', label: '等级', type: 'number', min: 0, step: '1', placeholder: '如 69、109' },
      { key: 'school', label: '门派', type: 'select', options: D.schools },
      { key: 'server', label: '服务器', type: 'text', placeholder: '如：紫禁城' },
    ],
    onSubmit: async (data) => {
      await D.saveCharacter(data, character && character.id);
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

Views.charSkillsModal = function (character, key) {
  const auxiliary = key === 'auxiliarySkills';
  const title = auxiliary ? '辅助技能' : '师门技能';
  const skills = D.normalizeCharacterProgress(character.progress)[key];
  const overlay = UI.openModal({
    title: title + ' · ' + character.name,
    body: '<form id="char-skills-form"><p class="char-form-hint">逐项填写技能名称和等级，等级留空表示未记录。</p>' +
      (!auxiliary && D.schoolSkillNames[character.school] ? '<button type="button" class="btn btn-sm" data-act="template">补齐' + U.esc(character.school) + '技能</button>' : '') +
      '<div class="char-skill-labels"><span>技能名称</span><span>等级</span></div><div class="char-skill-rows">' +
      (skills.length ? skills : [{ name: '', level: null }]).map((skill) => Views.charSkillRow(skill, auxiliary)).join('') + '</div>' +
      '<button type="button" class="btn btn-sm char-skill-add" data-act="add-row">＋ 添加技能</button></form>',
    footer: '<button class="btn" data-act="cancel">取消</button><button class="btn btn-gold" data-act="ok">保存</button>',
  });
  const form = overlay.querySelector('form');
  const rows = form.querySelector('.char-skill-rows');
  [...rows.children].forEach((row, index) => Views.charBindSkillRow(row, skills[index] || { name: '' }));
  rows.onclick = (event) => {
    const button = event.target.closest('[data-act="remove"]');
    if (button) { UI.closePop(); button.closest('.char-skill-row').remove(); }
  };
  form.querySelector('[data-act="add-row"]').onclick = () => {
    rows.insertAdjacentHTML('beforeend', Views.charSkillRow({ name: '', level: null }, auxiliary));
    Views.charBindSkillRow(rows.lastElementChild, { name: '' });
    rows.lastElementChild.querySelector(auxiliary ? '[data-mount="skill"] button' : 'input').focus();
  };
  const readSkills = () => [...rows.querySelectorAll('.char-skill-row')].map((row) => ({
    name: row.querySelector('[name="skillName"]').value.trim(), level: row.querySelector('[name="skillLevel"]').value,
  })).filter((skill) => skill.name || skill.level !== '');
  const template = form.querySelector('[data-act="template"]');
  if (template) template.onclick = () => {
    const draft = readSkills();
    if (draft.some((skill) => !skill.name)) { UI.toast('请先填写已有行的技能名称', 'err'); return; }
    const filled = D.fillSchoolSkills(character.school, draft);
    rows.innerHTML = filled.map((skill) => Views.charSkillRow(skill, false)).join('');
  };
  UI.watchForm(overlay);
  const submit = async () => {
    const button = overlay.querySelector('[data-act="ok"]');
    if (button.disabled || !form.reportValidity()) return;
    const values = readSkills();
    button.disabled = true; overlay._saving = true;
    try {
      await D.saveCharacterProgress(character.id, { [key]: values });
      UI.closeModal();
      Views.characters();
      UI.toast(title + '已保存');
    } catch (error) {
      UI.toast(error.message || '保存失败，请重试', 'err');
    } finally { button.disabled = false; overlay._saving = false; }
  };
  overlay.querySelector('[data-act="cancel"]').onclick = UI.requestCloseModal;
  overlay.querySelector('[data-act="ok"]').onclick = submit;
  form.onsubmit = (event) => { event.preventDefault(); submit(); };
};

Views.charTrainingModal = function (character) {
  const progress = D.normalizeCharacterProgress(character.progress);
  const groups = [{ key: 'training', title: '人物修炼', fields: D.characterTraining },
    { key: 'petTraining', title: '召唤兽修炼', fields: D.petTraining }];
  UI.formModal({
    title: '修炼 · ' + character.name,
    values: Object.fromEntries(groups.flatMap((group) => group.fields.map((field) =>
      [group.key + '_' + field.key, progress[group.key][field.key]]))),
    fields: groups.flatMap((group) => group.fields.map((field) => ({
      key: group.key + '_' + field.key, label: field.label, type: 'number', min: 0, step: '1', placeholder: '未记录',
    }))),
    onRender: (form) => groups.forEach((group) => {
      form.querySelector('[data-field="' + group.key + '_' + group.fields[0].key + '"]').insertAdjacentHTML('beforebegin',
        '<h4 class="char-form-title">' + group.title + '</h4>');
    }),
    onSubmit: async (data) => {
      await D.saveCharacterProgress(character.id, Object.fromEntries(groups.map((group) => [group.key,
        Object.fromEntries(group.fields.map((field) => [field.key, data[group.key + '_' + field.key]]))])));
      Views.characters();
      UI.toast('修炼已保存');
    },
  });
};

Views.charGrowthModal = function (character) {
  UI.formModal({
    title: '其他养成 · ' + character.name,
    values: D.normalizeCharacterProgress(character.progress),
    fields: [
      { key: 'qianyuanPills', label: '乾元丹个数', type: 'number', min: 0, step: '1', placeholder: '未记录' },
      { key: 'potentialFruits', label: '潜能果个数', type: 'number', min: 0, step: '1', placeholder: '未记录' },
      { key: 'note', label: '养成备注', type: 'textarea', full: true, placeholder: '可记录经脉流派、坐骑成长、机缘等' },
    ],
    onSubmit: async (data) => {
      await D.saveCharacterProgress(character.id, data);
      Views.characters();
      UI.toast('养成记录已保存');
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
