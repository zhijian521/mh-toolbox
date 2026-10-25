'use strict';
/* 角色养成的真实 Electron 流程，仅写系统临时目录。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-characters-test-'));
app.setPath('userData', dir);
app.disableHardwareAcceleration();
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
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const skill = (index, name, level) => {
    const row = document.querySelectorAll('.char-skill-row')[index];
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
  if (phase === 'reload') {
    check(document.querySelectorAll('.char-card').length === 2 && !document.querySelector('.char-stats'), '重启显示全部角色养成卡片');
    const progress = D.charById('c1').progress;
    check(progress.schoolSkills.length === 7 && progress.schoolSkills[0].level === 119, '重启保留师门技能');
    check(progress.training.attack === 17 && progress.training.magic === 0 && progress.petTraining.attack === 15, '重启保留人物和召唤兽修炼');
    check(progress.qianyuanPills === 3 && progress.potentialFruits === 100 && progress.note.includes('坐骑成长'), '重启保留养成数量和备注');
    check(progress.auxiliarySkills.length === 4 && progress.auxiliarySkills[3].name === '自定义辅助', '重启保留辅助技能自定义行');
    check(D.charById('c1').equipmentSets[0].slots['武器'] === 'sword', '角色编辑保留三套装备');
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
    edit('c2', 'schoolSkills'); skill(0, '灵性', 80); await save();
    check(Math.abs(view.scrollTop - scrollTop) <= 1 && D.charById('c1').progress.schoolSkills[0].level === 119, '下方角色编辑保留滚动且不改其他角色');
    edit('c2', 'training');
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
  const originalProgress = JSON.stringify(D.charById('c1').progress);
  edit('c1', 'schoolSkills'); skill(0, '为官之道', 119);
  click('[data-act="add-row"]'); skill(1, '为官之道', 119);
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('技能名称重复'), '重复技能校验');
  check(document.querySelector('.modal') && JSON.stringify(D.charById('c1').progress) === originalProgress, '无效技能保留表单且不改原档案');
  skill(1, '无双一击', 119);
  for (const [index, name] of ['神兵鉴赏', '文韬武略', '十方无敌', '紫薇之术', '疾风步'].entries()) {
    click('[data-act="add-row"]'); skill(index + 2, name, index === 0 ? '' : 119);
  }
  click('[data-act="add-row"]'); await save();
  check(D.charById('c1').progress.schoolSkills.length === 7 && D.charById('c1').progress.schoolSkills[2].level === null,
    '师门逐项记录，空白行忽略，等级留空保留');
  edit('c1', 'schoolSkills'); click('.char-skill-row [data-act="remove"]'); click('.modal [data-act="cancel"]');
  check(D.charById('c1').progress.schoolSkills.length === 7, '取消技能编辑不修改档案');
  edit('c1', 'training');
  for (const [key, value] of Object.entries({ training_attack: 17, training_magic: 0, training_defense: 17,
    training_resistance: 17, training_hunting: 3, petTraining_attack: 15, petTraining_magic: 10,
    petTraining_defense: 12, petTraining_resistance: 12 })) field(key, value);
  await save();
  check(D.charById('c1').progress.training.magic === 0 && D.charById('c1').progress.petTraining.attack === 15, '人物与召唤兽修炼分开保存');
  edit('c1', 'auxiliarySkills');
  check(document.querySelector('[data-mount="skill"] .xsel') && !document.querySelector('datalist, select, input[list]'), '辅助技能使用统一下拉组件');
  for (const [index, name] of ['强身术', '强壮', '神速', '自定义辅助'].entries()) {
    if (index) click('[data-act="add-row"]');
    const row = document.querySelectorAll('.char-skill-row')[index];
    row.querySelector('[data-mount="skill"] button').click();
    click('.xpop .xitem[data-v="' + (index === 3 ? 'custom' : name) + '"]');
    check(row.querySelector('[name="skillName"]').parentElement.hidden === (index !== 3), '选择常用或自定义辅助技能');
    skill(index, name, [120, 20, 10, 0][index]);
  }
  const persist = D.persist;
  D.persist = async () => { throw new Error('模拟技能写入失败'); };
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('模拟技能写入失败'), '技能失败提示');
  check(document.querySelectorAll('.char-skill-row').length === 4 && !D.charById('c1').progress.auxiliarySkills.length, '技能失败保留输入并回滚档案');
  D.persist = persist; await save();
  edit('c1', 'auxiliarySkills');
  check(document.querySelectorAll('[data-mount="skill"] .xsel-t')[0].textContent === '强身术' &&
    document.querySelectorAll('[data-mount="skill"] .xsel-t')[3].textContent === '自定义技能' &&
    document.querySelectorAll('.char-skill-row [name="skillName"]')[3].value === '自定义辅助', '重新打开保留常用选项与自定义名称');
  click('[data-mount="skill"] button');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!document.querySelector('.xpop'), '统一下拉支持 Esc 关闭');
  edit('c1', 'growth'); field('qianyuanPills', 3); field('potentialFruits', 100); field('note', '经脉：浴血豪侠\n坐骑成长 2.3'); await save();
  edit('c1', 'edit'); field('name', '轻舟听雨'); field('level', 109); await save();
  check(D.charById('c1').progress.schoolSkills.length === 7 && D.charById('c1').equipmentSets[0].slots['武器'] === 'sword', '基础档案编辑保留养成与装备');
  check(JSON.stringify(D.charById('c2')) === other, '各分区只更新目标角色');
  click('#quick-add'); field('name', '重试角色'); field('level', 69);
  D.persist = async () => { throw new Error('模拟角色写入失败'); };
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('模拟角色写入失败'), '角色失败提示');
  check(D.state.characters.length === 2 && document.querySelector('[name="name"]').value === '重试角色', '新建失败不留重复角色');
  D.persist = persist; await save();
  const added = D.state.characters.find((character) => character.name === '重试角色');
  check(D.state.characters.length === 3, '重试只创建一次');
  edit(added.id, 'growth'); field('qianyuanPills', 0); field('potentialFruits', ''); await save();
  check(card(added.id).querySelector('.char-growth dd').textContent === '0个' &&
    D.charById(added.id).progress.potentialFruits === null, '零数量正常展示，空值仍未记录');
  edit(added.id, 'schoolSkills'); skill(0, '<img src=x onerror=alert(1)>', 0); await save();
  check(card(added.id).textContent.includes('<img') && !card(added.id).querySelector('img'), '用户技能名称安全转义');
  edit(added.id, 'schoolSkills'); click('.char-skill-row [data-act="remove"]'); await save();
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

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, frame: false,
    webPreferences: { preload: path.join(root, 'src/preload/preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const deadline = setTimeout(() => { console.error('[characters] TIMEOUT', dir); app.exit(1); }, 45000);
  try {
    require('../src/main/ipc').registerIpc({ getWindow: () => win });
    win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
    await win.loadFile(path.join(root, 'src/renderer/index.html'));
    const run = (phase) => win.webContents.executeJavaScript('(' + checks.toString() + ')(' + JSON.stringify(phase) + ')', true);
    const snapshot = await run('forms');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), JSON.parse(snapshot));
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded;
    assert.deepEqual(JSON.parse(await run('reload')), JSON.parse(snapshot));
    if (process.argv.includes('--screenshots')) {
      await win.webContents.executeJavaScript("UI.closeModal(); document.getElementById('toast-root').innerHTML = ''; document.getElementById('view').scrollTop = 0", true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'characters-cards.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('.char-card[data-id=\"c1\"] [data-act=\"schoolSkills\"]').click()", true);
      await win.webContents.executeJavaScript('document.getAnimations().forEach(animation => animation.finish()); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))', true);
      await new Promise((resolve) => setTimeout(resolve, 180));
      fs.writeFileSync(path.join(dir, 'characters-skills.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('UI.closeModal()', true);
      await win.webContents.executeJavaScript("document.querySelector('.char-card[data-id=\"c1\"] [data-act=\"auxiliarySkills\"]').click(); document.querySelector('[data-mount=\"skill\"] button').click(); document.getAnimations().forEach(animation => animation.finish()); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", true);
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
    assert.deepEqual(errors, []);
    console.log('[characters] PASS: 全角色卡片、技能增删/自定义/空值、人物与召唤兽修炼、乾元丹/潜能果、档案编辑与装备保留');
    console.log('[characters] PASS: 写入失败重试、安全转义、删除恢复、备份往返、真实重启、窄窗口与滚动位置');
    if (process.argv.includes('--screenshots')) console.log('[characters] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) {
    console.error('[characters] FAIL:', error); console.error('测试数据保留于', dir); app.exit(1);
  }
});
