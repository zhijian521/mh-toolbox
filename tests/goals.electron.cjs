'use strict';
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { isolate, createWindow } = require('./helpers/electron.cjs');
const dir = isolate('goals');
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ characters: [
  { id: 'c1', name: '轻舟', school: '大唐官府', progress: { auxiliarySkills: [{ name: '强身术', level: 150 }] } },
  { id: 'c2', name: '山月', school: '龙宫', progress: { auxiliarySkills: [{ name: '强身术', level: 100 }] } },
  { id: 'c3', name: '听雨', school: '化生寺' },
  { id: 'c4', name: '落霞', progress: { auxiliarySkills: [{ name: '强身术', level: 0 }] } },
  { id: 'c5', name: '归帆', progress: { auxiliarySkills: [{ name: '强身术', level: 119 }] } },
] }));

async function flows() {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const until = async (predicate, label) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('等待失败：' + label + ' / ' + document.getElementById('toast-root').textContent);
  };
  const click = (selector) => { const element = document.querySelector(selector); check(element, '缺少控件 ' + selector); element.click(); };
  const field = (name, value) => {
    const form = document.getElementById('mform');
    if (form._xcomps[name]) form._xcomps[name].set(value);
    const input = form.querySelector('[name="' + name + '"]');
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const choose = (selector, value) => { click(selector + ' button'); click('.xpop [data-v="' + value + '"]'); };
  const save = async () => { click('.modal [data-act="ok"]'); await until(() => !document.querySelector('.modal'), '保存'); };
  await until(() => document.querySelectorAll('.nav-item').length === 7, '启动');
  Views.go('goals'); click('#quick-add');
  check(document.getElementById('mform')._xcomps.characterId.get() === 'all', '默认可选全部角色');
  check(!document.querySelector('.modal select'), '统一自定义下拉');
  check(document.querySelector('.goal-form-preview').textContent.includes('1 / 5'), '预览已达标与未知角色');
  choose('[data-xmount="category"]', 'training');
  check(document.getElementById('mform')._xcomps.metricKey.get() === 'attack', '修炼选项联动');
  choose('[data-xmount="category"]', 'qianyuanPills');
  check(document.querySelector('[data-field="metricKey"]').hidden && document.querySelector('[name="unit"]').value === '个', '数量单位与选项联动');
  choose('[data-xmount="category"]', 'auxiliarySkills');
  choose('[data-xmount="characterId"]', 'c2');
  check(document.querySelector('.goal-form-preview').textContent.includes('0 / 1'), '单角色预览');
  choose('[data-xmount="characterId"]', 'all');
  field('deadline', U.today()); await save();
  const automatic = D.state.goals[0];
  window.testAutomaticGoal = automatic.id;
  check(automatic.title.includes('全部角色') && automatic.tracking.key === '强身术', '自动生成全体强身目标');
  let card = document.querySelector('.goal-card[data-id="' + automatic.id + '"]');
  check(card.textContent.includes('1 / 5') && card.textContent.includes('还差 20级') && card.textContent.includes('待补录'), '卡片展示分别达标与差距');
  check(card.querySelectorAll('.goal-member').length === 5 && [...card.querySelectorAll('.goal-member')].every((row) => row.getClientRects().length) &&
    !card.querySelector('details') && !card.querySelector('[data-act="done"]'), '全部角色进度直接显示，自动目标不伪造手动完成');
  check(document.querySelector('.goal-meta').textContent.includes('今天到期'), '到期提示');
  click('.goal-card [data-act="edit"]'); field('target', 121);
  check(document.querySelector('[name="title"]').value === '' && document.querySelector('[name="title"]').placeholder.includes('121级'), '自动名称跟随目标值编辑');
  field('target', 120); await save();

  click('#quick-add'); choose('[data-xmount="type"]', 'money');
  check(document.querySelector('[data-field="source"]').hidden && !document.querySelector('[data-field="unit"]').hidden, '存钱只显示累计字段');
  field('title', '共同存钱'); field('target', 1000); field('deadline', U.addDays(U.today(), -1)); await save();
  const manual = D.state.goals.find((goal) => !goal.tracking);
  choose('[data-mount="sort"]', 'deadline');
  check(document.querySelector('.goal-card').dataset.id === manual.id, '逾期目标优先');
  await D.saveGoalProgress(manual.id, { date: U.today(), delta: 250.5 });
  D.setCharFilter('c2'); Views.rerender();
  check(document.querySelectorAll('.goal-card').length === 2, '筛选单角色仍展示全体目标');
  card = document.querySelector('.goal-card[data-id="' + automatic.id + '"]');
  check(card.querySelector('.goal-nums').textContent.includes('1 / 5'), '全体计算不被单角色筛选缩小');
  choose('[data-mount="type"]', 'progress'); check(document.querySelectorAll('.goal-card').length === 1, '目标类型筛选');
  choose('[data-mount="type"]', '');
  const search = document.querySelector('[data-filter="keyword"]');
  search.value = '共同'; search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check(document.querySelectorAll('.goal-card').length === 1 && document.querySelector('.goal-nums').textContent.includes('250.5万'), '搜索与手动小数进度');
  document.querySelector('[data-filter="keyword"]').value = ''; click('[data-act="search"]');

  click('.goal-card[data-id="' + automatic.id + '"] [data-act="progress"]');
  // 输入顺序跟随固定角色排序，批量保存失败后应保留同一份草稿。
  for (let i = 1; i < 5; i++) field('member' + i, 120);
  field('note', '统一补强身');
  const snapshot = JSON.stringify(D.state), persist = D.persist;
  D.persist = async () => { throw new Error('模拟目标进度写入失败'); };
  click('.modal [data-act="ok"]');
  await until(() => document.querySelector('.modal [data-act="ok"]').textContent !== '保存中…', '失败恢复');
  check(JSON.stringify(D.state) === snapshot && document.querySelector('[name="member1"]').value === '120' &&
    !document.querySelector('[name="member1"]').disabled, '失败整体回滚且保留批量草稿');
  D.persist = persist; await save();
  check(D.goalSummary(automatic).status === 'done' && D.goalGrowthHistory(automatic).length === 4, '全部达成并生成四条角色历史');
  check(!document.querySelector('.goal-card[data-id="' + automatic.id + '"]'), '已完成自动移入完成筛选');
  click('[data-s="done"]');
  check(document.querySelector('.goal-card').textContent.includes('已全部达标'), '已完成计数及卡片');
  click('.goal-card [data-act="history"]');
  check(document.querySelectorAll('.modal tbody tr').length === 4 && document.querySelector('.modal').textContent.includes('统一补强身'), '目标养成历史展示对应角色和说明');
  UI.closeModal();
  check(document.activeElement.dataset.act === 'history', '历史关闭恢复操作焦点');

  Views.go('characters'); Views.charModal(D.charById('c2'));
  const skill = document.querySelector('[data-skills="auxiliarySkills"] [name="skillLevel"]');
  skill.value = 119; skill.dispatchEvent(new Event('input', { bubbles: true })); await save();
  Views.go('goals'); click('[data-s="active"]');
  check(document.querySelector('.goal-card[data-id="' + automatic.id + '"]').textContent.includes('还差 1级'), '角色编辑反向同步目标并恢复进行中');
  Views.go('dashboard');
  check(document.querySelector('.goal-overview-grid').textContent.includes('4 / 5 个角色达标'), '总览与目标页同一计算口径');

  const created = await D.saveCharacter({ name: '新成员' });
  check(D.goalSummary(automatic).members.length === 6 && D.goalSummary(automatic).unknown === 1, '自动包含新增角色');
  await D.removeCharacter(created.id);
  D.setCharFilter('all'); Views.go('goals'); click('[data-s="all"]');
  const result = { snapshot: JSON.stringify(D.state), automaticId: automatic.id };
  return result;
}

