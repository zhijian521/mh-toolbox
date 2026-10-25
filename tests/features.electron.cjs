'use strict';
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isolate, createWindow } = require('./helpers/electron.cjs');
const dir = isolate('features');
const original = { schemaVersion: 4, characters: [
  { id: 'c1', name: '轻舟', school: '大唐官府', progress: { schoolSkills: [{ name: '为官之道', level: 119 }, { name: '自定义', level: 0 }] } },
  { id: 'c2', name: '小号', school: '大唐官府', progress: { training: { attack: 12 }, qianyuanPills: 3 } },
], transactions: [] };
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(original));
let importFile = path.join(dir, 'import.json');
const csvFile = path.join(dir, 'records.csv');
dialog.showSaveDialog = async () => ({ canceled: false, filePath: csvFile });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [importFile] });

async function checks() {
  const check = (ok, label) => { if (!ok) throw new Error(label); };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const until = async (fn, label) => { for (let i = 0; i < 150; i++) { if (fn()) return; await pause(); } throw new Error('等待失败：' + label); };
  const click = (selector) => { const el = document.querySelector(selector); check(!!el, '找不到 ' + selector); el.click(); };
  const key = (name, target = document.activeElement, shiftKey = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
  const field = (name, value) => {
    const form = document.querySelector('.modal form');
    if (form._xcomps && form._xcomps[name]) form._xcomps[name].set(value);
    const el = form.querySelector('[name="' + name + '"]');
    if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const save = async () => { click('.modal [data-act="ok"]'); await until(() => !document.querySelector('.modal'), '保存'); };
  await until(() => document.querySelectorAll('.nav-item').length === 7, '启动');
  Views.go('characters');
  const trigger = document.querySelector('.char-card[data-id="c1"] [data-act="edit"]');
  trigger.focus(); trigger.click(); await frame();
  check(document.querySelector('.modal[role="dialog"][aria-modal="true"]'), '弹窗语义');
  const school = document.querySelector('[data-xmount="school"] button');
  school.focus(); key('ArrowDown');
  check(document.activeElement.getAttribute('role') === 'option', '方向键打开并聚焦选项');
  key('End'); check(document.activeElement.dataset.v === '其他', 'End 到末尾');
  key('Home'); key('ArrowDown'); key('Enter');
  check(school === document.activeElement && school.getAttribute('aria-label') === '门派' && school.getAttribute('aria-expanded') === 'false', '选中恢复稳定焦点与名称');
  school.click(); key('Escape');
  check(!document.querySelector('.xpop') && document.querySelector('.modal'), '一次 Esc 只关闭下拉');
  key('Escape'); check(document.querySelector('.modal-discard'), '修改下拉后关闭提示');
  click('[data-act="continue"]'); check(!document.querySelector('.modal-discard'), '继续编辑保留表单');
  field('name', '未保存');
  for (const close of [() => click('.modal-x'), () => document.querySelector('.modal-overlay').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
    () => click('.modal [data-act="cancel"]')]) {
    close(); check(document.querySelectorAll('.modal-discard').length === 1, '关闭途径统一未保存处理'); click('[data-act="continue"]');
  }
  const first = document.querySelector('.modal-x'), last = document.querySelector('.modal [data-act="ok"]');
  last.focus(); key('Tab'); check(document.activeElement === first, 'Tab 限制焦点');
  first.focus(); key('Tab', first, true); check(document.activeElement === last, 'Shift Tab 限制焦点');
  key('Escape'); click('[data-act="discard"]'); check(document.activeElement === trigger, '放弃后返回触发按钮');
  for (const close of [() => key('Escape'), () => click('.modal-x'), () => document.querySelector('.modal-overlay').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))]) {
    const result = UI.confirmModal({ message: '取消检查' }); await frame(); close(); check(await result === false, '确认弹窗全部关闭路径都完成 Promise');
  }

  Views.charModal(D.charById('c1')); field('name', '保存中');
  const persist = D.persist;
  let release;
  D.persist = () => new Promise((resolve) => { release = resolve; });
  click('.modal [data-act="ok"]'); await until(() => !!release, '写入等待');
  key('Escape'); click('.modal-x'); check(document.querySelector('.modal') && !document.querySelector('.modal-discard'), '保存中不能关闭');
  release(); D.persist = persist;
  await until(() => !document.querySelector('.modal'), '保存结束');

  Views.charModal(D.charById('c1'));
  click('[data-act="template"]');
  check(document.querySelectorAll('[data-skills="schoolSkills"] .char-skill-row').length === 8, '补齐门派模板保留自定义行');
  check(document.querySelector('[name="skillLevel"]').value === '119' && document.querySelectorAll('[name="skillLevel"]')[1].value === '0', '模板保留等级');
  await save();
  click('.char-card[data-id="c1"] [data-act="copy"]'); field('schoolSkills', false); await save();
  check(D.charById('c1').progress.training.attack === 12 && D.charById('c1').progress.qianyuanPills === 3 &&
    D.charById('c1').progress.schoolSkills.length === 8, '复制选中项目保留其余');

  Views.charModal(D.charById('c1')); field('school', '普陀山'); click('[data-act="template"]');
  check([...document.querySelectorAll('[data-skills="schoolSkills"] [name="skillName"]')].some((input) => input.value === '灵性'),
    '统一档案模板使用当前选择的门派');
  UI.closeModal();

  Views.go('transactions');
  Views.txModal(); field('amount', 1);
  const date = document.querySelector('[data-xmount="date"] button'); date.click(); key('Escape');
  check(document.activeElement === date && document.querySelector('.modal'), '日期 Esc 返回原按钮');
  UI.closeModal();
  const item = await D.saveTransaction({ ledger: 'earnings', recordType: 'item', kind: 'income', characterId: 'c1', currency: 'cash',
    date: '2026-01-01', category: '物品掉落', itemName: '宝石', quantity: 10, unitPrice: 5, status: 'held' });
  Views.itemSellModal(item); field('quantity', 3); field('amount', 12); await save();
  check(D.itemRemaining(item) === 7 && D.stats(D.earnings()).income === 12, '界面部分出售');
  Views.itemSellModal(item); field('quantity', 8); click('.modal [data-act="ok"]'); await pause();
  check(document.querySelector('.modal') && D.itemRemaining(item) === 7, '界面阻止超卖'); UI.closeModal();

  const goal = await D.saveGoal({ characterId: 'c1', title: '修炼目标', unit: '级', target: 20, deadline: '2026-01-01', type: 'progress' });
  await D.saveGoalProgress(goal.id, { date: '2026-01-02', delta: 14.5, note: '首记' });
  Views.go('goals');
  check(document.querySelector('.goal-nums').textContent.includes('14.5级') && !document.querySelector('.goal-nums').textContent.includes('万'), '目标实际单位和小数');
  click('.goal-card [data-act="history"]'); click('tr[data-id] [data-act="edit"]'); field('delta', 16); await save();
  check(D.state.goals[0].current === 16, '目标历史可编辑');
  Views.goalHistoryModal(goal.id); click('tr[data-id] [data-act="delete"]'); click('[data-act="yes"]');
  await until(() => !D.state.goals[0].logs.length, '历史删除');
  await until(() => document.querySelector('.modal-title') || document.querySelector('.modal .empty'), '历史刷新'); UI.closeModal();
  await D.setGoalStatus(goal.id, 'done'); Views._goalFilter.status = 'done'; Views.goals();
  check(document.querySelector('.goal-meta').textContent.includes(U.today() + ' 达成'), '显示真实完成日期');

  await D.commit(() => {
    for (let index = 0; index < 65; index++) D.state.transactions.push({ id: 'csv-' + index, characterId: index < 60 ? 'c1' : 'c2',
      ledger: 'earnings', recordType: 'money', date: '2026-01-05', kind: 'income', currency: 'cash', amount: index,
      category: '捉鬼', note: index === 0 ? '=危险公式' : '导出匹配', createdAt: index });
  });
  D.setCharFilter('c1'); Views._recordFilters.earnings = { ...Views.recordFilter('earnings'), from: '2026-01-05', to: '2026-01-05', kw: '', page: 1 };
  Views.go('transactions'); check(document.querySelectorAll('tr[data-id]').length === 10, '第二页只显示十条');
  check(Views.filteredRecords('earnings').length === 60, '筛选总数含前页');
  click('[data-act="export"]'); await until(() => document.getElementById('toast-root').textContent.includes('导出全部'), 'CSV 导出');

  await D.startSession('c1'); Views._quick.recovering = false;
  D.state.activeSession.startAt -= 3600000;
  Views.go('quick'); Views.quickTick();
  const stats = D.stats;
  D.stats = () => { throw new Error('计时不应扫描历史'); };
  Views.quickTick(); Views._current = 'characters'; Views.quickTick(); D.stats = stats;
  // 改动基础筛选模拟跨午夜：重新汇总一次，随后继续复用。
  Views._current = 'quick'; Views._quickSettled.key = 'previous-day'; Views.quickTick();
  await D.persist();
  return JSON.stringify(D.state);
}

