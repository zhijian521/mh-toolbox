'use strict';
/* 单项快捷编辑的真实 Electron 回归，仅写临时档案。 */
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isolate, createWindow } = require('./helpers/electron.cjs');
const dir = isolate('character-quick-edit');
if (process.argv.includes('--inspect-ui')) app.commandLine.appendSwitch('remote-debugging-port', '9337');
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ characters: [
  { id: 'c1', name: '轻舟听雨', level: 109, school: '大唐官府', progress: {
    schoolSkills: [{ name: '为官之道', level: 119 }, { name: '无双一击', level: null }],
    auxiliarySkills: [{ name: '强身术', level: 80 }, { name: '自定义"技能', level: 0 }],
    training: { attack: 17, magic: 0 }, petTraining: { attack: 15 }, qianyuanPills: 3, potentialFruits: 100,
  } },
  { id: 'c2', name: '山月', school: '普陀山', progress: { qianyuanPills: 1 } },
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
  const input = () => document.querySelector('.char-quick-modal [name="value"]');
  const field = (value) => { input().value = value; input().dispatchEvent(new Event('input', { bubbles: true })); };
  const open = (category, key = '', id = 'c1') => Views.charFocusTarget(id, { category, key }).click();
  const save = async () => { click('.modal [data-act="ok"]'); await until(() => !document.querySelector('.modal'), '保存关闭'); };
  await until(() => document.querySelectorAll('.nav-item').length === 7, '启动');
  Views.go('characters'); await document.fonts.ready;
  const other = JSON.stringify(D.charById('c2'));
  const goal = await D.saveGoal({ characterId: 'c1', type: 'progress', target: 18, tracking: { category: 'training', key: 'attack' } });
  const count = () => D.charById('c1').growthHistory.length;
  open('training', 'attack');
  check(document.activeElement === input() && input().value === '17', '打开后聚焦当前数值');
  check(document.querySelector('.char-quick-context').textContent.includes('轻舟听雨 · 人物修炼'), '角色与修炼分区清晰');
  check(!document.querySelector('.char-quick-details').open && document.querySelector('[name="changeDate"]').value === U.today(), '补充信息默认折叠且日期为今天');
  click('[data-step="1"]'); click('[data-step="1"]'); click('[data-step="-1"]');
  check(input().value === '18' && D.charById('c1').progress.training.attack === 17 && count() === 0, '加减只改草稿，不提前保存');
  check(document.querySelector('.char-quick-preview').textContent.includes('17级→18级'), '实时预览前后值');
  const details = document.querySelector('.char-quick-details'); details.open = true;
  document.getElementById('mform')._xcomps.changeDate.set(U.addDays(U.today(), -1));
  document.querySelector('[name="changeNote"]').value = '补记修炼';
  await save();
  check(count() === 1 && D.charById('c1').progress.training.attack === 18 && D.goalSummary(goal).status === 'done', '保存一次历史并同步目标');
  check(D.charById('c1').growthHistory[0].note === '补记修炼' && D.charById('c1').growthHistory[0].date === U.addDays(U.today(), -1), '日期与本次说明正常保存');
  check(document.activeElement === Views.charFocusTarget('c1', { category: 'training', key: 'attack' }), '保存后返回原项目焦点');
  open('training', 'attack'); await save(); check(count() === 1, '无变化不生成历史');

  open('training', 'magic');
  check(input().value === '0' && document.querySelector('[data-step="-1"]').disabled, '明确零值保留且不能再减');
  click('.modal [data-act="cancel"]'); check(!document.querySelector('.modal'), '未改动直接关闭');
  open('training', 'defense');
  check(input().value === '' && document.querySelector('[data-step="-1"]').disabled, '未记录不伪装为零');
  click('[data-step="1"]'); check(input().value === '1', '未记录可快速补录为一');
  click('.modal [data-act="cancel"]');
  check(document.querySelector('.modal-discard') && input().value === '1', '草稿关闭出现居中确认');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!document.querySelector('.modal-discard') && input().value === '1', 'Esc 返回编辑保留草稿');
  click('.modal [data-act="cancel"]'); click('[data-act="discard"]');
  check(D.charById('c1').progress.training.defense === null, '放弃不修改档案');

  open('schoolSkills', '无双一击'); field('0'); await save();
  check(D.charById('c1').progress.schoolSkills[1].level === 0 && D.charById('c1').growthHistory.at(-1).changes[0].kind === 'recorded', '技能未知补录为零');
  open('auxiliarySkills', '自定义"技能'); click('[data-step="1"]'); await save();
  check(D.charById('c1').progress.auxiliarySkills[1].level === 1 && document.activeElement.dataset.key === '自定义"技能', '特殊名称定位与焦点安全');
  open('petTraining', 'attack'); field('16'); await save();
  check(D.charById('c1').progress.petTraining.attack === 16 && D.charById('c1').progress.training.attack === 18, '人物与召唤兽项目独立');
  open('potentialFruits'); field(''); await save();
  check(D.charById('c1').progress.potentialFruits === null && D.charById('c1').growthHistory.at(-1).changes[0].kind === 'cleared', '清空恢复未记录并留历史');

  open('qianyuanPills');
  const beforeInvalid = JSON.stringify(D.state);
  field('1.5'); click('.modal [data-act="ok"]');
  check(document.querySelector('.modal') && JSON.stringify(D.state) === beforeInvalid && document.querySelector('[data-step="1"]').disabled, '小数阻止提交和步进');
  field('-1'); click('.modal [data-act="ok"]');
  check(document.querySelector('.modal') && JSON.stringify(D.state) === beforeInvalid, '负数不能写入');
  field(String(Number.MAX_SAFE_INTEGER)); check(document.querySelector('[data-step="1"]').disabled, '安全整数上限禁用加一');
  field('4');
  const persist = D.persist;
  let release;
  D.persist = async () => { await new Promise((resolve) => { release = resolve; }); throw new Error('模拟快捷保存失败'); };
  click('.modal [data-act="ok"]'); await until(() => release, '保存等待');
  check([...document.querySelectorAll('.modal button, .modal input')].every((element) => element.disabled), '保存期间锁定控件');
  UI.requestCloseModal(); check(document.querySelector('.modal') && !document.querySelector('.modal-discard'), '保存中不能关闭');
  release(); await until(() => !document.querySelector('.modal-overlay')._saving, '保存失败恢复');
  check(JSON.stringify(D.state) === beforeInvalid && input().value === '4' && !input().disabled, '失败回滚档案历史并保留草稿');
  D.persist = persist;
  const beforeRetry = count(); await save(); check(count() === beforeRetry + 1, '重试只新增一条历史');

  open('schoolSkills', '为官之道');
  await D.saveCharacterProgress('c1', { schoolSkills: [{ name: '无双一击', level: 0 }, { name: '为官之道', level: 120 }], training: { ...D.charById('c1').progress.training, magic: 9 } });
  field('121'); await save();
  check(D.charById('c1').progress.schoolSkills[1].level === 121 && D.charById('c1').progress.training.magic === 9, '打开后档案更新仍按名称保存且保留最新其他值');
  check(JSON.stringify(D.charById('c2')) === other, '不影响其他角色');
  return JSON.stringify(D.state);
}

