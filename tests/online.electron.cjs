'use strict';
/* 真实窗口、表单及重载恢复，独立临时目录隔离用户数据。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { isolate } = require('./helpers/electron.cjs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = isolate('online');
const original = { schemaVersion: 2, characters: [{ id: 'c1', name: '测试主号' }, { id: 'c2', name: '测试小号' }],
  transactions: [
    { id: 'legacy-online', ledger: 'earnings', recordType: 'money', characterId: 'c1', source: 'quick',
      date: '2020-02-26', kind: 'expense', category: '点卡', currency: 'cash', minutes: 30, amount: 12.34 },
    { id: 'income', ledger: 'earnings', recordType: 'money', characterId: 'c1',
      date: '2020-02-28', kind: 'income', category: '捉鬼', currency: 'cash', minutes: 500, amount: 300 }
  ] };
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(original));

async function checks(phase) {
  const check = (ok, label) => { if (!ok) throw new Error(label); };
  const until = async fn => {
    for (let n = 0; n < 150; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 20)); }
    throw new Error('等待超时：' + document.getElementById('toast-root').textContent);
  };
  const field = (key, value) => {
    const form = document.getElementById('mform');
    const segment = form.querySelector('.seg[data-key="' + key + '"]');
    if (segment) { segment.querySelector('[data-v="' + value + '"]').click(); return; }
    if (form._xcomps[key]) form._xcomps[key].set(value);
    const input = form.querySelector('[name="' + key + '"]');
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const save = async () => {
    document.querySelector('.modal [data-act="ok"]').click();
    await until(() => !document.querySelector('.modal'));
  };
  await until(() => document.querySelectorAll('.nav-item').length === 7);
  if (phase === 'forms') {
    check(D.state.sessions.length === 1 && D.state.sessions[0].cost === 12.34, '版本 2 迁移保留旧在线费用');
    Views.go('quick');
    check(document.querySelector('[data-range="today"]').classList.contains('on'), '收益首页默认本日');
    document.querySelector('[data-act="add-online"]').click();
    field('mode', 'duration'); field('date', '2020-02-28'); field('hours', 3); field('extraMinutes', 0);
    field('accounts', 5); field('cardPrice', 15000); field('note', '手动三小时');
    check(document.querySelector('.online-preview').textContent.includes('135 万'), '时长补记实时预览费用');
    await save();
    const manual = D.state.sessions.find(s => s.note === '手动三小时');
    check(manual && manual.minutes === 180 && manual.cost === 135, '时长补记保存');
    document.querySelector('[data-range="all"]').click();
    check(document.querySelector('[data-session="' + manual.id + '"]'), '最近在线记录可编辑');
    document.querySelector('[data-session="' + manual.id + '"] [data-session-act="edit"]').click();
    field('hours', 2); await save();
    check(D.state.transactions.find(t => t.sessionId === manual.id).amount === 90, '在线编辑更新点卡成本');
    document.getElementById('ledger-records').click();
    const tx = D.state.transactions.find(t => t.sessionId === manual.id);
    check(!document.querySelector('[data-id="' + tx.id + '"] [data-act="move"]'), '关联点卡不能转入账号账本');
    document.querySelector('[data-id="' + tx.id + '"] [data-act="edit"]').click();
    check(document.querySelector('.modal h3').textContent === '编辑在线记录', '流水编辑进入在线表单');
    field('hours', 3); await save();
    check(D.state.transactions.filter(t => t.sessionId === manual.id).length === 1, '编辑不重复生成流水');
    document.querySelector('[data-earnings-tab="onlineRecords"]').click();
    check(document.querySelector('.nav-item.on').dataset.page === 'quick', '在线列表归属收益模块');
    document.querySelector('[data-range="all"]').click();
    document.querySelector('[data-session="' + manual.id + '"] [data-session-act="delete"]').click();
    document.querySelector('.modal [data-act="yes"]').click();
    await until(() => !document.querySelector('.modal') && !D.state.sessions.some(s => s.id === manual.id));
    check(!D.state.transactions.some(t => t.sessionId === manual.id), '删除同步移除点卡成本');
    document.querySelector('[data-add-online]').click();
    field('startDate', '2020-02-28'); field('startTime', '23:30:00');
    field('endDate', '2020-02-29'); field('endTime', '01:30:00');
    field('accounts', 5); field('cardPrice', 15000); field('note', '跨天在线');
    await save();
    const cross = D.state.sessions.find(s => s.note === '跨天在线');
    check(cross.minutes === 120 && cross.cost === 90, '跨天补记');
    check(D.txIn('all', '2020-02-28', '2020-02-28').find(t => t.sessionId === cross.id).amount === 22.5, '跨天成本分摊到正确日期');
    Views.go('quick'); Views._quickRange = { preset: 'custom', from: '2020-02-28', to: '2020-02-28' }; Views.rerender();
    check(document.getElementById('quick-h').textContent === '0.50 小时' && document.getElementById('quick-card').textContent === '22.50 万', '收益自定义日期筛选在线统计');
    check(document.getElementById('quick-hourly').textContent === '555 万/时', '净时薪使用独立在线时长');
    Views._dashboardRanges.earnings = { preset: 'custom', from: '2020-02-28', to: '2020-02-28' }; Views.go('dashboard');
    check(document.querySelector('.earnings-stats .stat:last-child .v').textContent === '555 万/时', '总览在线时薪口径一致');
    Views.go('quick'); document.querySelector('[data-act="add-online"]').click();
    field('startDate', '2020-02-28'); field('startTime', '23:45:00'); field('endDate', '2020-02-29'); field('endTime', '00:30:00');
    document.querySelector('.modal [data-act="ok"]').click();
    check(!!document.querySelector('.modal') && document.getElementById('toast-root').textContent.includes('重叠'), '补记重叠时段被拦截'); UI.closeModal();
    D.setCharFilter('c1'); Views._quickRange = { preset: 'today' }; Views.rerender();
    await Views.quickStart();
    const activeId = D.state.activeSession.id;
    const twoHoursAgo = Date.now() - 7200000;
    document.querySelector('[data-act="adjust-start"]').click();
    field('startDate', U.fmtDate(new Date(twoHoursAgo))); field('startTime', Views.onlineTime(twoHoursAgo)); await save();
    check(D.state.activeSession.id === activeId && Date.now() - D.state.activeSession.startAt >= 7200000, '计时中调整开始时间');
    document.querySelector('[data-act="accounts"]').click(); field('accounts', 1); field('cardPrice', 20000); await save();
    D.setCharFilter('c2'); Views.rerender();
    check(D.state.activeSession.characterId === 'c1' && D.state.activeSession.accounts === 5 &&
      D.state.activeSession.cardPrice === 15000, '切换角色与设置不改变本次计时参数');
    check(document.getElementById('quick-h').textContent === '0.00 小时', '当前角色统计排除其他角色正在计时');
    await D.persist();
    return { activeId, snapshot: JSON.stringify(D.state) };
  }
  await until(() => document.querySelector('[data-recover="continue"]'));
  check(Views._quick.recovering && !Views._quick.isOnline && !Views._quick.interval, '重载后等待用户处理，未自动续计');
  check(D.state.activeSession.characterId === 'c1' && D.state.activeSession.accounts === 5, '重载恢复完整参数');
  if (phase === 'continue') {
    document.querySelector('[data-recover="continue"]').click();
    check(Views._quick.isOnline && !!Views._quick.interval, '用户选择继续计时');
    Dev.saveSnapshot(true);
    Views.clearQuickTimer(); Views._quick.recovering = true; Dev.restore();
    check(Views._quick.isOnline && !!Views._quick.interval, '开发热刷新一次性续计');
    Views.clearQuickTimer(); Views._quick.recovering = true; Dev.restore();
    check(!Views._quick.isOnline && !Views._quick.interval, '热刷新快照已消耗，后续异常重启不能静默续计');
    return { activeId: D.state.activeSession.id };
  }
  document.querySelector('[data-recover="finish"]').click();
  const active = D.state.activeSession;
  const endAt = active.startAt + 3600000;
  field('endDate', U.fmtDate(new Date(endAt))); field('endTime', Views.onlineTime(endAt));
  const button = document.querySelector('.modal [data-act="ok"]'); button.click(); button.click();
  await until(() => !document.querySelector('.modal'));
  const finished = D.state.sessions.find(s => s.id === active.id);
  check(!D.state.activeSession && !Views._quick.isOnline && !Views._quick.interval, '补填实际结束时间后停止计时');
  check(finished.minutes === 60 && finished.cost === 45 && finished.characterId === 'c1' && finished.source === 'timer', '补填使用原价格和角色，未计入离线时间');
  check(D.state.sessions.filter(s => s.id === active.id).length === 1, '重复点击只保存一次');
  D.setCharFilter('all'); Views.go('quick');
  return { snapshot: JSON.stringify(D.state) };
}

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({ show: false, width: 1280, height: 840,
    webPreferences: { preload: path.join(root, 'src/preload/preload.js'), contextIsolation: true, nodeIntegration: false } });
  try {
    require('../src/main/ipc').registerIpc({ getWindow: () => win });
    win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
    await win.loadFile(path.join(root, 'src/renderer/index.html'));
    const run = phase => win.webContents.executeJavaScript('(' + checks.toString() + ')(' + JSON.stringify(phase) + ')', true);
    const first = await run('forms');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))).activeSession.id, first.activeId);
    for (const phase of ['continue', 'finish']) {
      const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
      win.webContents.reload(); await loaded;
      const result = await run(phase);
      if (phase === 'continue') assert.equal(result.activeId, first.activeId);
      else assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), JSON.parse(result.snapshot));
    }
    const backups = fs.readdirSync(dir).filter(n => n.includes('.before-online-'));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, backups[0]))), original);
    assert.deepEqual(errors, []);
    console.log('[online] PASS: 手动补记、预览、关联编辑删除、跨天、时薪、筛选、重叠校验、参数快照');
    console.log('[online] PASS: 两次真实重载恢复、继续与补填结束、重复提交、版本 2 自动备份及 IPC 落盘');
    win.close(); app.exit(0);
  } catch (error) {
    console.error('[online] FAIL:', error); console.error('测试数据保留于', dir); app.exit(1);
  }
});
