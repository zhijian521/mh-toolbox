'use strict';
/* 角色养成的真实 Electron 流程，仅写系统临时目录。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { isolate } = require('./helpers/electron.cjs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = isolate('characters');
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ schemaVersion: 4,
  characters: [{ id: 'c1', name: '轻舟听雨', level: 109, school: '大唐官府', server: '紫禁城',
    equipmentSets: [{ name: '日常任务', slots: { 武器: 'sword' } }] },
    { id: 'c2', name: '山月', level: 69, school: '普陀山', server: '紫禁城', progress: {
      schoolSkills: [{ name: '灵性', level: 79 }, { name: '观音咒', level: 79 }],
      auxiliarySkills: [{ name: '强身术', level: 80 }], training: { magic: 9 }, petTraining: { attack: 5 },
      qianyuanPills: 1, potentialFruits: 20,
    } }],
  equipment: [{ id: 'sword', characterId: 'c1', slot: '武器', name: '秋水长天', status: 'active', level: 100 }],
}));

async function checks(phase) {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const until = async (predicate, label) => {
    for (let index = 0; index < 150; index++) { if (predicate()) return; await pause(20); }
    throw new Error('等待失败：' + label + ' / ' + document.getElementById('toast-root').textContent);
  };
  const card = (id) => document.querySelector('.char-card[data-id="' + id + '"]');
  const click = (selector) => {
    const element = document.querySelector(selector);
    check(!!element, '找不到控件：' + selector); element.click();
  };
  const edit = (id, action) => click('.char-card[data-id="' + id + '"] [data-act="' + action + '"]');
  const field = (key, value) => {
    const form = document.getElementById('mform');
    if (form._xcomps[key]) form._xcomps[key].set(value);
    const input = form.querySelector('[name="' + key + '"]');
    if (input.type === 'checkbox') input.checked = !!value; else input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const skill = (index, name, level, key = 'schoolSkills') => {
    const row = document.querySelectorAll('[data-skills="' + key + '"] .char-skill-row')[index];
    row.querySelector('[name="skillName"]').value = name;
    row.querySelector('[name="skillLevel"]').value = level;
  };
  const save = async () => {
    click('.modal [data-act="ok"]');
    await until(() => !document.querySelector('.modal'), '保存角色表单');
  };
  await until(() => document.querySelectorAll('.nav-item').length === 7, '应用启动');
  Views.go('characters');
  await document.fonts.ready;
  if (phase === 'enhancements') {
    const persist = D.persist;
    let release;
    const delay = (fail = false) => {
      release = null;
      D.persist = async (...args) => {
        await new Promise((resolve) => { release = resolve; });
        if (fail) throw new Error('保存锁定失败');
        return persist.apply(D, args);
      };
    };
    const handle = card('c1').querySelector('[data-act="move"]');
    delay(); handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await until(() => release, '排序写入等待');
    Views.go('account'); release();
    await until(() => !Views._charOrderPending, '排序写入完成');
    D.persist = persist;
    check(Views._current === 'account' && document.getElementById('page-title').textContent === '账号' && !card('c1'), '排序异步回调不覆盖切换后的页面');
    const added = await D.saveCharacter({ name: '删除切页验证', school: '大唐官府' });
    Views.go('characters'); delay();
    edit(added.id, 'del'); click('[data-act="yes"]'); await until(() => release, '删除写入等待');
    Views.go('account'); release(); await D._commitQueue; await frame();
    D.persist = persist;
    check(!D.charById(added.id) && Views._current === 'account' && !document.querySelector('.char-card'), '删除异步回调刷新当前页面且不渲染错页');

    Views.go('characters'); edit('c1', 'edit');
    const sections = [...document.querySelectorAll('.char-edit-section')].map((group) => group.dataset.section);
    check(sections.join(',') === 'basic,schoolSkills,training,petTraining,auxiliarySkills,growth', '分区顺序明确');
    const widths = [...document.querySelectorAll('.char-edit-section')].map((group) => group.getBoundingClientRect().width);
    check(widths.every((width) => Math.abs(width - widths[0]) < 1), '所有编辑分区占满正文宽度');
    click('[data-section-target="growth"]'); await frame();
    check(document.querySelector('[data-section-target="growth"]').getAttribute('aria-current') === 'location', '底部滚动受限时仍高亮所选分区');
    click('[data-section-target="auxiliarySkills"]');
    await frame();
    check(document.activeElement.id === 'char-section-auxiliarySkills' && document.querySelector('.modal-body').scrollTop > 0, '分区定位滚动并聚焦对应标题');
    check(document.querySelector('[data-section-target="auxiliarySkills"]').getAttribute('aria-current') === 'location', '切换分区后保持正确高亮');
    const before = JSON.stringify(D.state);
    field('note', '锁定保存验证'); delay(true); click('.modal [data-act="ok"]');
    await until(() => release, '统一保存写入等待');
    check([...document.querySelectorAll('.modal button, .modal input, .modal textarea')].every((element) => element.disabled), '保存期间锁定所有表单和导航操作');
    check(document.querySelector('.modal[aria-busy="true"]') && document.querySelector('[data-act="ok"]').textContent === '保存中…', '保存状态可见');
    const rowCount = document.querySelectorAll('.char-skill-row').length;
    click('[data-skills="schoolSkills"] [data-act="add-row"]');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(document.querySelectorAll('.char-skill-row').length === rowCount && document.querySelector('.modal'), '保存期间不能新增技能或关闭表单');
    release(); await until(() => !document.querySelector('[data-act="ok"]').disabled, '失败恢复编辑');
    check(JSON.stringify(D.state) === before && document.querySelector('[name="note"]').value === '锁定保存验证' &&
      !document.querySelector('[name="note"]').disabled && document.querySelector('[data-skills="schoolSkills"] [data-act="previous"]').disabled,
    '失败保留草稿并恢复各控件原有可用状态');
    D.persist = persist; await save();
    check(document.activeElement.dataset.act === 'edit' && document.activeElement.closest('.char-card').dataset.id === 'c1', '保存后恢复目标角色编辑按钮焦点');

    edit('c1', 'edit');
    const oldSkills = JSON.stringify(D.charById('c1').progress.schoolSkills);
    field('school', '普陀山');
    check(!document.querySelector('.char-school-choice').hidden && document.querySelector('[data-act="template"]').disabled, '转门派时就地选择技能处理方式');
    click('.modal [data-act="ok"]'); await frame();
    check(document.querySelector('.modal') && D.charById('c1').school === '大唐官府', '未选择技能处理方式不能保存');
    click('[data-act="keep-skills"]'); await save();
    check(D.charById('c1').school === '普陀山' && JSON.stringify(D.charById('c1').progress.schoolSkills) === oldSkills, '明确保留时师门技能不变');
    edit('c1', 'edit'); field('school', '大唐官府'); click('[data-act="replace-skills"]'); await save();
    check(D.charById('c1').progress.schoolSkills.map((skill) => skill.name).join(',') === D.schoolSkillNames['大唐官府'].join(',') &&
      D.charById('c1').progress.training.attack === 17, '替换师门模板不影响修炼');
    edit('c1', 'edit'); field('school', '普陀山'); field('school', '大唐官府');
    check(document.querySelector('.char-school-choice').hidden && !document.querySelector('[data-act="template"]').disabled, '切回原门派取消待选提示');
    field('school', '普陀山'); click('[data-act="replace-skills"]'); click('.modal [data-act="cancel"]'); click('[data-act="discard"]');
    check(D.charById('c1').school === '大唐官府', '取消转门派保留已保存档案');

    return JSON.stringify(D.state);
  }
  if (phase === 'skillOrder') {
    const before = JSON.stringify(D.state);
    const progress = D.charById('c1').progress;
    const school = progress.schoolSkills;
    const auxiliary = progress.auxiliarySkills;
    const row = (key, index) => document.querySelectorAll('[data-skills="' + key + '"] .char-skill-row')[index];
    const move = (key, index, action) => row(key, index).querySelector('[data-act="' + action + '"]').click();
    edit('c1', 'edit');
    check(row('schoolSkills', 0).querySelector('[data-act="previous"]').disabled &&
      row('auxiliarySkills', 3).querySelector('[data-act="next"]').disabled, '技能顺序首尾禁止越界');
    move('schoolSkills', 0, 'next');
    click('.modal [data-act="cancel"]');
    check(document.querySelector('.modal-discard'), '仅排序也有未保存提醒');
    click('[data-act="discard"]');
    check(JSON.stringify(D.state) === before, '放弃排序保留原档案');
    edit('c1', 'edit');
    move('schoolSkills', 0, 'next'); move('schoolSkills', 6, 'previous');
    move('auxiliarySkills', 3, 'previous'); move('auxiliarySkills', 0, 'next');
    check(row('auxiliarySkills', 2).querySelector('[name="skillName"]').value === '自定义辅助' &&
      row('auxiliarySkills', 2).querySelector('[name="skillLevel"]').value === '0' &&
      row('auxiliarySkills', 2).querySelector('.xsel-t').textContent === '自定义技能', '移动保留自定义名称、等级零值与下拉');
    const persist = D.persist;
    D.persist = async () => { throw new Error('模拟技能排序失败'); };
    click('.modal [data-act="ok"]');
    await until(() => document.getElementById('toast-root').textContent.includes('模拟技能排序失败'), '技能排序失败提示');
    check(document.querySelector('.modal') && JSON.stringify(D.state) === before &&
      row('schoolSkills', 0).querySelector('[name="skillName"]').value === school[1].name, '失败保留新顺序草稿并回滚档案');
    D.persist = persist; await save();
    const expectedSchool = [school[1], school[0], ...school.slice(2, 5), school[6], school[5]];
    const expectedAuxiliary = [auxiliary[1], auxiliary[0], auxiliary[3], auxiliary[2]];
    check(JSON.stringify(D.charById('c1').progress.schoolSkills) === JSON.stringify(expectedSchool) &&
      JSON.stringify(D.charById('c1').progress.auxiliarySkills) === JSON.stringify(expectedAuxiliary), '两个技能分区独立保存调整后的顺序和等级');
    const displayed = [...card('c1').querySelectorAll('.char-skills dt')].map((item) => item.textContent);
    check(displayed.join('|') === [...expectedSchool, ...expectedAuxiliary].map((item) => item.name).join('|'), '角色卡片展示保存后的技能顺序');
    return JSON.stringify(D.state);
  }
  if (phase === 'reload') {
    check(document.querySelectorAll('.char-card').length === 2 && !document.querySelector('.char-stats'), '重启显示全部角色养成卡片');
    const progress = D.charById('c1').progress;
    check(progress.schoolSkills.length === 7 && progress.schoolSkills[0].level === 119, '重启保留师门技能');
    check(progress.training.attack === 17 && progress.training.magic === 0 && progress.petTraining.attack === 15, '重启保留人物和召唤兽修炼');
    check(progress.qianyuanPills === 3 && progress.potentialFruits === 100 && progress.note.includes('坐骑成长'), '重启保留养成数量和备注');
    check(progress.auxiliarySkills.length === 4 && progress.auxiliarySkills[3].name === '自定义辅助', '重启保留辅助技能自定义行');
    check(D.charById('c1').equipmentSets[0].slots['武器'] === 'sword', '角色编辑保留三套装备');
    check(D.orderedCharacters()[0].id === 'c1' && !card('c1').querySelector('[data-act=pin], [data-act=sort]'), '重启保留拖动顺序且只提供单一排序手柄');
    check(D.charById('c2').progress.schoolSkills[0].level === 79, '另一角色独立保留');
    return JSON.stringify(D.state);
  }
  if (phase === 'narrow') {
    const first = card('c1').getBoundingClientRect();
    const second = card('c2').getBoundingClientRect();
    const view = document.getElementById('view');
    check(first.bottom <= second.top && view.scrollHeight > view.clientHeight, '窄窗口角色卡片换行并可滚动');
    check(view.scrollWidth <= view.clientWidth && second.right <= innerWidth, '窄窗口无横向溢出');
    card('c2').scrollIntoView({ block: 'start' }); await frame();
    const scrollTop = view.scrollTop;
    edit('c2', 'edit'); skill(0, '灵性', 80); await save();
    check(Math.abs(view.scrollTop - scrollTop) <= 1 && D.charById('c1').progress.schoolSkills[0].level === 119, '下方角色编辑保留滚动且不改其他角色');
    edit('c2', 'edit');
    const modal = document.querySelector('.modal').getBoundingClientRect();
    check(modal.left >= 0 && modal.right <= innerWidth && modal.top >= 0 && modal.bottom <= innerHeight, '修炼弹窗适配窄窗口');
    UI.closeModal(); view.scrollTop = 0; await frame();
    return true;
  }
  D.setCharFilter('c1'); Views.characters();
  check(!document.getElementById('quick-add').hidden && document.getElementById('quick-add').closest('#topbar') &&
    document.getElementById('quick-add').textContent.includes('添加角色') && !document.querySelector('#view [data-act="add"]'),
    '添加角色统一放在顶部标题栏');
  check(document.querySelectorAll('.char-card').length === 2 && document.querySelector('.char-filter').hidden, '直接展示全部角色，隐藏角色切换');
  check(card('c1').querySelector('.char-unrecorded') && card('c1').querySelector('.is-empty').textContent === '—', '旧角色未记录状态不伪装为零');
  const first = card('c1').getBoundingClientRect();
  const second = card('c2').getBoundingClientRect();
  check(first.right <= second.left && first.top === second.top, '角色卡片与装备页同样并排展示');
  const other = JSON.stringify(D.charById('c2'));
  check(card('c1').querySelectorAll('.char-toolbar button').length === 4 &&
    !card('c1').querySelector('.char-section-head button, .char-actions'), '整体操作集中顶部，分区标题不重复编辑图标');
  check(['move', 'history', 'del', 'edit'].every((action) => {
    const button = card('c1').querySelector('[data-act="' + action + '"]');
    return button.querySelector('svg') && button.title && button.getAttribute('aria-label');
  }) && card('c1').querySelector('.char-toolbar button:last-child').dataset.act === 'edit', '图标操作带提示，编辑在最右侧');
  const originalCharacter = JSON.stringify(D.charById('c1'));
  edit('c1', 'edit'); field('name', '轻舟听雨'); field('level', 109);
  field('server', '紫禁城'); skill(0, '为官之道', 119);
  click('[data-skills="schoolSkills"] [data-act="add-row"]'); skill(1, '为官之道', 119);
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('技能名称重复'), '重复技能校验');
  check(document.querySelector('.modal') && JSON.stringify(D.charById('c1')) === originalCharacter, '无效技能保留完整表单且不改基础档案');
  skill(1, '无双一击', 119);
  for (const [index, name] of ['神兵鉴赏', '文韬武略', '十方无敌', '紫薇之术', '疾风步'].entries()) {
    click('[data-skills="schoolSkills"] [data-act="add-row"]'); skill(index + 2, name, index === 0 ? '' : 119);
  }
  click('[data-skills="schoolSkills"] [data-act="add-row"]');
  for (const [key, value] of Object.entries({ training_attack: 17, training_magic: 0, training_defense: 17,
    training_resistance: 17, training_hunting: 3, petTraining_attack: 15, petTraining_magic: 10,
    petTraining_defense: 12, petTraining_resistance: 12 })) field(key, value);
  check(document.querySelector('[data-mount="skill"] .xsel') && !document.querySelector('datalist, select, input[list]'), '辅助技能使用统一下拉组件');
  for (const [index, name] of ['强身术', '强壮', '神速', '自定义辅助'].entries()) {
    if (index) click('[data-skills="auxiliarySkills"] [data-act="add-row"]');
    const row = document.querySelectorAll('[data-skills="auxiliarySkills"] .char-skill-row')[index];
    row.querySelector('[data-mount="skill"] button').click();
    click('.xpop .xitem[data-v="' + (index === 3 ? 'custom' : name) + '"]');
    check(row.querySelector('[name="skillName"]').parentElement.hidden === (index !== 3), '选择常用或自定义辅助技能');
    skill(index, name, [120, 20, 10, 0][index], 'auxiliarySkills');
  }
  field('qianyuanPills', 3); field('potentialFruits', 100); field('note', '经脉：浴血豪侠\n坐骑成长 2.3');
  const persist = D.persist;
  D.persist = async () => { throw new Error('模拟档案写入失败'); };
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('模拟档案写入失败'), '统一档案失败提示');
  check(document.querySelectorAll('[data-skills="auxiliarySkills"] .char-skill-row').length === 4 &&
    JSON.stringify(D.charById('c1')) === originalCharacter, '失败保留全部草稿并回滚基础和养成');
  D.persist = persist; await save();
  const progress = D.charById('c1').progress;
  check(progress.schoolSkills.length === 7 && progress.schoolSkills[2].level === null &&
    progress.training.magic === 0 && progress.petTraining.attack === 15 && progress.qianyuanPills === 3 &&
    progress.auxiliarySkills.length === 4 && progress.note.includes('坐骑成长'), '一次保存基础、技能、修炼和其他养成');
  check(JSON.stringify(D.charById('c2')) === other, '统一编辑只更新目标角色');
  edit('c1', 'edit');
  check(document.querySelectorAll('[data-mount="skill"] .xsel-t')[0].textContent === '强身术' &&
    document.querySelectorAll('[data-mount="skill"] .xsel-t')[3].textContent === '自定义技能' &&
    document.querySelectorAll('[data-skills="auxiliarySkills"] [name="skillName"]')[3].value === '自定义辅助', '重开恢复常用选项和自定义名称');
  click('[data-mount="skill"] button');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!document.querySelector('.xpop'), '统一下拉支持 Esc 关闭');
  click('[data-skills="schoolSkills"] .char-skill-row [data-act="remove"]');
  click('.modal [data-act="cancel"]');
  check(document.querySelector('.modal-discard'), '取消统一编辑提示未保存');
  click('[data-act="discard"]');
  check(D.charById('c1').progress.schoolSkills.length === 7, '取消编辑不修改技能');
  const order = () => [...document.querySelectorAll('.char-card')].map((item) => item.dataset.id).join(',');
  const move = (id, key) => card(id).querySelector('[data-act="move"]').dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  check(!document.querySelector('.char-card [data-act="pin"], .char-card [data-act="sort"]') &&
    [...document.querySelectorAll('.char-card [data-act="move"]')].every(button => button.draggable), '仅保留拖动排序手柄');
  D.persist = async () => { throw new Error('模拟角色排序失败'); };
  move('c1', 'ArrowRight');
  await until(() => !Views._charOrderPending, '排序失败恢复');
  check(order() === 'c1,c2' && !card('c1').querySelector('[data-act="move"]').disabled, '排序失败回滚且可重试');
  D.persist = persist;
  move('c1', 'ArrowRight'); await until(() => !Views._charOrderPending, '方向键向后');
  check(order() === 'c2,c1' && document.activeElement.dataset.act === 'move', '方向键排序保存且焦点返回手柄');
  const handle = card('c1').querySelector('[data-act="move"]'), target = card('c2');
  const dataTransfer = new DataTransfer(), bounds = target.getBoundingClientRect();
  handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientX: bounds.left + 10, clientY: bounds.top + 10 }));
  check(target.dataset.dropSide && card('c1').classList.contains('is-dragging'), '角色拖动有插入线与淡化提示');
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: bounds.left + 10, clientY: bounds.top + 10 }));
  handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
  await until(() => !Views._charOrderPending, '拖动保存');
  check(order() === 'c1,c2' && !document.querySelector('.is-dragging, [data-drop-side]'), '拖动前后位置持久化且清理提示');
  click('#quick-add'); field('name', '重试角色'); field('level', 69);
  D.persist = async () => { throw new Error('模拟角色写入失败'); };
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('模拟角色写入失败'), '角色失败提示');
  check(D.state.characters.length === 2 && document.querySelector('[name="name"]').value === '重试角色', '新建失败不留重复角色');
  D.persist = persist; await save();
  const added = D.state.characters.find((character) => character.name === '重试角色');
  check(D.state.characters.length === 3, '重试只创建一次');
  edit(added.id, 'edit'); field('qianyuanPills', 0); field('potentialFruits', ''); await save();
  check(card(added.id).querySelector('.char-growth dd').textContent === '0个' &&
    D.charById(added.id).progress.potentialFruits === null, '零数量正常展示，空值仍未记录');
  edit(added.id, 'edit'); skill(0, '<img src=x onerror=alert(1)>', 0); await save();
  check(card(added.id).textContent.includes('<img') && !card(added.id).querySelector('img'), '用户技能名称安全转义');
  edit(added.id, 'edit'); click('[data-skills="schoolSkills"] .char-skill-row [data-act="remove"]'); await save();
  check(!D.charById(added.id).progress.schoolSkills.length, '移除最后一个技能可清空本分区');
  D.setCharFilter(added.id);
  edit(added.id, 'del'); click('.modal [data-act="no"]');
  check(D.charById(added.id), '删除取消保留角色');
  D.persist = async () => { throw new Error('模拟删除失败'); };
  edit(added.id, 'del'); click('.modal [data-act="yes"]');
  await until(() => document.getElementById('toast-root').textContent.includes('模拟删除失败'), '删除失败提示');
  check(D.charById(added.id) && D.charFilter === added.id, '删除失败保留角色和筛选');
  D.persist = persist;
  edit(added.id, 'del'); click('.modal [data-act="yes"]');
  await until(() => !D.charById(added.id), '删除重试');
  check(D.state.characters.length === 2 && D.charFilter === 'all', '删除成功清理角色筛选');
  Views.go('account'); check(!document.querySelector('.char-filter').hidden, '其他页面恢复角色筛选');
  Views.go('equipment'); check(document.querySelectorAll('.eq-board').length === 2, '角色编辑后装备页正常');
  Views.go('characters');
  const backup = JSON.stringify(D.state);
  check(JSON.stringify(D.normalize(JSON.parse(backup))) === backup, '养成随备份归一化完整往返');
  return backup;
}

async function nativeCardDrag(win) {
  const run = (code) => win.webContents.executeJavaScript(code, true);
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  const points = await run(`(() => {
    const source = document.querySelector('.char-card[data-id="c2"] [data-act="move"]').getBoundingClientRect();
    const target = document.querySelector('.char-card[data-id="c1"]').getBoundingClientRect();
    return { from: { x: source.left + source.width / 2, y: source.top + source.height / 2 },
      to: { x: target.left + target.width * .2, y: target.top + 30 } };
  })()`);
  let timer, onDrag;
  const intercepted = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('角色未触发原生拖动')), 3000);
    onDrag = (_event, method, params) => {
      if (method === 'Input.dragIntercepted') { clearTimeout(timer); resolve(params.data); }
    };
  });
  win.webContents.debugger.on('message', onDrag);
  await win.webContents.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });
  try {
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...points.from, button: 'left', buttons: 1, clickCount: 1 });
    await run('new Promise(resolve => requestAnimationFrame(resolve))');
    for (const distance of [8, 24, 48]) {
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x - distance, y: points.from.y + 8, button: 'left', buttons: 1 });
    }
    const data = await intercepted;
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await win.webContents.debugger.sendCommand('Input.dispatchDragEvent', { type, ...points.to, data });
    }
    await run(`new Promise((resolve, reject) => {
      let tries = 0; const poll = () => {
        if (!Views._charOrderPending && document.querySelector('.char-card').dataset.id === 'c2') { resolve(); return; }
        if (++tries > 150) { reject(new Error('角色原生拖动未保存顺序')); return; }
        setTimeout(poll, 20);
      }; poll();
    })`);
  } finally {
    clearTimeout(timer); win.webContents.debugger.removeListener('message', onDrag);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.to, button: 'left', clickCount: 1 });
    await win.webContents.debugger.sendCommand('Input.setInterceptDrags', { enabled: false });
  }
  await run("Views.charPersistOrder('c1', { targetId: 'c2', position: 'before' })");
}

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, frame: false,
    webPreferences: { preload: path.join(root, 'src/preload/preload.js'), contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } });
  const deadline = setTimeout(() => { console.error('[characters] TIMEOUT', dir); app.exit(1); }, 45000);
  try {
    require('../src/main/ipc').registerIpc({ getWindow: () => win });
    win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
    await win.loadFile(path.join(root, 'src/renderer/index.html'));
    const run = (phase) => win.webContents.executeJavaScript('(' + checks.toString() + ')(' + JSON.stringify(phase) + ')', true);
    await run('forms');
    await nativeCardDrag(win);
    const snapshot = await win.webContents.executeJavaScript('JSON.stringify(D.state)', true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), JSON.parse(snapshot));
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded;
    assert.deepEqual(JSON.parse(await run('reload')), JSON.parse(snapshot));
    if (process.argv.includes('--screenshots')) {
      await win.webContents.executeJavaScript("UI.closeModal(); document.getElementById('toast-root').innerHTML = ''; document.getElementById('view').scrollTop = 0", true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'characters-cards.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('.char-card[data-id=\"c1\"] [data-act=\"edit\"]').click()", true);
      await win.webContents.executeJavaScript('document.getAnimations().forEach(animation => animation.finish()); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))', true);
      await new Promise((resolve) => setTimeout(resolve, 180));
      fs.writeFileSync(path.join(dir, 'characters-skills.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('UI.closeModal()', true);
      await win.webContents.executeJavaScript("document.querySelector('.char-card[data-id=\"c1\"] [data-act=\"edit\"]').click(); document.querySelector('[data-skills=\"auxiliarySkills\"]').scrollIntoView({ block: 'center' }); document.querySelector('[data-mount=\"skill\"] button').click(); document.getAnimations().forEach(animation => animation.finish()); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'characters-auxiliary.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('UI.closeModal()', true);
    }
    win.setSize(1024, 680);
    await run('narrow');
    if (process.argv.includes('--screenshots')) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'characters-narrow.png'), (await win.webContents.capturePage()).toPNG());
    }
    const sorted = await run('skillOrder');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), JSON.parse(sorted));
    const reloaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await reloaded;
    const restored = await win.webContents.executeJavaScript("new Promise(resolve => { const check = () => document.querySelectorAll('.nav-item').length ? resolve(JSON.stringify(D.state)) : setTimeout(check, 20); check(); })", true);
    assert.deepEqual(JSON.parse(restored), JSON.parse(sorted));
    const enhanced = await run('enhancements');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), JSON.parse(enhanced));
    if (process.argv.includes('--screenshots')) {
      win.setSize(1280, 840);
      await win.webContents.executeJavaScript("Views.go('characters'); Views.charModal(D.charById('c1')); document.getElementById('mform')._xcomps.school.set('普陀山'); document.querySelector('[name=school]').dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('toast-root').replaceChildren()", true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      fs.writeFileSync(path.join(dir, 'characters-school-choice.png'), (await win.webContents.capturePage()).toPNG());
      win.setSize(620, 760);
      await win.webContents.executeJavaScript("UI.closeModal(); Views.charModal(D.charById('c1')); document.querySelector('[data-section-target=auxiliarySkills]').click()", true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      fs.writeFileSync(path.join(dir, 'characters-form-narrow.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('UI.closeModal()', true);
    }
    assert.deepEqual(errors, []);
    console.log('[characters] PASS: 顶部图标与编辑顺序、统一档案一次保存、技能增删/自定义/空值、修炼与装备保留');
    console.log('[characters] PASS: 单一手柄/原生鼠标拖动/方向键排序、失败回滚重试、删除恢复、备份往返、真实重启、窄窗口与滚动位置');
    console.log('[characters] PASS: 师门/辅助技能前后移、首尾边界、自定义技能零值、取消与失败重试、落盘与重启顺序');
    console.log('[characters] PASS: 异步切页、保存锁定与恢复、焦点、分区定位、门派保留/替换/取消');
    if (process.argv.includes('--screenshots')) console.log('[characters] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) {
    console.error('[characters] FAIL:', error); console.error('测试数据保留于', dir); app.exit(1);
  }
});