app.whenReady().then(async () => {
  let win;
  const errors = [];
  require('../src/main/ipc').registerIpc({ getWindow: () => win });
  win = await createWindow(errors);
  const deadline = setTimeout(() => { console.error('[character-quick-edit] TIMEOUT', dir); app.exit(1); }, 45000);
  try {
    const run = (fn) => win.webContents.executeJavaScript('(' + fn.toString() + ')()', true);
    const snapshot = await run(flows);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'), 'utf8')), JSON.parse(snapshot));
    // 用真实鼠标点击项目名称，验证透明点击区域覆盖整行。
    const point = await run(() => {
      document.getElementById('view').scrollTop = 0;
      const button = Views.charFocusTarget('c1', { category: 'training', key: 'attack' });
      const rect = button.closest('.char-value').querySelector('dt').getBoundingClientRect();
      return { x: Math.round(rect.left + 5), y: Math.round(rect.top + rect.height / 2) };
    });
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    await run(async () => {
      for (let i = 0; i < 50 && !document.querySelector('.char-quick-modal'); i++) await new Promise(resolve => setTimeout(resolve, 20));
      if (!document.querySelector('.char-quick-modal')) throw new Error('点击名称未打开快捷弹窗');
    });
    await win.webContents.insertText('19');
    assert.equal(await run(() => document.querySelector('[name="value"]').value), '19', '自动选中原值，可直接替换');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await run(async () => {
      for (let i = 0; i < 150 && document.querySelector('.modal'); i++) await new Promise(resolve => setTimeout(resolve, 20));
      if (document.querySelector('.modal') || D.charById('c1').progress.training.attack !== 19) throw new Error('Enter 保存失败');
    });
    const final = await run(() => JSON.stringify(D.state));
    const loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded;
    await run(async () => {
      for (let i = 0; i < 150 && !document.querySelector('.nav-item'); i++) await new Promise(resolve => setTimeout(resolve, 20));
      Views.go('characters'); await document.fonts.ready;
    });
    assert.deepEqual(JSON.parse(await run(() => JSON.stringify(D.state))), JSON.parse(final));
    for (const [width, height, name] of [[1280, 840, 'wide'], [560, 760, 'compact']]) {
      win.setSize(width, height);
      await run(async () => {
        UI.closeModal(); Views.charQuickModal('c2', 'qianyuanPills', '');
        document.getAnimations().forEach(animation => animation.finish());
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const box = document.querySelector('.modal').getBoundingClientRect();
        if (box.left < 0 || box.right > innerWidth || box.bottom > innerHeight || box.top < 0) throw new Error('快捷弹窗溢出');
        const view = document.getElementById('view');
        if (view.scrollWidth > view.clientWidth) throw new Error('角色页面横向溢出');
        const stepper = document.querySelector('.char-quick-stepper');
        const buttonHeight = stepper.querySelector('button').getBoundingClientRect().height;
        if (Math.abs(stepper.querySelector('input').getBoundingClientRect().height - buttonHeight) > 1) throw new Error('步进按钮与输入框未对齐');
        document.getElementById('toast-root').replaceChildren();
      });
      fs.writeFileSync(path.join(dir, 'character-quick-' + name + '.png'), (await win.webContents.capturePage()).toPNG());
      await run(async () => {
        document.querySelector('.char-quick-details').open = true;
        await new Promise(resolve => requestAnimationFrame(resolve));
        const modal = document.querySelector('.modal');
        if (modal.scrollWidth > modal.clientWidth || modal.getBoundingClientRect().bottom > innerHeight) throw new Error('补充信息布局溢出');
      });
      fs.writeFileSync(path.join(dir, 'character-quick-details-' + name + '.png'), (await win.webContents.capturePage()).toPNG());
    }
    await run(async () => {
      UI.closeModal();
      const view = document.getElementById('view');
      const opener = Views.charFocusTarget('c2', { category: 'qianyuanPills', key: '' });
      opener.scrollIntoView({ block: 'center' });
      const scrollTop = view.scrollTop;
      opener.click(); document.querySelector('[data-step="1"]').click();
      document.querySelector('.modal [data-act="ok"]').click();
      for (let i = 0; i < 150 && document.querySelector('.modal'); i++) await new Promise(resolve => setTimeout(resolve, 20));
      if (Math.abs(view.scrollTop - scrollTop) > 1 || document.activeElement !== Views.charFocusTarget('c2', { category: 'qianyuanPills', key: '' })) throw new Error('下方角色保存未保留滚动与焦点');
    });
    assert.deepEqual(errors, []);
    console.log('[character-quick-edit] PASS: 单项/空值/零值、步进预览、日期说明、居中放弃、真实鼠标键盘、焦点、持久化重启、目标联动、回滚重试、最新档案合并及窄窗口');
    console.log('[character-quick-edit] screenshots:', dir);
    clearTimeout(deadline);
    if (process.argv.includes('--inspect-ui')) {
      win.setSize(1280, 840);
      await run(() => { UI.closeModal(); Views.go('characters'); });
      return;
    }
    win.close(); app.exit(0);
  } catch (error) { console.error('[character-quick-edit] FAIL:', error, '\n测试数据:', dir); app.exit(1); }
});
