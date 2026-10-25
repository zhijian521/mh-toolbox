'use strict';
const { app, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isolate, createWindow } = require('./helpers/electron.cjs');
const dir = isolate('equipment-import');
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ schemaVersion: 5,
  characters: [{ id: 'c1', name: '轻舟' }, { id: 'c2', name: '小号' }], equipment: [] }));

async function setup() {
  for (let i = 0; !window.D || !D.state.characters.length; i++) {
    if (i > 150) throw new Error('启动超时');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  Views.go('equipment');
  // 合成深底彩字样本用于离线引擎回归，实际游戏截图仍需人工核对。
  const canvas = document.createElement('canvas'); canvas.width = 420; canvas.height = 365;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#163047'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '24px "Microsoft YaHei"'; ctx.textBaseline = 'top';
  const lines = ['霜冷九州', '等级 120', '伤害 +520 命中 +600', '力量 +24 敏捷 +20', '耐久度 420',
    '特技：破血狂攻', '特效：永不磨损', '锻炼等级 8', '镶嵌宝石 红玛瑙'];
  lines.forEach((line, index) => { ctx.fillStyle = index === 0 ? '#f4df63' : index >= 5 && index <= 6 ? '#6bf56b' : '#b6eefa'; ctx.fillText(line, 20, 20 + index * 37); });
  window.importFixture = canvas.toDataURL('image/png');
  return window.importFixture;
}

async function realRecognition() {
  const check = (value, message) => { if (!value) throw new Error(message); };
  document.getElementById('equipment-import').click();
  document.querySelector('[data-act="paste"]').click();
  for (let i = 0; !document.querySelector('.eq-import-fields form'); i++) {
    if (i > 2400) throw new Error('识别超时');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const form = document.querySelector('.eq-import-fields form');
  const text = form.querySelector('pre').textContent;
  check(text.includes('520') && text.includes('600') && text.includes('120'), '离线 OCR 数值：' + text);
  check(form.querySelector('[name="name"]').value === '霜冷九州', '离线 OCR 名称：' + text);
  check(/敏捷\s*\+20/.test(form.querySelector('[name="attributes"]').value), '彩色属性不漏项：' + text);
  check(form.querySelector('[name="gems"]').value.includes('红玛'), '宝石文字即使存在错字也保留供核对');
  check(document.querySelector('[data-xmount="slot"] input').value === '武器', '识别武器部位');
  check(!document.querySelector('[data-act="save"]').disabled, '识别后可直接保存');
  return text;
}

async function flows() {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
  const until = async (fn, label) => { for (let i = 0; i < 300; i++) { if (fn()) return; await pause(); } throw new Error('等待失败：' + label); };
  const click = (selector) => { const el = document.querySelector(selector); check(el, '找不到 ' + selector); el.click(); };
  const field = (name, value) => {
    const input = document.querySelector('.eq-import-fields [name="' + name + '"]');
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const choose = (selector, value) => { click(selector + ' button'); click('.xitem[data-v="' + value + '"]'); };
  const file = async (color, type = 'image/png') => {
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 340;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 400, 340);
    return new File([await new Promise((resolve) => canvas.toBlob(resolve, type))], color.slice(1) + (type === 'image/webp' ? '.webp' : '.png'), { type });
  };
  const drop = async (colors) => {
    const transfer = new DataTransfer(); for (const color of colors) transfer.items.add(await file(color));
    document.querySelector('.eq-import-modal').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  };
  const persist = D.persist;
  D.persist = async () => { throw new Error('模拟写入失败'); };
  click('[data-act="save"]'); await until(() => document.querySelector('[data-act="save"]:not(:disabled)'), '保存失败保留草稿');
  check(!D.state.equipment.length && document.querySelectorAll('.eq-import-entry').length === 1, '失败整体回滚且保留截图');
  D.persist = persist;
  click('[data-act="save"]'); await until(() => !document.querySelector('.modal'), '重试保存');
  check(D.state.equipment.length === 1 && D.charById('c1').equipmentSets[0].slots['武器'], '直接保存并填入空位');
  const firstId = D.state.equipment[0].id;
  check(D.state.equipment[0].ocrText.includes('520') && !D.state.transactions.length, '原文保留且未生成收支');
  Views.eqDetailModal(D.state.equipment[0]); check(document.querySelector('.eq-ocr-text'), '详情可查看原文'); UI.closeModal();

  Views.eqImportModal({ characterId: 'c1', index: 0 });
  await drop(['#123456', '#654321']);
  await until(() => document.querySelectorAll('.eq-import-entry').length === 2 && !document.querySelector('[data-act="save"]').disabled, '多张自动识别');
  await drop(['#123456']); await pause(); await pause();
  check(document.querySelectorAll('.eq-import-entry').length === 2, '重复图片跳过');
  field('name', '修正后的武器');
  click('[data-act="crop"]');
  const image = document.querySelector('.eq-import-image img');
  await until(() => image.complete, '原图');
  const preview = document.querySelector('.eq-import-image'); const bounds = image.getBoundingClientRect();
  // 在隐藏测试窗口中无法获得系统 pointer capture，用真实坐标检查裁剪逻辑。
  preview.setPointerCapture = () => {};
  preview.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: bounds.left + 10, clientY: bounds.top + 10, pointerId: 1 }));
  preview.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.right - 10, clientY: bounds.bottom - 10, pointerId: 1 }));
  preview.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
  check(!document.querySelector('[data-act="apply-crop"]').disabled, '裁剪可提交');
  click('[data-act="apply-crop"]');
  await until(() => !document.querySelector('[data-act="save"]').disabled, '裁剪重新识别');
  choose('[data-xmount="slot"]', '头盔'); field('name', '测试头盔');
  click('[data-act="save"]'); await until(() => !document.querySelector('.modal'), '批量保存');
  check(D.charById('c1').equipmentSets[0].slots['武器'] === firstId, '已有装备保留');
  check(D.charById('c1').equipmentSets[0].slots['头盔'], '新部位填空');
  check(D.state.equipment.length === 3, '批量新增两件');

  Views.eqImportModal({ characterId: 'c2', index: 2, slot: '鞋子' });
  const transfer = new DataTransfer(); transfer.items.add(await file('#abcdef'));
  document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  await until(() => !!document.querySelector('.eq-import-fields form'), 'Ctrl+V 识别失败');
  check(document.querySelector('[data-xmount="slot"] input').value === '鞋子', '未知部位沿用格子上下文');
  check(document.querySelector('[data-act="save"]').disabled, '未知名称阻止保存');
  field('name', '补录鞋子'); choose('[data-import-target]', '');
  click('[data-act="save"]'); await until(() => !document.querySelector('.modal'), '失败后手动补全保存');
  check(D.state.equipment.some((eq) => eq.characterId === 'c2' && eq.name === '补录鞋子'), '角色隔离');
  check(!D.charById('c2').equipmentSets[2].slots['鞋子'], '仅入仓库');

  Views.eqImportModal(); await drop(['#fedcba']);
  await until(() => document.querySelector('.eq-import-entry'), '取消中的截图');
  click('[data-act="cancel"]'); check(document.querySelector('.modal-discard'), '未保存关闭提醒');
  click('[data-act="discard"]');
  await pause();
  check(!document.querySelector('.modal') && D.state.equipment.length === 4, '取消不落盘');
  Views.eqImportModal();
  const images = new DataTransfer(); images.items.add(await file('#987654', 'image/webp'));
  const picker = document.querySelector('[data-import-files]'); picker.files = images.files;
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  await until(() => !!document.querySelector('.eq-import-fields form'), '选择 WebP 文件');
  check(document.querySelector('.eq-import-pick img').src.startsWith('data:image/png;base64,'), 'WebP 转成 PNG 后送识别');
  check(picker.value === '', '文件选择后可再次选择相同文件');
  UI.closeModal();
  return JSON.stringify(D.state);
}