async function discardFlows() {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const key = (name, shiftKey = false) => document.activeElement.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }));
  const before = JSON.stringify(D.state);
  Views.go('goals');
  for (const goal of [null, D.state.goals[0]]) {
    Views.goalModal(goal); await frame();
    document.querySelector('.modal [data-act="cancel"]').click();
    check(!document.querySelector('.modal'), '未改动的新增和编辑直接关闭');
    for (const close of ['cancel', 'x', 'escape', 'backdrop']) {
      Views.goalModal(goal); await frame();
      const modal = document.querySelector('.modal'), body = modal.querySelector('.modal-body');
      const title = modal.querySelector('[name="title"]'), note = modal.querySelector('[name="note"]');
      title.value = '未保存的目标草稿'; title.dispatchEvent(new Event('input', { bubbles: true }));
      note.value = '滚动后仍应在中央看到确认'; note.style.minHeight = '420px';
      body.scrollTop = body.scrollHeight;
      const scrollTop = body.scrollTop;
      const trigger = close === 'x' ? modal.querySelector('.modal-x') : modal.querySelector('[data-act="cancel"]');
      trigger.focus({ preventScroll: true });
      if (close === 'escape') key('Escape');
      else if (close === 'backdrop') modal.parentElement.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      else trigger.click();
      await frame();
      const notice = modal.querySelector('.modal-discard'), panel = notice.querySelector('.modal-discard-panel');
      const rect = panel.getBoundingClientRect(), bounds = modal.getBoundingClientRect();
      check(rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth &&
        Math.abs((rect.top + rect.bottom - bounds.top - bounds.bottom) / 2) <= 1, '确认完整显示在长表单中央');
      const resume = notice.querySelector('[data-act="continue"]'), discard = notice.querySelector('[data-act="discard"]');
      check(document.activeElement === resume && modal.getAttribute('role') === 'alertdialog' &&
        modal.getAttribute('aria-describedby') === 'modal-discard-description', '确认焦点与丢失说明可被感知');
      check([...modal.children].filter((element) => element !== notice).every((element) => element.inert), '确认时暂停下层表单操作');
      key('Tab', true); check(document.activeElement === discard, 'Shift Tab 仅在确认操作循环');
      key('Tab'); check(document.activeElement === resume, 'Tab 不进入下层表单');
      modal.querySelector('[data-act="ok"]').click();
      modal.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      UI.requestCloseModal(); await frame();
      check(modal.querySelectorAll('.modal-discard').length === 1 && JSON.stringify(D.state) === before, '确认期间重复关闭及提交不丢失或保存草稿');
      if (close === 'escape') key('Escape'); else resume.click();
      check(!modal.querySelector('.modal-discard') && modal.getAttribute('role') === 'dialog' &&
        modal.getAttribute('aria-labelledby') === 'modal-title' && !modal.hasAttribute('aria-describedby') &&
        !modal.querySelector('[inert]') && document.activeElement === trigger, '继续编辑与 Esc 恢复语义、操作和焦点');
      check(title.value === '未保存的目标草稿' && note.value === '滚动后仍应在中央看到确认' && body.scrollTop === scrollTop,
        '返回编辑保留草稿与滚动位置');
      UI.requestCloseModal(); modal.querySelector('[data-act="discard"]').click();
      check(!document.querySelector('.modal') && JSON.stringify(D.state) === before &&
        document.activeElement === Views.goalFocusTarget(goal?.id), '明确放弃关闭且不改变已保存目标，返回目标操作');
    }
  }
}

