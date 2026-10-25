'use strict';
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isolate, createWindow } = require('./helpers/electron.cjs');
const dir = isolate('character-history');
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ characters: [
  { id: 'c1', name: '轻舟', school: '大唐官府', level: 109, progress: {
    schoolSkills: [{ name: '为官之道', level: 119 }], training: { attack: 17 }, petTraining: { attack: 15 },
    qianyuanPills: 3, potentialFruits: 100,
  } },
  { id: 'c2', name: '山月', school: '大唐官府', progress: { qianyuanPills: 6 } },
] }));

async function flows() {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const until = async (predicate, label) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('等待失败：' + label);
  };
  const click = (selector) => {
    const element = document.querySelector(selector);
    check(element, '找不到控件：' + selector); element.click();
  };
  const field = (key, value) => {
    const form = document.getElementById('mform');
    if (form._xcomps[key]) form._xcomps[key].set(value);
    const input = form.querySelector('[name="' + key + '"]');
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const cardAction = (action) => click('.char-card[data-id="c1"] [data-act="' + action + '"]');
  const chooseRole = (id) => {
    click('[data-history="character"] button'); click('.xpop [data-v="' + id + '"]');
  };
  const chooseDate = (key, date) => {
    click('[data-history="range"] [data-date="' + key + '"] button');
    const desired = U.parseDate(date);
    const target = desired.getFullYear() * 12 + desired.getMonth();
    for (let i = 0; i < 24; i++) {
      const parts = document.querySelector('.xcal-title').textContent.match(/\d+/g).map(Number);
      const current = parts[0] * 12 + parts[1] - 1;
      if (current === target) break;
      click('.xpop [data-nav="' + (current > target ? '-1' : '1') + '"]');
    }
    click('.xpop [data-d="' + date + '"]');
  };
  await until(() => document.querySelectorAll('.nav-item').length === 7, '启动');
  Views.go('characters'); await document.fonts.ready;
  check(!document.getElementById('character-history').hidden, '顶栏养成记录入口');
  cardAction('history');
  check(document.querySelector('.char-history-modal .empty').textContent.includes('还没有养成记录'), '无历史时引导');
  check(!document.querySelector('select'), '复用统一下拉');
  UI.closeModal();
  check(document.activeElement.matches('.char-card[data-id="c1"] [data-act="history"]'), '关闭返回卡片入口');
  cardAction('edit');
  check(document.querySelector('[name="changeDate"]').value === U.today(), '变更日期默认本日');
  field('level', 110); field('training_attack', 18); field('petTraining_attack', 16);
  field('qianyuanPills', 4); field('potentialFruits', 105);
  document.querySelector('[name="skillLevel"]').value = 120;
  field('changeDate', '2026-01-02'); field('changeNote', '<b>周末提升</b>');
  const persist = D.persist, before = JSON.stringify(D.state);
  D.persist = async () => { throw new Error('历史写入失败'); };
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('历史写入失败'), '写入失败提示');
  check(JSON.stringify(D.state) === before && document.querySelector('[name="changeNote"]').value.includes('周末'), '失败回滚且保留草稿');
  D.persist = persist; click('.modal [data-act="ok"]');
  await until(() => !document.querySelector('.modal'), '重试保存');
  check(D.charById('c1').growthHistory.length === 1 && D.charById('c1').growthHistory[0].changes.length === 6, '一次保存只产生一条完整记录');
  cardAction('history');
  check(document.querySelector('time').textContent === '2026-01-02' && document.querySelectorAll('.char-history-changes li').length === 6, '按指定日期显示全部变化');
  check(document.querySelector('.char-history-values').textContent.includes('109级 → 110级') &&
    document.querySelectorAll('.char-history-kind.is-increase').length === 6, '原值新值和提升标记');
  check(document.querySelector('.char-history-note').textContent === '<b>周末提升</b>' && !document.querySelector('.char-history-note b'), '历史说明安全转义');
  click('[data-history="range"] [data-range="today"]');
  check(document.querySelector('[data-history="records"] .empty').textContent.includes('此时间范围'), '日期筛选及空态');
  check(document.activeElement.dataset.range === 'today', '快捷日期切换保留键盘焦点');
  UI.closeModal();

  await D.copyCharacterProgress('c1', 'c2', ['qianyuanPills']);
  for (let i = 7; i < 20; i++) await D.saveCharacterProgress('c2', { qianyuanPills: i }, { date: '2026-01-03' });
  click('#character-history');
  check(document.querySelectorAll('.char-history-entry').length === 12 && document.querySelector('.ledger-pagination').textContent.includes('共 15 次变更'), '全部角色及分页');
  check(document.querySelector('.char-history-entry').textContent.includes('复制自 山月'), '复制来源显示');
  click('[data-page="next"]');
  check(document.querySelectorAll('.char-history-entry').length === 3 && document.querySelector('[data-page="next"]').disabled, '末页边界');
  check(document.activeElement.dataset.page === 'previous', '末页焦点回到可用翻页按钮');
  chooseRole('c1');
  check(document.querySelectorAll('.char-history-entry').length === 2, '角色过滤及分页复位');
  chooseDate('from', '2026-01-02'); chooseDate('to', '2026-01-02');
  check(document.querySelectorAll('.char-history-entry').length === 1 && document.querySelector('time').textContent === '2026-01-02', '自定义日期包含两端');
  check(!document.querySelector('[data-range].on'), '自选日期取消快捷项');
  chooseDate('to', '2026-01-01');
  check(document.querySelector('[data-date="to"] input').value === '2026-01-02' && document.querySelectorAll('.char-history-entry').length === 1, '反向区间保留原筛选');
  chooseRole('c2');
  check(document.querySelector('[data-history="records"] .empty'), '角色与日期组合筛选');
  click('[data-range="all"]');
  check(document.querySelectorAll('.char-history-entry').length === 12, '切回全部时间');
  check(D.charFilter === 'all', '记录筛选不污染页面角色筛选');
  UI.closeModal();
  check(document.activeElement.id === 'character-history', '全局入口恢复焦点');
  Views.go('equipment'); check(document.getElementById('character-history').hidden, '其他页面隐藏入口');
  Views.go('characters');
  return JSON.stringify(D.state);
}

