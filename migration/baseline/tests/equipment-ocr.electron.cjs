'use strict';
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isolate, createWindow } = require('./helpers/electron.cjs');
const dir = isolate('equipment-ocr');
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ schemaVersion: 5,
  characters: [{ id: 'c1', name: '截图测试' }], equipment: [] }));
const known = [
  { file: 'necklace.png', name: '疾风之铃', slot: '项链', level: 80, attribute: '灵力', special: '四海升平', values: ['128'] },
  { file: 'earring.png', name: '明月珰', slot: '耳饰', level: 80, attribute: '治疗能力', special: '回春之术', values: ['16', '7[+12]', '10[+12]', '8[+16]'] },
  { file: 'weapon.png', name: '飞龙在天', slot: '武器', level: 130, attribute: '体质', special: '', values: ['660', '466', '37'] },
];
const samples = require('./fixtures/equipment-ocr/samples.json').map((sample) => ({
  ...sample, ...known.find((entry) => entry.file === sample.file),
}));
let win;
app.whenReady().then(async () => {
  const errors = [];
  require(process.argv.includes('--packaged') ? '../dist/win-unpacked/resources/app.asar/src/main/ipc.js'
    : '../src/main/ipc').registerIpc({ getWindow: () => win });
  const deadline = setTimeout(() => { console.error('[equipment-ocr] TIMEOUT', dir); app.exit(1); }, 120000);
  try {
    win = await createWindow(errors);
    const results = [];
    for (const sample of samples) {
      const file = path.join(__dirname, 'fixtures/equipment-ocr', sample.file);
      const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
      const result = await win.webContents.executeJavaScript('window.mh.recognizeEquipment(' + JSON.stringify(dataUrl) + ', ' + JSON.stringify(sample.file) + ')');
      console.log('[equipment-ocr]', sample.file, JSON.stringify(result));
      const draft = await win.webContents.executeJavaScript('D.parseEquipmentText(' + JSON.stringify(result.text || '') + ')');
      results.push({ sample, result, draft });
    }
    for (const { sample, result, draft } of results) {
      assert.ok(result.ok, sample.file + ': ' + result.error);
      assert.ok(result.text.trim(), sample.file + ': 不应返回空识别结果');
      assert.equal(draft.name, sample.name, sample.file + ': 名称');
      assert.equal(draft.slot, sample.slot, sample.file + ': 部位');
      if (sample.level) assert.equal(draft.level, sample.level, sample.file + ': 等级');
      if (sample.attribute) assert.ok(draft.attributes.includes(sample.attribute), sample.file + ': 主要属性');
      for (const value of sample.values || []) assert.ok(draft.attributes.includes(value), sample.file + ': 数值 ' + value);
      if (sample.special) assert.ok(draft.special.includes(sample.special), sample.file + ': 特技特效');
      const record = await win.webContents.executeJavaScript('D.equipmentImportRecord(' + JSON.stringify(draft) + ', "c1")');
      await win.webContents.executeJavaScript('D.validateEquipmentDetails(' + JSON.stringify(record.slot) + ', ' + JSON.stringify(record.level) + ', ' + JSON.stringify(record.details) + ')');
      const expected = await win.webContents.executeJavaScript('D.equipmentImportRecord(D.parseEquipmentText(' + JSON.stringify(sample.text) + '), "c1")');
      for (const key of ['base', 'extra', 'bonus', 'technique', 'effects', 'forge', 'gems', 'clock']) {
        assert.deepEqual(record.details[key], expected.details[key], sample.file + ': ' + key);
      }
      if (record.slot.startsWith('玉魄')) assert.deepEqual(record.details.jade, expected.details.jade, sample.file + ': 玉魄强化');
    }
    const images = samples.map((sample) => ({ ...sample, base64: fs.readFileSync(path.join(__dirname,
      'fixtures/equipment-ocr', sample.file)).toString('base64') }));
    await win.webContents.executeJavaScript(`(async (samples) => {
      Views.go('equipment'); Views.eqImportModal({ characterId: 'c1', index: 0 });
      const transfer = new DataTransfer();
      for (const sample of samples) {
        const bytes = Uint8Array.from(atob(sample.base64), char => char.charCodeAt(0));
        transfer.items.add(new File([bytes], sample.file, { type: 'image/png' }));
      }
      const picker = document.querySelector('[data-import-files]'); picker.files = transfer.files;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; document.querySelector('[data-act="save"]').disabled; i++) {
        if (i > 2000) throw new Error('实图批量导入后保存按钮仍不可用');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const rows = [...document.querySelectorAll('.eq-import-entry')];
      if (rows.length !== samples.length) throw new Error('实图队列数量不符');
      for (let index = 0; index < samples.length; index++) {
        rows[index].querySelector('[data-import-pick]').click();
        const form = document.querySelector('.eq-import-fields form');
        if (form.querySelector('[name="name"]').value !== samples[index].name) throw new Error('核对表名称未回填');
        if (!form.querySelector('.eq-editor input[type="number"]') || !form.querySelector('.eq-editor input[type="number"]').value) throw new Error('结构化属性未回填');
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })(${JSON.stringify(images)})`);
    fs.writeFileSync(path.join(dir, 'actual-equipment-ocr.png'), (await win.webContents.capturePage()).toPNG());
    const blank = await win.webContents.executeJavaScript(`(async () => {
      UI.closeModal(); Views.eqImportModal();
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#6a5132'; ctx.fillRect(0, 0, 300, 200);
      const result = await window.mh.recognizeEquipment(canvas.toDataURL(), 'blank-regression');
      const transfer = new DataTransfer();
      transfer.items.add(new File([await new Promise(resolve => canvas.toBlob(resolve))], 'blank.png', { type: 'image/png' }));
      const picker = document.querySelector('[data-import-files]'); picker.files = transfer.files;
      picker.dispatchEvent(new Event('change', { bubbles: true }));
      for (let i = 0; !document.querySelector('.eq-import-fields form'); i++) {
        if (i > 500) throw new Error('空图识别未结束');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (!document.querySelector('.eq-import-entry small').textContent.includes('未识别到文字')) throw new Error('空文字未显示正确状态');
      if (!document.querySelector('[data-act="save"]').disabled) throw new Error('空图不应允许保存');
      return result;
    })()`);
    assert.equal(blank.ok, false); assert.match(blank.error, /未识别到文字/);
    assert.deepEqual(errors, []);
    console.log('[equipment-ocr] PASS: 12 张实图的名称/部位、属性校验、真实批量回填与空结果提示');
    console.log('[equipment-ocr] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) { console.error('[equipment-ocr] FAIL:', error); console.error('测试数据:', dir); app.exit(1); }
});
