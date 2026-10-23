'use strict';
/* 真正的 Electron + preload + IPC 测试，所有数据写入临时目录。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-ledger-test-'));
app.setPath('userData', dir);
app.disableHardwareAcceleration();
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
  await until(() => document.querySelectorAll('.nav-item').length === 8, '应用启动');
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
  const result = [];
  check(D.accounts().length === 1 && D.earnings().length === 1, '旧记录账本分配');
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
  Views.go('account'); Views.accountModal();
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
  Views.go('account'); Views.accountModal(equipmentTrade); field('amount', 520); await save();
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
  document.querySelector('[data-range="today"]').click();
  const today = D.txIn('all', U.today(), U.today());
  check(today.every(t => t.date === U.today() && t.ledger === 'earnings'), '日期筛选');
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