async function layout() {
  const modal = document.querySelector('.modal'), body = modal.querySelector('.modal-body');
  if (modal.scrollWidth > modal.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1) throw new Error('历史弹窗横向溢出');
  const bounds = modal.getBoundingClientRect();
  if (bounds.left < 0 || bounds.right > innerWidth || bounds.top < 0 || bounds.bottom > innerHeight) throw new Error('历史弹窗超出窗口');
  if (!document.querySelector('.char-history-entry') || !body.scrollHeight) throw new Error('历史内容未渲染');
}

app.whenReady().then(async () => {
  const errors = [];
  let win;
  require('../src/main/ipc').registerIpc({ getWindow: () => win });
  win = await createWindow(errors);
  const deadline = setTimeout(() => { console.error('[character-history] TIMEOUT', dir); app.exit(1); }, 45000);
  try {
    const snapshot = await win.webContents.executeJavaScript('(' + flows.toString() + ')()', true);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')), JSON.parse(snapshot));
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded;
    const restored = await win.webContents.executeJavaScript(`new Promise(resolve => {
      const check = () => document.querySelectorAll('.nav-item').length ? resolve(JSON.stringify(D.state)) : setTimeout(check, 20); check();
    })`, true);
    assert.deepEqual(JSON.parse(restored), JSON.parse(snapshot));
    await win.webContents.executeJavaScript("Views.go('characters'); Views.charHistoryModal('c1'); document.getElementById('toast-root').replaceChildren()", true);
    for (const [width, height, name] of [[1280, 840, 'wide'], [1024, 680, 'narrow'], [560, 760, 'compact']]) {
      win.setSize(width, height);
      await new Promise((resolve) => setTimeout(resolve, 150));
      await win.webContents.executeJavaScript('(' + layout.toString() + ')()', true);
      fs.writeFileSync(path.join(dir, 'character-history-' + name + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    assert.deepEqual(errors, []);
    console.log('[character-history] PASS: 自动快照、补记日期、写入回滚重试、角色/日期筛选、复制来源、分页、焦点、重启和窄窗口');
    console.log('[character-history] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) { console.error('[character-history] FAIL:', error, '\n测试数据:', dir); app.exit(1); }
});
