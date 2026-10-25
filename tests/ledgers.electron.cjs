'use strict';
/* 真正的 Electron + preload + IPC 测试，所有数据写入临时目录。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { isolate } = require('./helpers/electron.cjs');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = isolate('ledgers');
const legacy = {
  characters: [{ id: 'c1', name: '测试角色', school: '大唐官府' }, { id: 'c2', name: '测试小号' }],
  transactions: [
    { id: 'daily', characterId: 'c1', date: '2026-10-01', kind: 'income', currency: 'cash', amount: 100, category: '捉鬼' },
    { id: 'gear', characterId: 'c1', date: '2026-10-01', kind: 'expense', currency: 'cash', amount: 620, category: '装备购入', note: '装备「测试刀」购入' }
  ],
  equipment: [{ id: 'eq', characterId: 'c1', name: '测试刀', slot: '武器', status: 'active' }],
  gearLogs: [{ id: 'log', characterId: 'c1', equipmentId: 'eq', date: '2026-10-01', action: 'buy', amount: 620 }]
};
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(legacy));
let win;
const errors = [];
async function rendererChecks() {
  const check = function (ok, msg) { if (!ok) throw new Error(msg); };
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const until = async (fn, label) => {
    for (let n = 0; n < 150; n++) { if (fn()) return; await pause(20); }
    throw new Error('等待失败：' + label + ' / ' + document.getElementById('toast-root').innerText);
  };
  await until(() => document.querySelectorAll('.nav-item').length === 7, '应用启动');
  const field = function (key, value) {
    const form = document.getElementById('mform');
    const seg = form.querySelector('.seg[data-key="' + key + '"]');
    if (seg) { seg.querySelector('[data-v="' + value + '"]').click(); return; }
    if (form._xcomps[key]) form._xcomps[key].set(value);
    const input = form.querySelector('[name="' + key + '"]');
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const save = async function () {
    document.querySelector('.modal [data-act="ok"]').click();
    await until(() => !document.querySelector('.modal'), '表单保存');
  };
  const rangeDate = function (selector, key, date) {
    document.querySelector(selector + ' [data-date="' + key + '"] button').click();
    if (!date) { document.querySelector('.xpop [data-q="clear"]').click(); return; }
    const wanted = U.parseDate(date);
    const current = document.querySelector('.xcal-title').textContent.match(/\d+/g).map(Number);
    const months = (wanted.getFullYear() - current[0]) * 12 + wanted.getMonth() + 1 - current[1];
    for (let n = 0; n < Math.abs(months); n++) {
      document.querySelector('.xpop [data-nav="' + Math.sign(months) + '"]').click();
    }
    document.querySelector('.xpop [data-d="' + date + '"]').click();
  };
  const result = [];
  check(D.accounts().length === 1 && D.earnings().length === 1, '旧记录账本分配');
  check(Array.from(document.querySelectorAll('.nav-item')).map(n => n.textContent.trim()).join('/') === '总览/收益/账号/目标/装备/角色/备份与设置', '侧栏仅保留模块入口');
  Views.go('dashboard');
  check(document.getElementById('quick-add').hidden && document.getElementById('ledger-records').hidden, '总览没有记账按钮');
  document.querySelector('#view [data-page="quick"]').click();
  check(!!document.querySelector('.quick-item') && !document.getElementById('quick-add').hidden, '总览进入收益快速记录');
  await Views.quickStart();
  document.getElementById('ledger-records').click();
  check(!!document.querySelector('table.tbl') && document.querySelector('.nav-item.on').dataset.page === 'quick', '收益列表归属收益模块');
  const search = document.querySelector('[data-f="kw"]');
  search.value = '捉鬼'; search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  document.getElementById('ledger-records').click();
  check(!!document.querySelector('.quick-item') && Views._quick.isOnline, '列表返回保留在线计时');
  document.getElementById('ledger-records').click();
  check(document.querySelector('[data-f="kw"]').value === '捉鬼', '重新打开列表保留筛选');
  document.querySelector('[data-act="reset"]').click();
  document.querySelector('#nav [data-page="account"]').click();
  check(document.querySelectorAll('[data-shortcut]').length === 9, '账号默认进入快捷记账');
  for (const [id, category, kind, currency, channel] of [
    ['topup', '点卡充值', 'expense', 'rmb', '官方充值'],
    ['gear-sell', '装备交易', 'income', 'rmb', '藏宝阁'],
    ['coin-buy', '游戏币买入', 'expense', 'rmb', '游戏内'],
    ['progress', '养成投入', 'expense', 'cash', '游戏内']
  ]) {
    document.querySelector('[data-shortcut="' + id + '"]').click();
    const form = document.getElementById('mform');
    check(form._xcomps.category.get() === category && form._xcomps.channel.get() === channel &&
      form.querySelector('[data-key="kind"]').dataset.val === kind && form.querySelector('[data-key="currency"]').dataset.val === currency, '快捷表单预填：' + id);
    UI.closeModal();
  }
  document.getElementById('ledger-records').click();
  check(!!document.querySelector('table.tbl') && document.querySelector('.nav-item.on').dataset.page === 'account', '账号列表归属账号模块');
  document.getElementById('ledger-records').click();
  check(!!document.querySelector('[data-shortcut]') && Views._quick.isOnline, '账号列表返回与跨模块计时');
  Views.go('quick'); await Views.quickStop();
  result.push('双模块导航、列表返回、筛选保留、快捷表单与跨页计时');
  Views.go('transactions'); Views.txModal();
  field('recordType', 'item'); field('itemName', '测试金刚石'); field('quantity', 2); field('unitPrice', 150);
  await save();
  let item = D.earnings().find(t => t.itemName === '测试金刚石');
  check(item && item.quantity === 2 && D.stats(D.earnings()).income === 100 && D.stats(D.earnings()).itemEstimate === 300, '物品获得只计估值');
  result.push('物品表单新增与估值');
  document.querySelector('tr[data-id="' + item.id + '"] [data-act="sell"]').click();
  field('amount', 280); await save();
  check(D.stats(D.earnings()).income === 380 && D.stats(D.earnings()).itemEstimate === 0, '实际成交收入');
  const saleId = item.saleId;
  document.querySelector('tr[data-id="' + saleId + '"] [data-act="del"]').click();
  await until(() => document.querySelector('.modal [data-act="yes"]'), '删除确认');
  document.querySelector('.modal [data-act="yes"]').click();
  await until(() => !D.state.transactions.some(t => t.id === saleId) && !document.querySelector('.modal'), '撤销出售');
  check(item.status === 'held' && D.stats(D.earnings()).income === 100, '撤销恢复持有');
  result.push('物品出售与撤销');
  Views.go('accountRecords'); Views.accountModal();
  field('kind', 'income'); field('amount', 450); field('fee', 20); field('equipmentId', 'eq'); field('note', '测试藏宝阁卖刀');
  await save();
  const trade = D.accounts().find(t => t.note === '测试藏宝阁卖刀');
  check(trade && D.accountStats(D.accounts(), 'rmb').income === 430, '人民币手续费');
  check(D.state.equipment[0].status === 'sold' && D.gearLogsOf('eq').some(l => l.transactionId === trade.id && l.currency === 'rmb'), '装备关联');
  check(D.stats(D.earnings()).income === 100, '账号收入不进入日常收益');
  Views.accountModal(trade); field('amount', 500); await save();
  check(D.gearLogsOf('eq').filter(l => l.transactionId === trade.id).length === 1 && D.accountStats(D.accounts(), 'rmb').income === 480, '编辑更新关联时间线');
  result.push('账号人民币手续费、装备关联及编辑');
  document.querySelector('tr[data-id="' + trade.id + '"] [data-act="del"]').click();
  await until(() => document.querySelector('.modal [data-act="yes"]'), '删除装备交易');
  document.querySelector('.modal [data-act="yes"]').click();
  await until(() => !D.state.transactions.some(t => t.id === trade.id), '交易删除完成');
  check(D.state.equipment[0].status === 'active', '删除售出交易恢复装备状态');
  Views.go('equipment'); Views.gearLogModal(D.state.equipment[0]);
  field('action', 'sell'); field('currency', 'rmb'); field('amount', 500); field('note', '装备页同步售出'); await save();
  const equipmentTrade = D.accounts().find(t => t.note === '装备页同步售出');
  check(equipmentTrade && equipmentTrade.gearAction === 'sell', '装备页同步账号流水');
  Views.go('accountRecords'); Views.accountModal(equipmentTrade); field('amount', 520); await save();
  check(D.accountStats(D.accounts(), 'rmb').income === 520 && D.gearLogsOf('eq').find(l => l.transactionId === equipmentTrade.id).amount === 520, '装备页生成的出售流水可编辑');
  Views.accountModal(); field('category', '点卡充值'); field('amount', 100); field('note', '充值校验'); await save();
  const recharge = D.accounts().find(t => t.note === '充值校验');
  check(recharge.currency === 'rmb' && recharge.channel === '官方充值' && recharge.kind === 'expense', '充值默认渠道');
  result.push('装备页同步交易的编辑、点卡充值');
  Views.go('transactions'); Views.txModal(); field('amount', 30); field('note', '可调整归属'); await save();
  const money = D.earnings().find(t => t.note === '可调整归属');
  document.querySelector('tr[data-id="' + money.id + '"] [data-act="move"]').click(); await save();
  check(money.ledger === 'account' && D.accountStats(D.accounts(), 'cash').income === 30, '手动转账本');
  result.push('交易删除恢复及手动调整归属');
  D.setItemPrice(8, 1500000); D.setItemPrice(99, 100000);
  Views.go('quick'); await Views.quickAddLoot(Views.quickItemById(8));
  check(D.earnings().at(-1).recordType === 'item', '快速物品分录');
  await Views.quickAddLoot(Views.quickItemById(99));
  check(D.earnings().at(-1).recordType === 'money', '金币作为实际游戏币');
  result.push('快速记录分流');
  Views.go('dashboard');
  check(document.querySelectorAll('[data-ledger]').length === 2, '总览独立分区');
  const earningsFilter = '[data-ledger="earnings"] [data-range-filter]';
  const accountFilter = '[data-ledger="account"] [data-range-filter]';
  const selectedPreset = selector => document.querySelector(selector + ' .seg-btn.on')?.dataset.range;
  const dateValue = (selector, key) => document.querySelector(selector + ' [data-date="' + key + '"] input').value;
  check(selectedPreset(earningsFilter) === 'today' && selectedPreset(accountFilter) === 'month', '总览收益默认本日、账号默认本月');
  check(dateValue(earningsFilter, 'from') === U.today() && dateValue(accountFilter, 'to') === U.rangeFor('month').to, '默认快捷项同步日期');
  const monthStart = U.rangeFor('month').from;
  const from = U.addDays(monthStart, -2), to = U.addDays(monthStart, -1);
  const fixtures = [
    { id: 'range-e-before', ledger: 'earnings', date: U.addDays(from, -1), kind: 'income', amount: 101 },
    { id: 'range-e-from', ledger: 'earnings', date: from, kind: 'income', amount: 7 },
    { id: 'range-e-to', ledger: 'earnings', date: to, kind: 'income', amount: 9 },
    { id: 'range-e-after', ledger: 'earnings', date: monthStart, kind: 'income', amount: 103 },
    { id: 'range-a-before', ledger: 'account', date: U.addDays(from, -1), kind: 'expense', amount: 101, currency: 'rmb' },
    { id: 'range-a-from', ledger: 'account', date: from, kind: 'expense', amount: 11, fee: 1, currency: 'rmb' },
    { id: 'range-a-to', ledger: 'account', date: to, kind: 'income', amount: 31, fee: 2, currency: 'rmb' },
    { id: 'range-a-after', ledger: 'account', date: monthStart, kind: 'expense', amount: 103, currency: 'rmb' },
    { id: 'range-a-cash', ledger: 'account', date: to, kind: 'income', amount: 23 },
    { id: 'range-a-c2', ledger: 'account', characterId: 'c2', date: from, kind: 'expense', amount: 5, currency: 'rmb' }
  ].map(t => Object.assign({ characterId: 'c1', currency: 'cash', category: '范围测试', recordType: 'money', note: t.id }, t));
  D.state.transactions.push(...fixtures); Views.rerender();
  const heldEstimate = document.querySelector('.earnings-stats .stat.hi .v').textContent;
  rangeDate(earningsFilter, 'from', from); rangeDate(earningsFilter, 'to', to);
  check(!selectedPreset(earningsFilter) && selectedPreset(accountFilter) === 'month', '自定义收益范围不改变账号范围');
  check(document.querySelector('.earnings-stats .stat.good .v').textContent === U.fmtMoney(16), '自定义收益包含起止两天、排除范围外记录');
  check(document.querySelector('.earnings-stats .stat.hi .v').textContent === heldEstimate, '持有估值保持当前资产口径');
  check(document.querySelector('[data-ledger="earnings"]').textContent.includes('range-e-to') &&
    !document.querySelector('[data-ledger="earnings"]').textContent.includes('range-e-before'), '最近收益记录同步范围');
  const invalidState = JSON.stringify(Views._dashboardRanges.earnings);
  rangeDate(earningsFilter, 'from', U.addDays(to, 1));
  check(JSON.stringify(Views._dashboardRanges.earnings) === invalidState && dateValue(earningsFilter, 'from') === from &&
    document.getElementById('toast-root').textContent.includes('开始日期不能晚于结束日期'), '反向区间提示并还原日期');
  rangeDate(accountFilter, 'from', from); rangeDate(accountFilter, 'to', to);
  check(document.querySelector('[data-ledger="account"] .stat.bad .v').textContent === U.fmtAmount(17, 'rmb'), '账号自定义支出含手续费、角色及起止边界');
  check(document.querySelector('[data-ledger="account"] .stat.good .v').textContent === U.fmtAmount(29, 'rmb'), '账号自定义收入扣除手续费');
  check(document.querySelectorAll('[data-ledger="account"] .account-overview .stat.good .v')[1].textContent === U.fmtMoney(23), '账号自定义范围按币种汇总');
  check(document.querySelector('[data-ledger="account"] .bar-col:last-child').title.startsWith(to), '趋势使用账号自己的结束日期');
  D.setCharFilter('c1'); Views.rerender();
  check(document.querySelector('[data-ledger="account"] .stat.bad .v').textContent === U.fmtAmount(12, 'rmb') &&
    dateValue(accountFilter, 'from') === from, '切换角色保留日期范围并刷新统计');
  D.setCharFilter('all'); Views.go('account');
  const homeFilter = '[data-range-filter="account"]';
  check(selectedPreset(homeFilter) === 'month', '账号首页独立默认本月');
  rangeDate(homeFilter, 'from', from); rangeDate(homeFilter, 'to', to);
  check(document.querySelector('.account-quick-totals .stat.bad .v').textContent === U.fmtAmount(17, 'rmb'), '账号首页自定义范围刷新统计');
  Views.accountModal(D.accounts().find(t => t.id === 'range-a-from'));
  field('amount', 15); await save();
  check(dateValue(homeFilter, 'to') === to && !selectedPreset(homeFilter) &&
    document.querySelector('.account-quick-totals .stat.bad .v').textContent === U.fmtAmount(21, 'rmb'), '编辑保存后保留自定义统计范围');
  document.getElementById('ledger-records').click(); document.getElementById('ledger-records').click();
  check(dateValue(homeFilter, 'from') === from, '列表返回保留账号首页时间范围');
  Views.go('dashboard');
  check(dateValue(earningsFilter, 'from') === from && dateValue(accountFilter, 'to') === to, '跨页面保留总览两区范围');
  rangeDate(earningsFilter, 'from', '');
  check(dateValue(earningsFilter, 'from') === '' && dateValue(earningsFilter, 'to') === to, '支持只设结束日期');
  document.querySelector(earningsFilter + ' [data-range="all"]').click();
  check(dateValue(earningsFilter, 'from') === '' && dateValue(earningsFilter, 'to') === '', '全部时间清空起止日期');
  for (const preset of ['week', 'month', 'year', 'today']) {
    document.querySelector(earningsFilter + ' [data-range="' + preset + '"]').click();
    const expected = U.rangeFor(preset);
    check(dateValue(earningsFilter, 'from') === expected.from && dateValue(earningsFilter, 'to') === expected.to, '快捷选择同步日期：' + preset);
  }
  check(dateValue(accountFilter, 'to') === to, '快捷收益筛选不修改账号日期');
  D.state.transactions = D.state.transactions.filter(t => !fixtures.some(f => f.id === t.id));
  result.push('独立默认时间、自定义边界、反向区间、分币种、角色筛选、保存与跨页保留');
  D.setCharFilter('c2'); Views.rerender();
  check(D.txIn(D.charFilter, '', '').length === 0 && D.txIn(D.charFilter, '', '', 'account').length === 0, '角色筛选');
  D.setCharFilter('all'); Views.go('transactions'); Views.txModal();
  document.querySelector('[data-xmount="date"] button').click();
  const currentMonth = document.querySelector('.xcal-title').textContent;
  document.querySelector('[data-nav="-1"]').click();
  check(document.querySelector('.xcal-title').textContent !== currentMonth, '日历可切换月份');
  UI.closeModal();
  Views.txModal(); field('amount', -1); document.querySelector('.modal [data-act="ok"]').click();
  check(!!document.querySelector('.modal'), '无效金额被拦截'); UI.closeModal();
  result.push('总览日期与角色筛选、日历及金额校验');
  Views.go('account');
  document.querySelector('[data-range="month"]').click();
  const month = U.rangeFor('month');
  const before = D.accountStats(D.txIn('all', month.from, month.to, 'account'), 'rmb').expense;
  const earningsBefore = JSON.stringify(D.stats(D.earnings()));
  document.querySelector('[data-shortcut="topup"]').click();
  field('amount', 50); field('fee', 2); field('note', '快捷充值'); await save();
  const quickRecharge = D.accounts().find(t => t.note === '快捷充值');
  check(quickRecharge && quickRecharge.currency === 'rmb' && quickRecharge.channel === '官方充值', '快捷记账写入账号账本');
  check(JSON.stringify(D.stats(D.earnings())) === earningsBefore, '快捷账号记账不影响日常收益');
  check(document.querySelector('.account-quick-totals .stat.bad .v').textContent === U.fmtAmount(before + 52, 'rmb'), '快捷记账刷新本月实付金额');
  document.querySelector('[data-record="' + quickRecharge.id + '"]').click();
  field('amount', 60); await save();
  check(quickRecharge.amount === 60 && document.querySelector('.account-quick-totals .stat.bad .v').textContent === U.fmtAmount(before + 62, 'rmb'), '最近记录可编辑并刷新汇总');
  document.querySelector('#char-select-mount button').click();
  document.querySelector('.xitem[data-v="c2"]').click();
  check(!document.querySelector('[data-record]') && document.querySelector('.account-quick-totals .stat.bad .v').textContent === U.fmtAmount(0, 'rmb'), '账号快速页按角色筛选');
  document.querySelector('[data-shortcut="pet-buy"]').click();
  check(document.getElementById('mform')._xcomps.characterId.get() === 'c2', '快捷记账默认选中筛选角色'); UI.closeModal();
  D.setCharFilter('all'); Views.rerender();
  document.getElementById('ledger-records').click();
  check(!!document.querySelector('tr[data-id="' + quickRecharge.id + '"]'), '快捷记录可在完整列表管理');
  Dev.saveSnapshot(); Views._current = 'dashboard'; Dev.restore(); Views.go(Views._current);
  check(document.querySelector('.nav-item.on').dataset.page === 'account' && !!document.querySelector('table.tbl'), '热更新快照恢复模块内列表');
  result.push('账号快捷记账、最近记录编辑、分币种汇总、角色筛选与列表恢复');
  await D.persist();
  return { checks: result, count: D.state.transactions.length, snapshot: JSON.stringify(D.state) };
}
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ show: false, width: 1280, height: 840, webPreferences: { preload: path.join(root, 'src/preload/preload.js'), contextIsolation: true, nodeIntegration: false } });
    require('../src/main/ipc').registerIpc({ getWindow: () => win });
    win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
    await win.loadFile(path.join(root, 'src/renderer/index.html'));
    // 快速记录首次使用时有有效单价。
    const result = await win.webContents.executeJavaScript('(' + rendererChecks.toString() + ')()', true);
    const disk = JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8'));
    assert.deepEqual(disk, JSON.parse(result.snapshot));
    const backups = fs.readdirSync(dir).filter(n => n.includes('.before-ledgers-'));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, backups[0]), 'utf8')), legacy);
    assert.deepEqual(errors, []);
    console.log('[electron] PASS:', result.checks.join('；'));
    console.log('[electron] PASS: 自动备份完整、IPC 落盘与内存一致、无页面错误');
    win.close(); app.exit(0);
  } catch (e) {
    console.error('[electron] FAIL:', e); console.error('测试数据保留于', dir);
    app.exit(1);
  }
});
