'use strict';
/* 真实 Electron 流程；仅写系统临时数据，--screenshots 可导出界面验收图。 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-equipment-test-'));
app.setPath('userData', dir);
app.disableHardwareAcceleration();
const legacy = {
  schemaVersion: 3,
  characters: [{ id: 'c1', name: '轻舟听雨', level: 109, school: '大唐官府', server: '紫禁城' },
    { id: 'c2', name: '山月', level: 69, school: '普陀山' }],
  equipment: [
    { id: 'a', characterId: 'c1', name: '偃月青龙刀', slot: '武器', level: 110, status: 'active', attributes: '伤害 +620\n命中 +380', special: '简易', gems: '太阳石 ×8' },
    { id: 'b', characterId: 'c1', name: '秋水长天', slot: '武器', level: 100, status: 'active', attributes: '伤害 +580', special: '破血狂攻' },
    { id: 'hat', characterId: 'c1', name: '白玉龙冠', slot: '头盔', level: 100, status: 'active', attributes: '防御 +68\n魔法 +120', special: '晶清诀', gems: '月亮石 ×7' },
    { id: 'necklace', characterId: 'c1', name: '七彩玲珑', slot: '项链', level: 100, status: 'active', attributes: '灵力 +150', gems: '舍利子 ×6' },
    { id: 'armor', characterId: 'c1', name: '金缕羽衣', slot: '衣服', level: 100, status: 'active', attributes: '防御 +180\n力量 +24\n耐力 +18' },
    { id: 'belt', characterId: 'c1', name: '祥云腰带', slot: '腰带', level: 100, status: 'active', attributes: '气血 +260\n防御 +65', special: '愤怒' },
    { id: 'shoes', characterId: 'c1', name: '平步青云', slot: '鞋子', level: 100, status: 'active', attributes: '敏捷 +42\n防御 +70', gems: '黑宝石 ×7' },
    { id: 'earring', characterId: 'c1', name: '凤羽流苏', slot: '耳饰', level: 100, status: 'active', attributes: '法术防御 +24\n伤害 +12\n伤害 +12', gems: '星辉石 ×5' },
    { id: 'bracelet', characterId: 'c1', name: '紫金玉镯', slot: '手镯', level: 100, status: 'active', attributes: '抵抗封印等级 +24\n气血 +80\n防御 +20' },
    { id: 'pendant', characterId: 'c1', name: '云纹佩', slot: '佩饰', level: 100, status: 'active', attributes: '速度 +18\n气血 +80\n防御 +20' },
    { id: 'sun', characterId: 'c1', name: '上古玉魄·阳', slot: '玉魄·阳', status: 'stored', special: '奇袭法术 +3%',
      jade: { base: '伤害 +15', extra1: '伤害 +8', extra2: '物理暴击等级 +10', dustLevel: 8, holes: 2,
        enchantments: ['野兽之力', '流云诀'], durability: 288 } },
    { id: 'c2', characterId: 'c2', name: '碧玉琵琶', slot: '武器', status: 'active', attributes: '伤害 +300' },
  ],
  transactions: [{ id: 'hat-buy', characterId: 'c1', ledger: 'account', recordType: 'money', category: '装备交易',
    kind: 'expense', equipmentId: 'hat', gearAction: 'buy', amount: 200, currency: 'rmb', date: '2020-01-01' }],
  gearLogs: [{ id: 'hat-log', transactionId: 'hat-buy', equipmentId: 'hat', characterId: 'c1', action: 'buy', amount: 200,
    currency: 'rmb', date: '2020-01-01', createdAt: 1 }],
};
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(legacy));

async function checks(phase) {
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, label) => {
    for (let index = 0; index < 150; index++) { if (predicate()) return; await pause(20); }
    throw new Error('等待失败：' + label + ' / ' + document.getElementById('toast-root').innerText);
  };
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const field = (key, value) => {
    const form = document.getElementById('mform');
    const segment = form.querySelector('.seg[data-key="' + key + '"]');
    if (segment) { segment.querySelector('[data-v="' + value + '"]').click(); return; }
    if (form._xcomps[key]) form._xcomps[key].set(value);
    const input = form.querySelector('[name="' + key + '"]');
    if (input.type === 'checkbox') input.checked = value; else input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const save = async () => {
    document.querySelector('.modal [data-act="ok"]').click();
    await until(() => !document.querySelector('.modal'), '保存表单');
  };
  const click = (selector) => {
    const element = document.querySelector(selector);
    check(!!element, '找不到控件：' + selector); element.click();
  };
  const board = (id = 'c1') => document.querySelector('[data-eq-character="' + id + '"]');
  const switchSet = async (index, characterId = 'c1') => {
    click('[data-eq-character="' + characterId + '"] [data-set="' + index + '"]');
    await until(() => board(characterId).querySelector('[data-set="' + index + '"].on'), '切换方案 ' + index);
  };
  const eq = (id) => D.state.equipment.find((item) => item.id === id);
  const character = () => D.equipmentProfile('c1');
  await until(() => document.querySelectorAll('.nav-item').length === 7, '应用启动');
  if (phase === 'forms') D.setCharFilter('c1');
  Views.go('equipment');
  window.equipmentTestStage = phase + ': 装备页';
  await document.fonts.ready;
  if (phase === 'reload') {
    check(character().equipmentSets[2].name === '难度任务', '重启保留方案改名');
    check(character().viewedEquipmentSet === 2 && character().activeEquipmentSet === 1, '重启区分查看与当前使用');
    check(character().soulJade.level === 12 && character().soulJade.attribute === '气血回复效果', '重启保留角色修炼');
    check(character().equipmentSets[2].slots['玉魄·阴'] && eq(character().equipmentSets[2].slots['玉魄·阴']).jade.enchantments[2] === '金香玉', '重启保留玉魄与开光信息');
    check(!D.equipmentReferences('a').length && !eq('hat'), '重启不恢复已清空引用与已删除装备');
    check(D.state.equipment.filter((item) => item.name === '写入重试测试').length === 1, '失败重试只创建一次');
    check(document.querySelectorAll('.eq-board').length === 2 && document.querySelectorAll('[data-slot]').length === 24,
      '重启正常渲染全部角色与各自十二个格子');
    check(D.equipmentProfile('c2').viewedEquipmentSet === 1 && D.equipmentProfile('c2').activeEquipmentSet === 1,
      '重启保留另一角色独立方案');
    return JSON.stringify(D.state);
  }
  if (phase === 'narrow') {
    const first = board().getBoundingClientRect();
    const second = board('c2').getBoundingClientRect();
    const view = document.getElementById('view');
    check(first.bottom <= second.top, '窄窗口自动换行，角色卡片不重叠');
    check(view.scrollHeight > view.clientHeight, '所有角色卡片可上下滚动');
    check(document.documentElement.scrollWidth <= innerWidth, '窄窗口无页面横向溢出');
    check(view.scrollWidth <= view.clientWidth && second.right <= innerWidth, '全部卡片不越出视口');
    board('c2').scrollIntoView({ block: 'start' }); await frame();
    const scrollTop = view.scrollTop;
    await switchSet(2, 'c2');
    check(Math.abs(view.scrollTop - scrollTop) <= 1 && character().viewedEquipmentSet === 2, '下方角色切换方案保留滚动且不影响其他角色');
    await switchSet(1, 'c2');
    click('[data-eq-character="c2"] [data-act="warehouse"]');
    check(view.scrollTop === 0 && document.querySelector('.eq-warehouse-head').textContent.includes('山月'), '下方角色进入自己的仓库');
    click('[data-act="back"]'); await frame();
    check(Math.abs(view.scrollTop - scrollTop) <= 1, '仓库返回恢复列表滚动位置');
    const jadeSlot = document.querySelector('[data-slot="玉魄·阴"]');
    jadeSlot.focus(); await frame();
    const tooltip = document.querySelector('[role="tooltip"]');
    check(!!tooltip && tooltip.textContent.includes('金香玉'), '键盘滚动到玉魄后仍显示完整属性');
    const bounds = tooltip.getBoundingClientRect();
    check(bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight, '窄窗口玉魄属性卡避让边界');
    jadeSlot.blur(); view.scrollTop = 0; await frame();
    return true;
  }
  check(document.querySelectorAll('.eq-board').length === 2 && board().querySelectorAll('[data-slot]').length === 12 &&
    board('c2').querySelectorAll('[data-slot]').length === 12, '全部角色直接展示各自十二个槽位');
  check(D.charFilter === 'c1' && document.querySelector('.char-filter').hidden && !document.querySelector('[data-character]'),
    '装备展示全部角色，隐藏角色切换并保留其他页面筛选');
  check(!document.querySelector('.eq-notes') && !document.querySelector('.eq-config-count'), '移除右侧摘要');
  check(!document.getElementById('quick-add').hidden && document.getElementById('quick-add').closest('#topbar') &&
    document.getElementById('quick-add').textContent.includes('新增装备') && !document.querySelector('#view [data-act="add"]'),
    '新增装备统一放在顶部标题栏');
  check(board().querySelectorAll('.eq-portrait [data-set]').length === 3 &&
    [...board().querySelectorAll('[data-set]')].map((button) => button.textContent).join('') === '123', '方案简化为人物上方的三个数字');
  const first = board().getBoundingClientRect();
  const second = board('c2').getBoundingClientRect();
  check(first.right <= second.left && first.top === second.top, '宽窗口角色卡片并排展示');
  click('[data-eq-character="c2"] [data-act="copy"]'); field('target', '1'); await save();
  await switchSet(1, 'c2');
  click('[data-eq-character="c2"] [data-act="activate"]');
  await until(() => board('c2').querySelector('[data-set="1"].is-active'), '第二角色切换当前使用');
  check(character().viewedEquipmentSet === 0 && character().activeEquipmentSet === 0, '角色方案切换彼此独立');
  click('[data-eq-character="c2"] [data-slot="武器"]');
  check(document.querySelector('.modal').textContent.includes('碧玉琵琶'), '第二角色格子打开自己的装备');
  click('.modal [data-act="wear"]');
  check(document.querySelector('[data-pick="c2"]') && !document.querySelector('[data-pick="a"]'), '第二角色换装只列出自己的装备');
  click('.modal [data-act="cancel"]');
  check(!character().equipmentSets[0].slots['武器'] && character().equipmentSets[0].slots['头盔'] === 'hat', '旧数据唯一迁移和冲突提示');
  check(document.querySelector('.eq-notice').textContent.includes('武器'), '冲突说明可见');
  click('[data-slot="武器"]'); click('[data-pick="a"]');
  await until(() => !document.querySelector('.modal'), '选择旧武器');
  check(character().equipmentSets[0].slots['武器'] === 'a' && !character().pendingEquipmentSlots.length, '冲突选择完成');
  const sword = document.querySelector('[data-slot="武器"]');
  window.equipmentTestStage = '悬停属性卡';
  sword.dispatchEvent(new MouseEvent('mouseenter'));
  await frame();
  const tooltip = document.querySelector('[role="tooltip"]');
  check(tooltip.textContent.includes('伤害 +620') && tooltip.textContent.includes('命中 +380') && tooltip.textContent.includes('太阳石 ×8'), '悬停完整属性');
  check(getComputedStyle(tooltip).boxShadow === 'none', '属性卡沿用无阴影纸面风格');
  const bounds = tooltip.getBoundingClientRect();
  check(bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight, '属性卡避开视口边缘');
  sword.dispatchEvent(new MouseEvent('mouseleave'));
  check(!document.querySelector('[role="tooltip"]'), '离开关闭浮卡');
  sword.focus(); await frame();
  window.equipmentTestStage = '键盘属性卡';
  check(!!document.querySelector('[role="tooltip"]'), '键盘聚焦查看属性 / ' + JSON.stringify({
    active: document.activeElement.outerHTML.slice(0, 350), scroll: document.getElementById('view').scrollTop,
    described: sword.getAttribute('aria-describedby'), connected: sword.isConnected,
  }));
  sword.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(!document.querySelector('[role="tooltip"]'), 'Esc 关闭属性卡'); sword.blur();
  click('[data-act="copy"]'); field('target', '1'); await save();
  window.equipmentTestStage = '方案换装';
  check(character().equipmentSets[1].slots['武器'] === 'a', '复制引用同一装备');
  await switchSet(1);
  check(character().activeEquipmentSet === 0, '查看方案不改变当前使用');
  click('[data-act="activate"]');
  await until(() => board().querySelector('[data-set="1"].is-active'), '切换当前使用');
  click('[data-slot="武器"]'); click('.modal [data-act="wear"]'); click('[data-pick="b"]');
  await until(() => !document.querySelector('.modal'), '备用方案换装');
  check(character().equipmentSets[0].slots['武器'] === 'a' && character().equipmentSets[1].slots['武器'] === 'b', '换装只影响一套');
  click('[data-slot="戒指"]'); click('.modal [data-act="new"]');
  field('name', '九曜光华'); field('level', 100); field('attributes', '防御 +24\n伤害 +12\n伤害 +12'); field('gems', '星辉石 ×5'); await save();
  check(eq(character().equipmentSets[1].slots['戒指']).name === '九曜光华', '空位新增预填部位并穿戴');
  click('[data-slot="玉魄·阳"]');
  window.equipmentTestStage = '玉魄解锁';
  check(document.querySelector('.modal h3').textContent.includes('命魂之玉'), '未解锁引导设置');
  field('unlocked', true); field('attribute', '气血回复效果'); field('level', 12); await save();
  click('[data-slot="玉魄·阳"]'); click('[data-pick="sun"]');
  await until(() => !document.querySelector('.modal'), '穿戴阳玉');
  click('[data-slot="玉魄·阴"]'); click('.modal [data-act="new"]');
  check(document.getElementById('mform').querySelector('[data-field="gems"]').hidden &&
    !document.getElementById('mform').querySelector('[data-field="jadeBase"]').hidden, '玉魄独立表单');
  field('name', '上古玉魄·阴'); field('jadeBase', '气血 +80'); field('jadeExtra1', '防御 +20'); field('jadeExtra2', '法术防御 +18');
  field('dustLevel', 8); field('holes', '3'); field('hole1', '小还丹'); field('hole2', '九转还魂丹'); field('hole3', '金香玉');
  field('durability', 300); field('special', '物伤化劲 4%'); await save();
  check(character().equipmentSets[1].slots['玉魄·阴'], '新增阴玉配置');
  click('[data-act="rename"]'); field('set0', '日常任务'); field('set1', '日常输出'); field('set2', '难度任务'); await save();
  window.equipmentTestStage = '强化记账';
  click('[data-act="copy"]'); field('target', '2'); await save();
  const count = D.state.equipment.length;
  check(D.equipmentReferences('sun').length === 2 && D.state.transactions.length === 1 && count === 14, '复制不重复资产和成本');
  await switchSet(2);
  check(document.querySelector('.eq-soul-head').textContent.includes('修炼 12 级'), '三套共用命魂之玉');
  click('[data-slot="玉魄·阳"]'); click('.modal [data-act="log"]');
  field('action', 'dust'); field('amount', 80); field('note', '玉魄灵尘投入'); await save();
  const dust = D.accounts().find((tx) => tx.note === '玉魄灵尘投入');
  check(dust && dust.category === '养成投入' && dust.gearAction === 'dust' && D.equipmentReferences('sun').length === 2, '灵尘记账保留穿戴');
  Views.go('accountRecords'); Views.accountModal(dust);
  check(!document.querySelector('.char-filter').hidden && D.charFilter === 'c1', '离开装备页恢复原角色筛选');
  check(document.getElementById('mform')._xcomps.gearAction.get() === 'dust', '编辑强化流水保留动作');
  field('amount', 85); await save();
  check(D.gearLogsOf('sun').filter((log) => log.transactionId === dust.id).length === 1 &&
    D.gearLogsOf('sun').find((log) => log.transactionId === dust.id).amount === 85, '编辑强化流水不重复');
  Views.go('equipment');
  const beforePersist = D.persist;
  window.equipmentTestStage = '失败重试';
  click('#quick-add'); field('slot', '其他'); field('name', '写入重试测试');
  D.persist = async () => { throw new Error('模拟装备写入失败'); };
  click('.modal [data-act="ok"]');
  await until(() => document.getElementById('toast-root').textContent.includes('模拟装备写入失败'), '写入失败提示');
  check(!!document.querySelector('.modal') && !D.state.equipment.some((item) => item.name === '写入重试测试'), '失败保留表单并回滚档案');
  D.persist = beforePersist; await save();
  check(D.state.equipment.filter((item) => item.name === '写入重试测试').length === 1, '重试仅创建一次');
  await switchSet(0);
  window.equipmentTestStage = '售出与删除';
  click('[data-slot="武器"]'); click('.modal [data-act="log"]');
  field('action', 'sell'); field('amount', 500); field('currency', 'rmb'); field('note', '售出日常武器');
  check(!document.querySelector('[data-sale-warning]').hidden && document.querySelector('[data-sale-warning]').textContent.includes('日常任务'), '售出提示受影响方案');
  await save();
  const sale = D.accounts().find((tx) => tx.note === '售出日常武器');
  check(eq('a').status === 'sold' && !D.equipmentReferences('a').length && character().equipmentSets[1].slots['武器'] === 'b', '出售只清理关联装备');
  Views.go('accountRecords'); click('tr[data-id="' + sale.id + '"] [data-act="del"]'); click('.modal [data-act="yes"]');
  await until(() => !D.state.transactions.some((tx) => tx.id === sale.id), '撤销出售');
  check(D.equipmentStatus(eq('a')) === 'stored' && !D.equipmentReferences('a').length, '撤销只恢复持有');
  Views.go('equipment');
  click('[data-act="warehouse"]');
  const search = document.querySelector('[data-f="kw"]'); search.value = '青龙刀'; click('[data-act="search"]');
  check(document.querySelectorAll('tbody tr').length === 1 && document.querySelector('tr[data-id="a"]'), '仓库搜索');
  click('[data-act="reset"]');
  click('[data-mount="group"] button'); click('.xitem[data-v="jade"]');
  check(document.querySelectorAll('tbody tr').length === 2, '仓库玉魄类型筛选');
  click('[data-mount="status"] button'); click('.xitem[data-v="active"]');
  check(document.querySelectorAll('tbody tr').length === 2, '仓库按当前使用方案推导穿戴状态');
  click('[data-mount="slot"] button'); click('.xitem[data-v="玉魄·阴"]');
  check(document.querySelectorAll('tbody tr').length === 1 && document.querySelector('tbody tr').textContent.includes('上古玉魄·阴'), '仓库部位筛选');
  click('[data-act="reset"]'); click('tr[data-id="hat"] [data-act="del"]');
  check(document.querySelector('.modal-body').textContent.includes('日常输出') && document.querySelector('.modal-body').textContent.includes('难度任务'), '删除提示全部引用方案');
  click('.modal [data-act="yes"]');
  await until(() => !eq('hat'), '删除装备');
  check(!D.state.transactions.find((tx) => tx.id === 'hat-buy').equipmentId && !D.equipmentReferences('hat').length, '删除保留账号账单并清空方案');
  click('[data-act="back"]');
  click('[data-eq-character="c2"] [data-act="warehouse"]');
  check(document.querySelectorAll('tbody tr').length === 1 && document.querySelector('tr[data-id="c2"]'), '仓库按角色隔离');
  click('#quick-add');
  check(document.getElementById('mform')._xcomps.characterId.get() === 'c2', '仓库顶部新增预选所属角色');
  click('.modal [data-act="cancel"]');
  click('[data-act="back"]'); await switchSet(2);
  await D.persist();
  return JSON.stringify(D.state);
}

app.whenReady().then(async () => {
  const errors = [];
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, frame: false,
    webPreferences: { preload: path.join(root, 'src/preload/preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const deadline = setTimeout(async () => {
    const state = await win.webContents.executeJavaScript('JSON.stringify({stage:window.equipmentTestStage,focus:document.hasFocus(),active:document.activeElement.outerHTML.slice(0,160),modal:document.querySelector(".modal")?.textContent.slice(0,160)})');
    console.error('[equipment] TIMEOUT:', state); app.exit(1);
  }, 45000);
  try {
    require('../src/main/ipc').registerIpc({ getWindow: () => win });
    win.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message); });
    await win.loadFile(path.join(root, 'src/renderer/index.html'));
    // 后台窗口也发送真实 DOM focus 事件，不打开可见的测试窗口。
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    const run = (phase) => win.webContents.executeJavaScript('(' + checks.toString() + ')(' + JSON.stringify(phase) + ')', true);
    const snapshot = await run('forms');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'data.json'))), JSON.parse(snapshot));
    const loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await loaded;
    assert.deepEqual(JSON.parse(await run('reload')), JSON.parse(snapshot));
    if (process.argv.includes('--screenshots')) {
      await win.webContents.executeJavaScript("Views._eq.warehouse = false; Views.equipment(); document.getElementById('view').scrollTop = 0; document.fonts.ready", true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'equipment-board.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("document.querySelector('[data-slot=\"玉魄·阴\"]').dispatchEvent(new MouseEvent('mouseenter')); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))", true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'equipment-jade.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript("UI.closePop(); document.querySelector('[data-eq-character=\"c1\"] [data-act=\"warehouse\"]').click()", true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'equipment-warehouse.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('Views._eq.warehouse = false; Views.equipment()', true);
    }
    win.setSize(1024, 680);
    await run('narrow');
    if (process.argv.includes('--screenshots')) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      fs.writeFileSync(path.join(dir, 'equipment-narrow.png'), (await win.webContents.capturePage()).toPNG());
    }
    const backups = fs.readdirSync(dir).filter((name) => name.includes('.before-equipment-'));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, backups[0]))), legacy);
    assert.deepEqual(errors, []);
    console.log('[equipment] PASS: 全角色卡片、方案独立切换/复制/改名、悬停与键盘属性卡、玉魄修炼/开光、仓库角色隔离与返回滚动');
    console.log('[equipment] PASS: 强化流水编辑、售出/撤销/删除联动、写入失败重试、真实重启、旧版备份与窄窗口');
    if (process.argv.includes('--screenshots')) console.log('[equipment] screenshots:', dir);
    clearTimeout(deadline); win.close(); app.exit(0);
  } catch (error) {
    console.error('[equipment] FAIL:', error); console.error('测试数据保留于', dir); app.exit(1);
  }
});