app.whenReady().then(async () => {
  const errors = [];
  let win;
  const deadline = setTimeout(() => { console.error('[features] TIMEOUT', dir); app.exit(1); }, 45000);
  try {
    require('../src/main/ipc').registerIpc({ getWindow: () => win });
    win = await createWindow(errors);
    await win.webContents.executeJavaScript('(' + checks.toString() + ')()', true);
    const csv = fs.readFileSync(csvFile, 'utf8');
    assert.ok(csv.startsWith('\uFEFF'));
    assert.equal(csv.split('\r\n').filter(Boolean).length, 61);
    assert.ok(csv.includes("'=危险公式"));
    assert.ok(!csv.includes('宝石'));
    const backups = fs.readdirSync(dir).filter((name) => name.includes('.before-inventory-'));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, backups[0]))), original);

    const run = (code) => win.webContents.executeJavaScript(code, true);
    const before = await run('JSON.stringify(D.state)');
    const intervalBefore = await run('Views._quick.interval');
    // 真正经过文件选择 IPC 的导入，格式错误应在询问覆盖前被拦截。
    fs.writeFileSync(importFile, JSON.stringify({ 1: 1000 }));
    await run("Views.go('backup'); new Promise(resolve => setTimeout(resolve, 50))");
    await run("document.querySelector('[data-act=import]').click(); new Promise(resolve => setTimeout(resolve, 100))");
    assert.equal(await run('!!document.querySelector(".modal")'), false);
    assert.equal(await run('JSON.stringify(D.state)'), before);
    const target = JSON.parse(before); target.characters[0].name = '导入新档案'; target.activeSession = null;
    fs.writeFileSync(importFile, JSON.stringify(target));
    await run(`window.featurePersist = D.persist; D.persist = async () => { throw new Error('模拟导入失败'); };
      document.querySelector('[data-act=import]').click(); new Promise(resolve => setTimeout(resolve, 100))`);
    await run("document.querySelector('[data-act=yes]').click(); new Promise(resolve => setTimeout(resolve, 100))");
    assert.equal(await run('JSON.stringify(D.state)'), before);
    assert.equal(await run('Views._quick.isOnline'), true);
    assert.equal(await run('Views._quick.interval'), intervalBefore);
    await run("D.persist = window.featurePersist; document.querySelector('[data-act=import]').click(); new Promise(resolve => setTimeout(resolve, 100))");
    await run("document.querySelector('[data-act=yes]').click(); new Promise(resolve => setTimeout(resolve, 150))");
    const imported = JSON.parse(await run('JSON.stringify(D.state)'));
    assert.equal(imported.characters[0].name, '导入新档案'); assert.equal(imported.activeSession, null);
    const importBackups = fs.readdirSync(dir).filter((name) => name.includes('.before-import-'));
    assert.equal(importBackups.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, importBackups[0]))), JSON.parse(before));
    win.setSize(1024, 680);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await run("Views.go('characters'); Views.charModal(D.charById('c1')); document.fonts.ready");
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await run('document.querySelector(".modal").getBoundingClientRect().bottom <= innerHeight'), true);
    await run("document.getElementById('toast-root').replaceChildren(); new Promise(resolve => setTimeout(resolve, 250))");
    fs.writeFileSync(path.join(dir, 'skills-narrow.png'), (await win.webContents.capturePage()).toPNG());
    await run("UI.closeModal(); Views.go('goals'); Views._goalFilter.status='all'; Views.goals(); Views.goalHistoryModal(D.state.goals[0].id)");
    await run('new Promise(resolve => setTimeout(resolve, 250))');
    fs.writeFileSync(path.join(dir, 'goal-history.png'), (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log('[features] PASS: 库存、目标历史、模板/复制、键盘焦点、关闭与未保存、跨页 CSV、计时缓存、导入校验/回滚/自动副本');
    console.log('[features] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) { console.error('[features] FAIL:', error, '\n测试数据：', dir); app.exit(1); }
});
