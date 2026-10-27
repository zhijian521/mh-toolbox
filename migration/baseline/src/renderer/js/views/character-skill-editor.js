'use strict';
/* 角色技能草稿编辑器及门派切换处理。 */
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
