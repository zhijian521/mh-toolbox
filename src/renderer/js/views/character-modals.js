'use strict';
/* 角色完整编辑、单项快捷编辑与复制弹窗。 */
Views.charQuickModal = function (id, category, key) {
  const character = D.charById(id);
  let metric;
  try { metric = D.characterProgressMetric(character, category, key); }
  catch (error) { UI.toast(error.message, 'err'); return; }
  const training = ['training', 'petTraining'].includes(category);
  const valueHtml = (value) => value == null ? '<span class="char-quick-empty">未记录</span>' :
    UI.numberHtml(value, metric.unit, { tag: 'strong' });
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
      const input = row.querySelector('input');
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
    validate: () => schoolChoice.validate(),
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

Views.charCopyProgressModal = function (character) {
  const sources = D.orderedCharacters().filter((item) => item.id !== character.id);
  if (!sources.length) { UI.toast('请先添加另一个角色', 'err'); return; }
  const sections = ['schoolSkills', 'auxiliarySkills', 'training', 'petTraining', 'qianyuanPills', 'potentialFruits', 'note']
    .map((key) => [key, key === 'note' ? '养成备注' : D.growthCategory(key).t]);
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
