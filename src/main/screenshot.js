'use strict';
/* 开发辅助：--smoke 冒烟自检 / --screenshot 注入示例数据并截图到 docs/screenshots */
const path = require('path');
const fs = require('fs');

const isSmoke = process.argv.includes('--smoke');
const isShot = process.argv.includes('--screenshot');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 截图模式：注入内存示例数据（不落盘），依次截取页面 */
const seedJs = `(function () {
  var cid = 'demo1', now = Date.now();
  function d(n) { var t = new Date(); t.setDate(t.getDate() - n); return U.fmtDate(t); }
  function tx(n, kind, cat, amt, m, note) {
    return { id: U.uid(), characterId: cid, date: d(n), kind: kind, currency: 'cash', amount: amt, category: cat, minutes: m || 0, note: note || '', createdAt: now - n };
  }
  D.state = {
    characters: [{ id: cid, name: '养老一号', level: 69, school: '大唐官府', server: '紫禁城', createdAt: now }],
    transactions: [
      tx(6, 'income', '捉鬼', 86, 95, '20 个鬼'), tx(6, 'income', '押镖', 30, 40, ''),
      tx(5, 'income', '师门', 22, 30, ''), tx(5, 'expense', '点卡', 16, 0, '5 小时点卡'),
      tx(4, 'income', '副本', 65, 120, '乌鸡 + 车迟'), tx(3, 'income', '摆摊卖货', 140, 0, '卖了两件环装'),
      tx(2, 'income', '捉鬼', 82, 90, ''), tx(1, 'income', '封妖', 48, 60, ''),
      tx(1, 'expense', '药品补给', 12, 0, '买血蓝'), tx(0, 'income', '押镖', 30, 40, '今天的镖'),
      { id: U.uid(), characterId: cid, date: d(0), kind: 'income', currency: 'cash', amount: 9, category: '物品掉落', minutes: 0, note: '特赦令牌', source: 'quick', itemId: 7, createdAt: now },
      { id: U.uid(), characterId: cid, date: d(0), kind: 'income', currency: 'cash', amount: 6, category: '物品掉落', minutes: 0, note: '金刚石', source: 'quick', itemId: 8, createdAt: now },
      { id: U.uid(), characterId: cid, date: d(0), kind: 'income', currency: 'cash', amount: 30, category: '物品掉落', minutes: 0, note: '修炼果', source: 'quick', itemId: 20, createdAt: now },
      { id: U.uid(), characterId: cid, date: d(0), kind: 'expense', currency: 'cash', amount: 22.5, category: '点卡', minutes: 150, note: '在线 2.50 小时 × 5 角色', source: 'quick', createdAt: now }
    ],
    goals: [
      { id: U.uid(), characterId: cid, type: 'gear', title: '攒钱买 120 简易武器', target: 3000, current: 513, unit: '万', status: 'active', deadline: '', note: '目标三个月内拿下', createdAt: now, logs: [] },
      { id: U.uid(), characterId: cid, type: 'money', title: '现金攒到 5000 万', target: 5000, current: 1200, unit: '万', status: 'active', deadline: '', note: '', createdAt: now - 1, logs: [] }
    ],
    equipment: [
      { id: U.uid(), characterId: cid, slot: '武器', name: '偃月青龙刀', level: 110, attributes: '伤害 +620\\n命中 +380', special: '无级别限制', gems: '太阳石 x4', status: 'active', note: '上周换的', createdAt: now },
      { id: U.uid(), characterId: cid, slot: '项链', name: '碧水青龙项链', level: 100, attributes: '灵力 +168', special: '简易', gems: '舍利子 x3', status: 'active', note: '', createdAt: now - 1 }
    ],
    gearLogs: [],
    itemPrices: { 7: 90000, 8: 60000, 13: 80000, 20: 300000, 99: 100000 },
    quickSettings: { accounts: 5, cardPrice: 15000 }
  };
  Views._range = 'month';
  Views.go('dashboard');
})();`;

async function capture(win, name) {
  const img = await win.webContents.capturePage();
  const dir = path.join(process.cwd(), 'docs', 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), img.toPNG());
  console.log('captured', name);
}

function attachDevFlows(win) {
  if (isSmoke) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(() => { if (win && !win.isDestroyed()) win.close(); }, 1200);
    });
  }
  if (isShot) {
    win.webContents.on('did-finish-load', async () => {
      try {
        await wait(500);
        const fontOk = await win.webContents.executeJavaScript(
          "document.fonts.ready.then(() => document.fonts.check('12px \"LXGW WenKai Screen\"', '梦'))", true);
        console.log('LXGW WenKai Screen loaded:', fontOk);
        await win.webContents.executeJavaScript(seedJs, true);
        await wait(400);
        await capture(win, 'shot-01-dashboard.png');
        await win.webContents.executeJavaScript("Views.go('transactions')", true);
        await wait(250);
        await capture(win, 'shot-02-transactions.png');
        const selCount = await win.webContents.executeJavaScript('document.querySelectorAll(".xsel").length', true);
        console.log('[check] transactions .xsel =', selCount, '(expect 4)');
        await win.webContents.executeJavaScript('Views.txModal()', true);
        await wait(150);
        const modalSel = await win.webContents.executeJavaScript('document.querySelectorAll(".modal .xsel").length', true);
        console.log('[check] txModal .xsel =', modalSel, '(expect 3)');
        await win.webContents.executeJavaScript('UI.closeModal()', true);
        await win.webContents.executeJavaScript("Views.go('goals')", true);
        await wait(250);
        await capture(win, 'shot-03-goals.png');
        await win.webContents.executeJavaScript("Views.go('quick')", true);
        await wait(250);
        await capture(win, 'shot-04-quick.png');
      } catch (e) {
        console.error('screenshot failed:', e);
      }
      if (win && !win.isDestroyed()) win.close();
    });
  }
}

module.exports = { attachDevFlows };