app.whenReady().then(async () => {
  const errors = [];
  let win;
  const ipcFile = process.argv.includes('--packaged')
    ? '../dist/win-unpacked/resources/app.asar/src/main/ipc.js' : '../src/main/ipc.js';
  require(ipcFile).registerIpc({ getWindow: () => win });
  win = await createWindow(errors);
  const deadline = setTimeout(() => { console.error('[equipment-import] TIMEOUT', dir); app.exit(1); }, 90000);
  try {
    const run = (fn) => win.webContents.executeJavaScript('(' + fn.toString() + ')()', true);
    const fixture = await run(setup);
    fs.writeFileSync(path.join(dir, 'fixture.png'), Buffer.from(fixture.split(',')[1], 'base64'));
    ipcMain.removeHandler('mh:equipmentClipboard'); ipcMain.handle('mh:equipmentClipboard', () => fixture);
    const text = await run(realRecognition);
    console.log('[equipment-import] OCR:', text.replace(/\n/g, ' / '));
    const invalid = await win.webContents.executeJavaScript("window.mh.recognizeEquipment('file:///invalid.png', 'invalid')");
    assert.equal(invalid.ok, false, '主进程拒绝非图片输入');
    const cancelled = await win.webContents.executeJavaScript(`(async () => {
      const request = window.mh.recognizeEquipment(window.importFixture, 'cancel-test');
      await window.mh.cancelEquipmentOcr('wrong-request');
      await window.mh.cancelEquipmentOcr('cancel-test');
      return request;
    })()`);
    assert.equal(cancelled.ok, false); assert.match(cancelled.error, /取消/);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(dir, 'equipment-import.png'), (await win.webContents.capturePage()).toPNG());
    win.setSize(1024, 680);
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.writeFileSync(path.join(dir, 'equipment-import-narrow.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(() => {
      const modal = document.querySelector('.modal');
      if (modal.scrollWidth > modal.clientWidth + 2) throw new Error('窄窗口横向溢出');
      const button = document.querySelector('[data-act="save"]').getBoundingClientRect();
      if (button.bottom > innerHeight || button.right > innerWidth) throw new Error('窄窗口保存按钮不可见');
    })()`);
    let request = 0;
    ipcMain.removeHandler('mh:recognizeEquipment');
    ipcMain.handle('mh:recognizeEquipment', async () => {
      request++;
      if (request === 4) return { ok: false, error: '识别失败，请重试' };
      if (request === 5) await new Promise((resolve) => setTimeout(resolve, 100));
      return { ok: true, text: '名称：测试武器\n部位：武器\n等级 100\n伤害 +520\n命中 +600', confidence: 90 };
    });
    const snapshot = await run(flows);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')), JSON.parse(snapshot));
    assert.deepEqual(errors, []);
    const modelRoot = process.argv.includes('--packaged')
      ? path.resolve(__dirname, '../dist/win-unpacked/resources/app.asar.unpacked/node_modules/@gutenye/ocr-models/assets')
      : path.dirname(require.resolve('@gutenye/ocr-models/node')) + '/assets';
    assert.ok(fs.statSync(path.join(modelRoot, 'ch_PP-OCRv4_rec_infer.onnx')).size > 1000000, '中文识别模型随包提供');
    console.log('[equipment-import] PASS: 本地真实 OCR、粘贴/多图拖入、去重、裁剪、字段纠正、批量填空、仓库、失败重试与取消');
    console.log('[equipment-import] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) { console.error('[equipment-import] FAIL:', error, '\n测试数据:', dir); app.exit(1); }
});
