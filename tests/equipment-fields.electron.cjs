'use strict';
const { app, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isolate, createWindow } = require('./helpers/electron.cjs');
const samples = require('./fixtures/equipment-ocr/samples.json');
const dir = isolate('equipment-fields');
const original = { schemaVersion: 5, characters: [{ id: 'c1', name: '轻舟听雨', level: 109, school: '大唐官府', soulJade: { unlocked: true } },
  { id: 'c2', name: '山月', level: 69, school: '普陀山' }], equipment: [] };
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(original));

async function manual() {
  const check = (value, label) => { if (!value) throw new Error(label); };
  const until = async (fn) => { for (let i = 0; !fn(); i++) { if (i > 150) throw new Error('等待保存：' + document.getElementById('toast-root').textContent); await new Promise((resolve) => setTimeout(resolve, 20)); } };
  const click = (selector) => { const el = document.querySelector(selector); check(el, selector); el.click(); };
  const field = (name, value) => { const el = document.querySelector('[name="' + name + '"]'); check(el, name); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const choose = (name, value) => { click('[data-xmount="' + name + '"] button'); click('.xitem[data-v="' + value + '"]'); };
  const stat = (key, value) => {
    click('[data-eq-add="extra"]');
    const rows = document.querySelectorAll('[data-eq-row="extra"]'), row = rows[rows.length - 1];
    row.querySelector('[data-part="key"] button').click(); click('.xitem[data-v="' + key + '"]');
    const input = row.querySelector('[data-part="value"] input'); field(input.name, value);
  };
  await until(() => document.querySelectorAll('.nav-item').length === 7); Views.go('equipment');
  click('#quick-add'); field('name', '双加武器'); field('level', 130);
  check(document.querySelector('[name="eq-base-damage"]') && document.querySelector('[name="eq-base-hit"]') &&
    !document.querySelector('[name="attributes"]') && !document.querySelector('[name="eq-base-defense"]'), '武器只展示对应的结构化字段');
  field('eq-base-damage', 466); field('eq-base-hit', 660); stat('constitution', 37); stat('agility', -5);
  click('[data-xmount="eq-technique"] button');
  const search = document.querySelector('.xmenu-search'); search.value = '破血'; search.dispatchEvent(new Event('input', { bubbles: true }));
  check(document.querySelectorAll('.xitem:not([hidden])').length === 1, '特技可搜索'); click('.xitem[data-v="破血狂攻"]');
  choose('slot', '鞋子'); check(!document.querySelector('[name="eq-base-damage"]') && document.querySelector('[name="eq-base-agility"]'), '换部位自动换表单');
  field('eq-base-defense', 37); choose('slot', '武器');
  check(document.querySelector('[name="eq-base-damage"]').value === '466' && document.querySelectorAll('[data-eq-row="extra"]').length === 2, '切回保留部位草稿');
  const snapshot = JSON.stringify(D.state), persist = D.persist; D.persist = async () => { throw new Error('属性写入失败'); };
  click('[data-act="ok"]'); await until(() => document.getElementById('toast-root').textContent.includes('属性写入失败'));
  check(JSON.stringify(D.state) === snapshot && document.querySelector('[name="eq-base-damage"]').value === '466', '保存失败回滚且保留属性草稿');
  D.persist = persist; click('[data-act="ok"]'); await until(() => !document.querySelector('.modal'));
  check(D.state.equipment[0].details.extra[1].value === -5 && D.state.equipment[0].details.technique === '破血狂攻', '负属性和特技保存');
  Views.eqModal(D.state.equipment[0]);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const modal = document.querySelector('.modal'), save = document.querySelector('[data-act="ok"]').getBoundingClientRect();
  check(modal.scrollWidth <= modal.clientWidth + 1 && save.bottom <= innerHeight, '编辑表单不横向溢出且保存按钮可见');
  UI.closeModal();
  Views.eqModal(D.state.equipment[0]);
  document.querySelector('[name="eq-base-damage"]').focus(); document.querySelector('[name="eq-base-damage"]').select();
  return JSON.stringify(D.state);
}

async function invalid() {
  const input = document.querySelector('[name="eq-base-damage"]');
  if (!input.validity.badInput) throw new Error('未产生原生不完整数字');
  const snapshot = JSON.stringify(D.state); document.querySelector('[data-act="ok"]').click();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  if (JSON.stringify(D.state) !== snapshot || !document.querySelector('.modal')) throw new Error('错误数字不应保存');
  document.querySelector('.modal-x').click();
  if (!document.querySelector('.modal-discard')) throw new Error('错误输入应触发未保存确认');
  document.querySelector('[data-act="discard"]').click();
}

async function imports(images) {
  Views.eqImportModal({ characterId: 'c1', index: 0 });
  const files = new DataTransfer();
  for (const image of images) files.items.add(new File([Uint8Array.from(atob(image.base64), (char) => char.charCodeAt(0))], image.file, { type: 'image/png' }));
  const picker = document.querySelector('[data-import-files]'); picker.files = files.files; picker.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; document.querySelector('[data-act="save"]').disabled; i++) {
    if (i > 300) throw new Error('导入未就绪：' + document.querySelector('.eq-import-summary').textContent + ' / ' + document.querySelector('[data-import-error]')?.textContent);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const rows = [...document.querySelectorAll('.eq-import-entry')];
  if (rows.length !== 12) throw new Error('应有 12 张截图');
  rows[6].querySelector('[data-import-pick]').click();
  if (document.querySelectorAll('[data-eq-row="extra"]').length !== 3 || !document.querySelector('[name="eq-suit"]').value.includes('24')) throw new Error('灵饰词条与套装应分开');
  document.querySelector('[name="eq-suit"]').value += ' <b>保留原文</b>';
  document.querySelector('[name="eq-suit"]').dispatchEvent(new Event('input', { bubbles: true }));
  rows[10].querySelector('[data-import-pick]').click();
  if (document.querySelector('[name="eq-chance"]').value !== '0.5') throw new Error('玉魄百分比回填');
  rows[6].querySelector('[data-import-pick]').click();
  if (!document.querySelector('[name="eq-suit"]').value.includes('<b>')) throw new Error('切换图片保留属性草稿');
  const level = document.querySelector('[name="level"]'); level.focus(); level.select();
}

async function importInvalid() {
  const pick = (index) => document.querySelectorAll('.eq-import-entry')[index].querySelector('[data-import-pick]').click();
  if (!document.querySelector('[name="level"]').validity.badInput) throw new Error('等级应保留原生不完整输入');
  pick(10); pick(6);
  if (!document.querySelector('[name="level"]').validity.badInput || !document.querySelector('[data-act="save"]').disabled) throw new Error('切换截图不可丢失不完整等级');
  const suit = document.querySelector('[name="eq-suit"]'); suit.dispatchEvent(new Event('input', { bubbles: true }));
  if (!document.querySelector('[data-act="save"]').disabled) throw new Error('编辑其他属性不可绕过错误等级');
  const level = document.querySelector('[name="level"]'); level.value = '80'; level.dispatchEvent(new Event('input', { bubbles: true }));
  if (document.querySelector('[data-act="save"]').disabled) throw new Error('修正等级后应可保存');
}

async function saveImports() {
  document.querySelector('[data-act="save"]').click();
  for (let i = 0; document.querySelector('.modal'); i++) {
    if (i > 150) throw new Error(document.getElementById('toast-root').textContent);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const ring = document.querySelector('[data-eq-character="c1"] [data-slot="戒指"]');
  if (ring.querySelector('b') || !ring.textContent.includes('保留原文')) throw new Error('格子属性应安全转义');
  if (ring.textContent.match(/治疗能力/g).length < 3) throw new Error('重复词条和套装应完整展示');
  if (D.state.equipment.length !== 13 || D.state.transactions.length) throw new Error('导入应仅新增装备');
  return JSON.stringify(D.state);
}

async function geometry() {
  const view = document.getElementById('view');
  if (view.scrollWidth > view.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth) throw new Error('装备栏横向溢出');
  for (const slot of document.querySelectorAll('.eq-slot')) {
    if (slot.scrollWidth > slot.clientWidth + 1 || slot.scrollHeight > slot.clientHeight + 1) throw new Error('装备格子属性被截断');
  }
  for (const portrait of document.querySelectorAll('.eq-portrait')) {
    const bounds = portrait.getBoundingClientRect(), tabs = portrait.querySelector('.eq-plan-tabs').getBoundingClientRect();
    if (tabs.left < bounds.left - 1 || tabs.right > bounds.right + 1) throw new Error('方案按钮不可覆盖相邻装备');
  }
}

app.whenReady().then(async () => {
  const errors = []; let win;
  require('../src/main/ipc').registerIpc({ getWindow: () => win });
  let position = 0;
  ipcMain.removeHandler('mh:recognizeEquipment');
  ipcMain.handle('mh:recognizeEquipment', () => ({ ok: true, text: samples[position++].text, confidence: 99 }));
  const deadline = setTimeout(() => { console.error('[equipment-fields] TIMEOUT', dir); app.exit(1); }, 45000);
  try {
    win = await createWindow(errors);
    const run = (fn, arg) => win.webContents.executeJavaScript('(' + fn.toString() + ')(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')', true);
    await run(manual); await win.webContents.insertText('e'); await run(invalid);
    await run(imports, samples.map((sample) => ({ file: sample.file, base64: fs.readFileSync(path.join(__dirname, 'fixtures/equipment-ocr', sample.file)).toString('base64') })));
    await win.webContents.insertText('e'); await run(importInvalid);
    await win.webContents.executeJavaScript("document.getElementById('toast-root').replaceChildren(); document.getAnimations().forEach(animation => animation.finish()); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    fs.writeFileSync(path.join(dir, 'editor-import-ring.png'), (await win.webContents.capturePage()).toPNG());
    const snapshot = await run(saveImports);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), JSON.parse(snapshot));
    for (const [width, height] of [[1280, 900], [1024, 768], [620, 860]]) {
      win.setSize(width, height);
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await run(geometry);
      await win.webContents.executeJavaScript("document.getElementById('view').scrollTop = 0");
      fs.writeFileSync(path.join(dir, 'equipment-fields-' + width + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    await win.webContents.executeJavaScript("document.querySelector('[data-eq-character=\"c1\"] .eq-jade-grid').scrollIntoView({ block: 'end' }); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    fs.writeFileSync(path.join(dir, 'equipment-fields-jade.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript("document.getElementById('toast-root').replaceChildren(); Views.eqModal(D.state.equipment.find(eq => eq.slot === '武器')); document.getAnimations().forEach(animation => animation.finish()); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    fs.writeFileSync(path.join(dir, 'editor-weapon.png'), (await win.webContents.capturePage()).toPNG());
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve)); win.webContents.reload(); await loaded;
    const restored = await win.webContents.executeJavaScript('new Promise(resolve => { const check = () => document.querySelectorAll(".nav-item").length ? resolve(JSON.stringify(D.state)) : setTimeout(check, 20); check(); })');
    assert.deepEqual(JSON.parse(restored), JSON.parse(snapshot));
    const backups = fs.readdirSync(dir).filter((file) => file.includes('.before-equipment-fields-'));
    assert.equal(backups.length, 1); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, backups[0]))), original);
    assert.deepEqual(errors, []);
    console.log('[equipment-fields] PASS: 部位表单/草稿、负数/原生错误输入、搜索、失败重试、12 张截图核对、重复词条/加成/套装、安全展示、窄窗口、版本备份和重启');
    console.log('[equipment-fields] screenshots:', dir); clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) { console.error('[equipment-fields] FAIL:', error, dir); app.exit(1); }
});