async function nativeDiscard(win, run) {
  await run(`Views.goalModal(); document.querySelector('.modal [name="title"]').value = '原生关闭草稿';
    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 8, y: 100, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 8, y: 100, button: 'left', clickCount: 1 });
  await run('new Promise(resolve => requestAnimationFrame(resolve))');
  assert.equal(await run('document.activeElement.dataset.act'), 'continue', '原生点击遮罩后确认保留默认焦点');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await run('new Promise(resolve => requestAnimationFrame(resolve))');
  assert.equal(await run('!!document.querySelector(".modal-discard")'), false, '原生 Esc 返回编辑');
  assert.equal(await run('document.querySelector(".modal [name=title]").value'), '原生关闭草稿');
  await run('UI.closeModal()');
}

async function ordering() {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const until = async (predicate, label) => {
    for (let i = 0; i < 150; i++) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('等待失败：' + label);
  };
  const ids = () => [...document.querySelectorAll('.goal-card')].map((card) => card.dataset.id);
  const card = (id) => [...document.querySelectorAll('.goal-card')].find((item) => item.dataset.id === id);
  const automatic = D.state.goals.find((goal) => goal.tracking), manual = D.state.goals.find((goal) => !goal.tracking);
  Views._goalFilter.sort = 'manual'; Views.goals();
  check(!document.querySelector('.goal-card [data-act="pin"], .goal-card [data-act="sort"]') &&
    [...document.querySelectorAll('.goal-card')].every(item => item.querySelectorAll('[data-act="move"]').length === 1), '目标仅保留一个拖动排序手柄');
  const mount = document.querySelector('[data-mount="sort"]');
  mount.querySelector('button').click(); document.querySelector('.xpop [data-v="deadline"]').click();
  const drag = (from, to, after = false) => {
    const handle = card(from).querySelector('[data-act="move"]'), target = card(to);
    const origin = handle.getBoundingClientRect(), bounds = target.getBoundingClientRect();
    const sourceBounds = card(from).getBoundingClientRect();
    const row = Math.abs(sourceBounds.top - bounds.top) < 1;
    const x = bounds.left + bounds.width * (row ? after ? .8 : .2 : .5);
    const y = bounds.top + bounds.height * (row ? .5 : after ? .8 : .2);
    const dataTransfer = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer, clientX: origin.left + 10, clientY: origin.top + 10 }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y }));
    check(target.dataset.dropSide, '拖动目标显示插入位置');
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer, clientX: x, clientY: y }));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
  };
  drag(automatic.id, manual.id);
  await until(() => !Views._goalOrderPending, '拖动保存');
  check(ids()[0] === automatic.id && Views._goalFilter.sort === 'manual', '拖动保存到自定义顺序');
  const handle = card(automatic.id).querySelector('[data-act="move"]'); handle.focus();
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  await until(() => !Views._goalOrderPending, '键盘排序');
  check(ids()[0] === manual.id && document.activeElement.dataset.act === 'move', '键盘排序及焦点恢复');
  const snapshot = JSON.stringify(D.state), before = ids().join(','), persist = D.persist;
  D.persist = async () => { throw new Error('模拟排序失败'); };
  drag(automatic.id, manual.id);
  await until(() => !Views._goalOrderPending, '拖动失败恢复');
  check(JSON.stringify(D.state) === snapshot && ids().join(',') === before &&
    !document.querySelector('.is-dragging, [data-drop-side], .card-drag-handle:disabled'), '拖动失败不改顺序并恢复控件');
  D.persist = persist;
  drag(automatic.id, manual.id); await until(() => !Views._goalOrderPending, '重试拖动');
  Views.go('dashboard');
  check(document.querySelector('.goal-overview-grid .card-title').textContent === automatic.title, '总览遵循拖动后的目标顺序');
  Views.go('goals'); Views._goalFilter.status = 'all'; Views.goals();
  return JSON.stringify(D.state);
}

async function nativeDrag(win, run) {
  const temporaryId = await run(`D.saveGoal({ characterId: 'all', type: 'money', title: '拖动验证', target: 100 })
    .then(goal => { Views.goals(); return goal.id; })`);
  const points = await run(`(() => {
    const source = D.state.goals.find(goal => goal.title === '共同存钱');
    const cards = [...document.querySelectorAll('.goal-card')];
    const from = cards.find(card => card.dataset.id === source.id).querySelector('[data-act="move"]').getBoundingClientRect();
    const to = cards.find(card => card.dataset.id === ${JSON.stringify(temporaryId)}).getBoundingClientRect();
    return { from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
      to: { x: to.left + to.width * .2, y: to.top + 30 }, sourceId: source.id };
  })()`);
  let timer, onDrag;
  const intercepted = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('未触发原生拖动')), 3000);
    onDrag = (_event, method, params) => {
      if (method === 'Input.dragIntercepted') { clearTimeout(timer); resolve(params.data); }
    };
  });
  win.webContents.debugger.on('message', onDrag);
  await win.webContents.debugger.sendCommand('Input.setInterceptDrags', { enabled: true });
  try {
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.from });
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...points.from, button: 'left', buttons: 1, clickCount: 1 });
    await run('new Promise(resolve => requestAnimationFrame(resolve))');
    for (const distance of [8, 24, 48]) {
      await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: points.from.x - distance, y: points.from.y + 8, button: 'left', buttons: 1 });
    }
    const data = await intercepted;
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await win.webContents.debugger.sendCommand('Input.dispatchDragEvent', { type, ...points.to, data });
    }
    await run(`new Promise((resolve, reject) => {
      let tries = 0; const poll = () => {
        const ids = [...document.querySelectorAll('.goal-card')].map(card => card.dataset.id);
        if (!Views._goalOrderPending && ids.indexOf(${JSON.stringify(points.sourceId)}) < ids.indexOf(${JSON.stringify(temporaryId)})) { resolve(); return; }
        if (++tries > 150) { reject(new Error('原生拖动未保存顺序')); return; }
        setTimeout(poll, 20);
      }; poll();
    })`);
  } finally {
    clearTimeout(timer); win.webContents.debugger.removeListener('message', onDrag);
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...points.to, button: 'left', clickCount: 1 });
    await win.webContents.debugger.sendCommand('Input.setInterceptDrags', { enabled: false });
  }
  return run(`D.removeGoal(${JSON.stringify(temporaryId)}).then(() => { Views.goals(); return JSON.stringify(D.state); })`);
}

async function nativeNumberValidation(win, run) {
  await run(`new Promise((resolve, reject) => {
    let tries = 0; const poll = () => {
      if (document.querySelectorAll('.nav-item').length === 7) { resolve(); return; }
      if (++tries > 150) { reject(new Error('启动超时')); return; }
      setTimeout(poll, 20);
    }; poll();
  })`);
  const original = await run('JSON.stringify(D.state)');
  await run(`(async () => {
    const goal = await D.saveGoal({ characterId: 'c2', type: 'progress', target: 120,
      tracking: { category: 'auxiliarySkills', key: '强身术' } });
    window.numberValidationGoal = goal.id; Views.go('goals'); Views.goalGrowthModal(goal);
  })()`);
  const before = await run('JSON.stringify(D.state)');
  for (const text of ['e', '1e', '-']) {
    await run(`{ const input = document.querySelector('[name="member0"]'); input.value = ''; input.focus(); }
      new Promise(resolve => requestAnimationFrame(resolve))`);
    await win.webContents.insertText(text);
    assert.equal(await run(`document.querySelector('[name="member0"]').validity.badInput`), true, '实际键盘形成错误数字：' + text + ' / ' + await run(`document.querySelector('[name="member0"]').value`));
    await run(`document.querySelector('.modal [data-act="ok"]').click(); D._commitQueue`);
    assert.equal(await run('JSON.stringify(D.state)'), before, '错误数字不修改档案或历史');
    assert.equal(await run(`!!document.querySelector('.modal') && !document.querySelector('.modal [data-act="ok"]').disabled`), true);
  }
  await run(`document.querySelector('[name="member0"]').value = ''; document.querySelector('.modal [data-act="ok"]').click(); D._commitQueue`);
  assert.equal(await run(`D.charById('c2').progress.auxiliarySkills[0].level`), null, '主动留空仍可清空');
  await run(`UI.closeModal(); Views.goalGrowthModal(D.state.goals.find(goal => goal.id === window.numberValidationGoal)); document.querySelector('[name="member0"]').focus()`);
  await win.webContents.insertText('e');
  await run(`document.querySelector('.modal [data-act="cancel"]').click()`);
  assert.equal(await run(`!!document.querySelector('.modal-discard')`), true, '空值上的错误输入也触发草稿确认');
  await run(`document.querySelector('[data-act="continue"]').click(); document.querySelector('[name="member0"]').value = '0'; document.querySelector('.modal [data-act="ok"]').click(); D._commitQueue`);
  assert.equal(await run(`D.charById('c2').progress.auxiliarySkills[0].level`), 0, '明确的零值正常保存');
  assert.equal(await run(`D.charById('c2').growthHistory.length`), 2, '错误提交不生成额外历史');
  await run(`UI.closeModal(); D.replaceState(JSON.parse(${JSON.stringify(original)}))`);
}

async function historyFlows() {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const click = (selector) => document.querySelector(selector).click();
  const before = JSON.stringify(D.state), filter = { ...Views._goalFilter }, charFilter = D.charFilter;
  const goal = await D.saveGoal({ characterId: 'c2', type: 'progress', target: 1000,
    tracking: { category: 'potentialFruits', key: '' } });
  for (let i = 1; i <= 15; i++) await D.saveGoalGrowth(goal.id, { c2: i }, { date: i === 15 ? U.today() : '2026-01-01' });
  Views.goalHistoryModal(goal.id);
  check(document.querySelectorAll('.modal tbody tr').length === 12 && document.querySelector('.ledger-pagination').textContent.includes('共 15 次变更'), '目标养成记录分页');
  click('[data-page="next"]');
  check(document.querySelectorAll('.modal tbody tr').length === 3 && document.activeElement.dataset.page === 'previous', '目标末页边界与焦点');
  click('[data-range="today"]');
  check(document.querySelectorAll('.modal tbody tr').length === 1 && document.activeElement.dataset.range === 'today', '目标日期筛选及分页复位');
  check(D.charFilter === charFilter, '目标历史筛选不改变全局角色范围');
  check(document.querySelector('.goal-history-kind').textContent.includes('提升 +1'), '目标与角色使用相同的变更类型和增量');
  UI.closeModal();

  const skill = await D.saveGoal({ characterId: 'c2', type: 'progress', target: 10,
    tracking: { category: 'auxiliarySkills', key: '记录验证技能' } });
  await D.saveGoalGrowth(skill.id, { c2: 1 });
  await D.saveCharacterValue('c2', 'auxiliarySkills', '记录验证技能', '');
  await D.saveCharacterProgress('c2', { auxiliarySkills: D.charById('c2').progress.auxiliarySkills.filter(item => item.name !== '记录验证技能') });
  Views.goalHistoryModal(skill.id);
  const rows = [...document.querySelectorAll('.modal tbody tr')];
  check(rows.length === 3 && rows.some(row => row.textContent.includes('未添加') && row.textContent.includes('新增')) &&
    rows.some(row => row.textContent.includes('清空')) && rows.some(row => row.textContent.includes('已移除') && row.textContent.includes('移除')), '新增、清空和移除在目标历史中可区分');
  UI.closeModal();

  const manual = await D.saveGoal({ characterId: 'c2', type: 'money', target: 1000, unit: '万' });
  for (let i = 0; i < 15; i++) await D.saveGoalProgress(manual.id, { date: '2026-01-02', delta: 10 });
  Views.goalHistoryModal(manual.id); click('[data-page="next"]'); click('.modal tbody [data-act="delete"]');
  click('.modal [data-act="yes"]');
  for (let i = 0; i < 100 && !document.querySelector('.goal-history-modal'); i++) await new Promise(resolve => setTimeout(resolve, 20));
  check(document.querySelectorAll('.modal tbody tr').length === 2 && document.querySelector('.ledger-pagination').textContent.includes('2 / 2'), '删除记录后保留分页并重新计算');
  click('[data-range="today"]');
  check(document.querySelector('[data-history="records"] .empty').textContent.includes('此时间范围'), '目标手动历史筛选空态');
  UI.closeModal();
  await D.replaceState(JSON.parse(before)); Object.assign(Views._goalFilter, filter); Views.go('goals');
}

app.whenReady().then(async () => {
  const errors = [], deadline = setTimeout(() => { console.error('[goals] 超时'); app.exit(1); }, 60000);
  try {
    let win;
    require('../src/main/ipc').registerIpc({ getWindow: () => win });
    win = await createWindow(errors);
    const run = (code) => win.webContents.executeJavaScript(code, true);
    await nativeNumberValidation(win, run);
    const result = await run('(' + flows.toString() + ')()');
    await run('(' + historyFlows.toString() + ')()');
    result.snapshot = await run('(' + ordering.toString() + ')()');
    result.snapshot = await nativeDrag(win, run);
    for (const [width, height, name] of [[1280, 840, 'wide'], [1024, 680, 'narrow']]) {
      win.setSize(width, height);
      await run(`Views.goalHistoryModal(${JSON.stringify(result.automaticId)}); document.getElementById('toast-root').replaceChildren();
        document.fonts.ready.then(() => { document.getAnimations().forEach(animation => animation.finish());
          return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })`);
      assert.equal(await run(`(() => { const modal = document.querySelector('.modal'), body = modal.querySelector('.modal-body');
        const bounds = modal.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= innerHeight &&
          bounds.left >= 0 && bounds.right <= innerWidth && body.scrollWidth <= body.clientWidth; })()`), true, '目标历史窄窗口不溢出');
      fs.writeFileSync(path.join(dir, 'goal-history-' + name + '.png'), (await win.webContents.capturePage()).toPNG());
      await run('UI.closeModal()');
    }
    win.setSize(1280, 840);
    await run('(' + discardFlows.toString() + ')()');
    await nativeDiscard(win, run);
    const frame = () => run('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
    await run("document.getElementById('toast-root').replaceChildren()"); await frame();
    fs.writeFileSync(path.join(dir, 'goals.png'), (await win.webContents.capturePage()).toPNG());
    win.setSize(1024, 680); await frame();
    await run('(' + discardFlows.toString() + ')()');
    await nativeDiscard(win, run);
    assert.equal(await run('document.getElementById("view").scrollWidth <= document.getElementById("view").clientWidth'), true);
    await run("Views.goalModal(); document.getElementById('toast-root').replaceChildren()"); await frame();
    await run('new Promise(resolve => setTimeout(resolve, 200))');
    assert.equal(await run('document.querySelector(".modal").getBoundingClientRect().bottom <= innerHeight && document.querySelector(".modal-foot").getBoundingClientRect().bottom <= innerHeight'), true);
    fs.writeFileSync(path.join(dir, 'goal-create-narrow.png'), (await win.webContents.capturePage()).toPNG());
    await run('UI.closeModal()');
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded;
    const restored = await run(`new Promise((resolve, reject) => {
      let tries = 0; const poll = () => {
        if (document.querySelectorAll('.nav-item').length === 7) { resolve(JSON.stringify(D.state)); return; }
        if (++tries > 150) { reject(new Error('重启超时')); return; }
        setTimeout(poll, 20);
      }; poll();
    })`);
    assert.deepEqual(JSON.parse(restored), JSON.parse(result.snapshot));
    assert.equal(await run('D.goalSummary(D.state.goals.find(goal => goal.id === ' + JSON.stringify(result.automaticId) + ')).achieved'), 4);
    assert.equal(await run('!document.querySelector(".goal-card [data-act=pin]") && !!document.querySelector(".goal-card [data-act=move]")'), true);
    assert.deepEqual(errors, []);
    console.log('[goals] PASS: 全角色/单角色创建、统一下拉与单位联动、自动名称、逐角色进度、筛选搜索及逾期排序');
    console.log('[goals] PASS: 批量更新、失败回滚重试、角色档案和历史联动、自动完成/恢复、总览、动态成员、窄窗口及真实重启');
    console.log('[goals] PASS: 全成员展开、单一排序手柄、原生鼠标拖动和键盘排序、自动排序切换、失败回滚及重启顺序');
    console.log('[goals] PASS: 新增/编辑未改动直接关闭，长表单居中确认、四种关闭入口、焦点与 Esc、草稿保留、放弃及窄窗口');
    console.log('[goals] PASS: 真实错误数字不清空档案、主动留空和零值、目标历史日期筛选/分页/删除保留页码及统一变更类型');
    console.log('[goals] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) { console.error('[goals] FAIL:', error, '\n测试数据：', dir); clearTimeout(deadline); app.exit(1); }
});
