'use strict';
/* 开发辅助：--smoke 冒烟自检 / --screenshot 注入示例数据并截图到 docs/screenshots */
const path = require('path');
const fs = require('fs');

const isSmoke = process.argv.includes('--smoke');
const isShot = process.argv.includes('--screenshot');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function capture(win, name) {
  await win.webContents.executeJavaScript(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))');
  let img = await win.webContents.capturePage();
  // 窗口首帧偶尔尚未绘制，避免生成空的 PNG 文件。
  for (let attempt = 0; img.isEmpty() && attempt < 3; attempt++) {
    await wait(250);
    img = await win.webContents.capturePage();
  }
  if (img.isEmpty()) throw new Error('窗口尚未绘制，截图失败：' + name);
  const dir = path.join(process.cwd(), 'docs', 'screenshots');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), img.toPNG());
  console.log('captured', name);
}

function attachDevFlows(win) {
  if (isSmoke) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const summary = await win.webContents.executeJavaScript(
            '(async () => JSON.stringify({ file: (await mh.info()).dataFile, chars: D.state.characters.length, tx: D.state.transactions.length, goals: D.state.goals.length, equipment: D.state.equipment.length, page: Views._current, charFilter: D.charFilter, quickRows: document.querySelectorAll(".quick-row").length, viewLen: document.getElementById("view").innerHTML.length }))()', true);
          console.log('[smoke] state =', summary);
        } catch (e) {
          console.error('[smoke] state check failed:', e);
        }
        if (win && !win.isDestroyed()) win.close();
      }, 900);
    });
  }
  if (isShot) {
    // 截图时持续绘制后台窗口，防止取到上一个页面的画面。
    win.webContents.setBackgroundThrottling(false);
    win.webContents.on('did-finish-load', async () => {
      try {
        await wait(500);
        const fontOk = await win.webContents.executeJavaScript(
          "document.fonts.ready.then(() => document.fonts.check('12px \"LXGW WenKai Screen\"', '梦'))", true);
        console.log('LXGW WenKai Screen loaded:', fontOk);
        await win.webContents.executeJavaScript('Views.loadDemoData(true, false)', true);
        await wait(400);
        await capture(win, 'shot-01-dashboard.png');
        await win.webContents.executeJavaScript("Views.go('transactions')", true);
        await wait(250);
        await capture(win, 'shot-02-transactions.png');
        const selCount = await win.webContents.executeJavaScript('document.querySelectorAll(".xsel").length', true);
        console.log('[check] transactions .xsel =', selCount, '(expect 6)');
        await win.webContents.executeJavaScript('Views.txModal()', true);
        await wait(150);
        const modalSel = await win.webContents.executeJavaScript('document.querySelectorAll(".modal .xsel").length', true);
        console.log('[check] txModal .xsel =', modalSel, '(expect 4, including hidden item status)');
        await win.webContents.executeJavaScript('UI.closeModal()', true);
        await win.webContents.executeJavaScript("Views.go('goals')", true);
        await wait(250);
        await capture(win, 'shot-03-goals.png');
        await win.webContents.executeJavaScript("Views.go('quick')", true);
        await wait(250);
        await capture(win, 'shot-04-quick.png');
        await win.webContents.executeJavaScript("Views.go('account')", true);
        await wait(250);
        await capture(win, 'shot-05-account.png');
        await win.webContents.executeJavaScript("Views.go('accountRecords')", true);
        await wait(250);
        await capture(win, 'shot-06-account-records.png');
        await win.webContents.executeJavaScript("Views.go('onlineRecords')", true);
        await wait(250);
        await capture(win, 'shot-07-online-records.png');
        await win.webContents.executeJavaScript('Views.onlineModal()', true);
        await wait(150);
        await capture(win, 'shot-08-online-form.png');
      } catch (e) {
        console.error('screenshot failed:', e);
      }
      if (win && !win.isDestroyed()) win.close();
    });
  }
}

module.exports = { attachDevFlows };
