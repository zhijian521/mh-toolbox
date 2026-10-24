'use strict';
/* 快速记录页：参考网页版 mh-toolbox OnlineRecord（在线计时 / 点卡 / 物品掉落速记） */
Views._quick = {
  interval: null, recovering: false, busy: false,
  get isOnline() { return !!D.state.activeSession && !this.recovering; },
  get startTime() { return D.state.activeSession ? D.state.activeSession.startAt : null; }
};
Views._quickRange = { preset: 'today' };

Views.QUICK_ITEMS = [
  { id: 1, name: '60武器', img: '60武器.png' }, { id: 2, name: '70武器', img: '70武器.png' }, { id: 3, name: '80武器', img: '80武器.png' },
  { id: 4, name: '60装备', img: '60防具.png' }, { id: 5, name: '70装备', img: '70防具.png' }, { id: 6, name: '80装备', img: '80防具.png' },
  { id: 7, name: '特赦令牌', img: '特赦令牌.png' }, { id: 8, name: '金刚石', img: '金刚石.png' }, { id: 9, name: '定魂珠', img: '定魂珠.png' },
  { id: 10, name: '夜明珠', img: '夜明珠.png' }, { id: 11, name: '龙鳞', img: '龙鳞.png' }, { id: 12, name: '避水珠', img: '避水珠.png' },
  { id: 13, name: '金柳露', img: '金柳露.png' }, { id: 14, name: '超级金柳露', img: '超级金柳露.png' },
  { id: 15, name: '净瓶玉露', img: '净瓶玉露.png' }, { id: 16, name: '超级净瓶玉露', img: '超级净瓶玉露.png' },
  { id: 36, name: '月华露', img: '月华露.png' }, { id: 20, name: '修炼果', img: '修炼果.png' },
  { id: 22, name: '黑宝石', img: '黑宝石.png' }, { id: 23, name: '红玛瑙', img: '红玛瑙.png' },
  { id: 24, name: '太阳石', img: '太阳石.png' }, { id: 25, name: '月亮石', img: '月亮石.png' },
  { id: 26, name: '舍利子', img: '舍利子.png' }, { id: 27, name: '光芒石', img: '光芒石.png' },
  { id: 29, name: '星辉石', img: '星辉石.png' }, { id: 31, name: '精魄灵石', img: '精魄灵石.png' },
  { id: 30, name: '五色灵尘', img: '五色灵尘.gif' },
  { id: 17, name: '强化石', img: '强化石.png' }, { id: 34, name: '符石', img: '符石.png' }, { id: 35, name: '符石卷轴', img: '符石卷轴.png' },
  { id: 19, name: '海马', img: '海马.png' }, { id: 18, name: '摇钱树苗', img: '摇钱树树苗.png' },
  { id: 21, name: '彩果', img: '彩果.png' }, { id: 40, name: '种子', img: '种子.png' },
  { id: 32, name: '乐器', img: '乐器.png' }, { id: 33, name: '玫瑰', img: '玫瑰.png' },
  { id: 38, name: '金银锦盒', img: '金银锦盒.png' }, { id: 39, name: '法宝任务书', img: '法宝任务书.png' }
];

Views.QUICK_UNSET = [
  { id: 99, name: '金币', img: '金币.png' },
  { id: 100, name: '兽决', img: '兽决.png' }, { id: 101, name: '高级兽决', img: '高级兽决.gif' },
  { id: 102, name: '内丹', img: '内丹.png' }, { id: 103, name: '高内丹', img: '高内丹.png' },
  { id: 104, name: '珍珠', img: '珍珠.png' }, { id: 105, name: '附魔', img: '附魔.png' },
  { id: 106, name: '书', img: '书.png' }, { id: 107, name: '铁', img: '铁.png' },
  { id: 108, name: '晶石', img: '晶石.png' }, { id: 109, name: '灵饰书', img: '灵饰书.png' },
  { id: 110, name: '炼妖石', img: '炼妖石.png' }, { id: 111, name: '图册', img: '图册.png' },
  { id: 112, name: '金丹', img: '金丹.png' }, { id: 113, name: '如意丹', img: '如意丹.png' },
  { id: 114, name: '卡', img: '卡.png' }, { id: 115, name: '钟灵石', img: '钟灵石.gif' },
  { id: 116, name: '法宝', img: '法宝.png' }, { id: 117, name: '鬼谷子', img: '鬼谷子.png' },
  { id: 118, name: '瓶子', img: '瓶子.png' }, { id: 200, name: '其他', img: '其他.png' }
];

Views.quickItemById = function (id) {
  return Views.QUICK_ITEMS.concat(Views.QUICK_UNSET).find(function (i) { return i.id === id; });
};

Views.quickCharId = function () {
  if (D.charFilter !== 'all' && D.charById(D.charFilter)) return D.charFilter;
  return (D.state.characters[0] || {}).id;
};

Views.quick = function () {
  const el = document.getElementById('view');
  if (!D.state.characters.length) {
    el.innerHTML = Views.emptyNeedChar('先创建一个角色，再开始快速记录');
    return;
  }
  const q = Views._quick;
  const settings = D.state.quickSettings;
  const charId = Views.quickCharId();
  const char = D.charById(charId);
  const range = U.rangeFor(Views._quickRange);
  const active = D.state.activeSession;

  const quickTxs = D.txIn(D.charFilter, range.from, range.to).filter(t => t.source === 'quick');
  const lootTxs = quickTxs.filter(function (t) { return t.kind === 'income'; }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  const saved = {
    loot: lootTxs.reduce(function (s, t) { return s + (t.recordType === 'item' && t.status === 'held' ? D.itemValue(t) : 0); }, 0)
  };
  const stats = D.earningsStats(D.charFilter, range.from, range.to, q.isOnline);
  const priceText = settings.cardPrice >= 10000 ? (settings.cardPrice / 10000).toFixed(1) + '万' : settings.cardPrice.toLocaleString('zh-CN');

  function itemCard(item) {
    const p = D.itemPrice(item.id);
    return '<button class="quick-item" data-id="' + item.id + '" title="左键记录 · 右键改价">' +
      '<span class="quick-item-img"><img src="assets/images/online-record/' + item.img + '" alt=""></span>' +
      '<span class="quick-item-price' + (p ? '' : ' none') + '">' + (p ? U.esc(U.fmtMoney(p / 10000)) : '未设价') + '</span></button>';
  }

  el.innerHTML =
    '<div data-range-filter="quick"></div>' +
    (active && q.recovering ? '<div class="online-recovery"><span>有未结束的在线记录 · ' + U.esc(D.charName(active.characterId)) +
      '</span><button class="btn btn-sm" data-act="recover">继续计时 / 补填结束时间</button></div>' : '') +
    '<div class="filter-bar quick-controls">' +
      (q.isOnline
        ? '<span class="quick-live"><span class="quick-dot"></span><span id="quick-time">00:00:00</span> · ' + U.esc(D.charName(active.characterId)) + '</span><button class="btn btn-sm btn-ghost" data-act="adjust-start">调整开始时间</button>'
        : '<span class="badge">未开始计时</span>') +
      '<span class="badge gold">今日新记录 · ' + U.esc(char.name) + '</span>' +
      '<button class="quick-chip" data-act="accounts">' + UI.icon('user', 13) + ' ' + U.esc(String(settings.accounts)) + ' 角色</button>' +
      '<button class="quick-chip" data-act="cardprice">' + UI.icon('coin', 13) + ' 点卡 ' + U.esc(priceText) + '</button>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm btn-ghost" data-act="export">导出单价</button>' +
      '<button class="btn btn-sm btn-ghost" data-act="import">导入单价</button>' +
      '<button class="btn" data-act="add-online">补记在线</button>' +
      (active && q.recovering ? '' : q.isOnline
        ? '<button class="btn btn-danger" data-act="stop">■ 结束游戏</button>'
        : '<button class="btn btn-gold" data-act="start">▶ 开始游戏</button>') +
    '</div>' +
    (active ? '<p class="ledger-hint online-running-note">本次计时 · ' + U.esc(D.charName(active.characterId)) + ' · ' + active.accounts +
      ' 角色 · ' + U.fmtMoney(active.cardPrice / 10000) + '/点；上方设置用于下一次计时</p>' : '') +

    '<div class="stat-grid earnings-stats">' +
      '<div class="stat"><div class="k">在线时长</div><div class="v" id="quick-h">' + (stats.onlineMinutes / 60).toFixed(2) + ' 小时</div><div class="d">所选范围 · 含正在计时</div></div>' +
      '<div class="stat bad"><div class="k">点卡消耗</div><div class="v" id="quick-card">' + U.esc(U.fmtMoney(stats.cardCost)) + '</div><div class="d">按每段在线记录的角色数和单价计算</div></div>' +
      '<div class="stat hi"><div class="k">持有物品估值</div><div class="v" id="quick-loot">' + U.esc(U.fmtMoney(saved.loot)) + '</div><div class="d">所选范围速记物品 · 出售后结算收入</div></div>' +
      '<div class="stat ' + (stats.net >= 0 ? 'good' : 'bad') + '"><div class="k">游戏币净收益</div><div class="v" id="quick-balance">' + U.esc(U.fmtMoney(stats.net)) + '</div><div class="d">游戏币收入 − 全部日常成本</div></div>' +
      '<div class="stat"><div class="k">在线净时薪</div><div class="v" id="quick-hourly">' + (stats.hourly == null ? '—' : U.fmtMoney(stats.hourly) + '/时') + '</div><div class="d">游戏币净收益 ÷ 已记录在线时长</div></div>' +
    '</div>' +

    '<div class="quick-main">' +
      '<div class="card">' +
        '<div class="card-title">物品选择<span class="sub">左键快速记录 · 右键修改单价</span></div>' +
        '<p class="quick-section-label">固 定 价 格</p>' +
        '<div class="quick-item-grid">' + Views.QUICK_ITEMS.map(itemCard).join('') + '</div>' +
        '<p class="quick-section-label">未 设 价 格</p>' +
        '<div class="quick-item-grid">' + Views.QUICK_UNSET.map(itemCard).join('') + '</div>' +
      '</div>' +
      '<div class="card quick-result">' +
        '<div class="card-title">掉落记录<span class="sub">所选时间范围</span></div>' +
        '<div class="quick-result-list">' +
          (lootTxs.length ? lootTxs.map(function (t) {
            const item = Views.quickItemById(t.itemId);
            return '<div class="quick-row" data-tid="' + t.id + '">' +
              '<span class="quick-row-img">' + (item ? '<img src="assets/images/online-record/' + item.img + '" alt="">' : UI.icon('book', 16)) + '</span>' +
              '<span class="quick-row-name" title="' + U.esc(t.note || '') + '">' + U.esc(t.itemName || t.note || '物品') + (t.recordType === 'item' ? '<small class="cell-sub">' + U.esc(D.itemStatuses[t.status]) + ' · 估值</small>' : '') + '</span>' +
              '<span class="quick-row-price ' + (t.recordType === 'item' ? 'money-estimate' : '') + '">' + U.esc(U.fmtMoney(t.amount)) + '</span>' +
              '<button class="quick-row-x" title="移除">✕</button></div>';
          }).join('')
          : '<div class="quick-result-empty">该时间范围内暂无速记掉落<br>点击物品图标记录今日掉落</div>') +
        '</div>' +
        '<div class="quick-result-footer">' +
          '<span>共 <b>' + lootTxs.length + '</b> 条 · 持有估值 <b>' + U.esc(U.fmtMoney(saved.loot)) + '</b></span>' +
          '<button class="btn btn-sm btn-ghost" data-act="tolist">查看全部记录</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card online-recent"><div class="card-title">最近在线记录<span class="sub">所选范围 · 展示完整时段</span>' +
      '<button class="btn btn-sm btn-ghost" data-act="online-list">查看在线记录</button></div>' +
      Views.onlineRows(Views.sessionsIn(range).slice(0, 5)) + '</div>';

  UI.dateRange(el.querySelector('[data-range-filter]'), { value: Views._quickRange, label: '收益统计时间',
    onChange: value => { Views._quickRange = value; Views.quick(); } });
  Views.bindOnlineRows(el);
  el.querySelector('[data-act="add-online"]').onclick = () => Views.onlineModal();
  el.querySelector('[data-act="online-list"]').onclick = () => { Views._onlineRange = Object.assign({}, Views._quickRange); Views.go('onlineRecords'); };
  const recovery = el.querySelector('[data-act="recover"]');
  if (recovery) recovery.onclick = Views.recoverOnline;
  const adjust = el.querySelector('[data-act="adjust-start"]');
  if (adjust) adjust.onclick = Views.adjustOnlineStart;

  /* 事件绑定 */
  el.querySelectorAll('.quick-item').forEach(function (card) {
    const item = Views.quickItemById(Number(card.dataset.id));
    card.addEventListener('click', function () {
      if (D.itemPrice(item.id) > 0) Views.quickAddLoot(item);
      else Views.quickPriceDialog(item, true);
    });
    card.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      Views.quickPriceDialog(item, false);
    });
  });

  el.querySelectorAll('.quick-row').forEach(function (row) {
    row.querySelector('.quick-row-x').addEventListener('click', async function () {
      const tx = D.state.transactions.find(function (t) { return t.id === row.dataset.tid; });
      if (tx && tx.saleId && !await UI.confirmModal({ title: '移除已出售物品', message: '关联的成交收入也会删除，确定继续吗？', danger: true })) return;
      D.removeTransaction(row.dataset.tid);
      await D.persist();
      UI.toast('已移除该记录');
      Views.quick();
    });
  });

  el.querySelector('[data-act="accounts"]').addEventListener('click', Views.quickSettingsModal);
  el.querySelector('[data-act="cardprice"]').addEventListener('click', Views.quickSettingsModal);
  el.querySelector('[data-act="export"]').addEventListener('click', Views.quickExportPrices);
  el.querySelector('[data-act="import"]').addEventListener('click', Views.quickImportPrices);
  el.querySelector('[data-act="tolist"]').addEventListener('click', function () { Views.go('transactions'); });
  const startBtn = el.querySelector('[data-act="start"]');
  if (startBtn) startBtn.addEventListener('click', Views.quickStart);
  const stopBtn = el.querySelector('[data-act="stop"]');
  if (stopBtn) stopBtn.addEventListener('click', Views.quickStop);

  /* 计时器：跨页面保持，每秒刷新显示与实时统计 */
  if (q.isOnline && !q.interval) q.interval = setInterval(Views.quickTick, 1000);
  Views.quickTick();
};

Views.quickTick = function () {
  const q = Views._quick;
  if (!q.isOnline || !q.startTime) return;
  const range = U.rangeFor(Views._quickRange);
  const stats = D.earningsStats(D.charFilter, range.from, range.to, true);
  const diff = Date.now() - q.startTime;

  const p2 = function (n) { return String(n).padStart(2, '0'); };
  const tEl = document.getElementById('quick-time');
  if (tEl) tEl.textContent = p2(Math.floor(diff / 3600000)) + ':' + p2(Math.floor(diff / 60000) % 60) + ':' + p2(Math.floor(diff / 1000) % 60);
  const hEl = document.getElementById('quick-h');
  if (hEl) hEl.textContent = (stats.onlineMinutes / 60).toFixed(2) + ' 小时';
  const cEl = document.getElementById('quick-card');
  if (cEl) cEl.textContent = U.fmtMoney(stats.cardCost);
  const bEl = document.getElementById('quick-balance');
  if (bEl) { bEl.textContent = U.fmtMoney(stats.net); bEl.parentElement.className = 'stat ' + (stats.net >= 0 ? 'good' : 'bad'); }
  const hourly = document.getElementById('quick-hourly');
  if (hourly) hourly.textContent = stats.hourly == null ? '—' : U.fmtMoney(stats.hourly) + '/时';
};

Views.quickStart = async function () {
  const q = Views._quick;
  if (q.busy || D.state.activeSession) return;
  q.busy = true;
  try {
    await D.startSession(Views.quickCharId());
    q.recovering = false;
    if (!q.interval) q.interval = setInterval(Views.quickTick, 1000);
    UI.toast('开始记录游戏时间');
    Views.rerender();
  } catch (error) { UI.toast(error.message, 'err'); }
  finally { q.busy = false; }
};

Views.quickStop = async function () {
  const q = Views._quick;
  const active = D.state.activeSession;
  if (q.busy || !q.isOnline || !active) return;
  q.busy = true;
  try {
    const session = await D.saveSession(Object.assign({}, active, { mode: 'range', endAt: Date.now(), source: 'timer' }), active.id);
    Views.clearQuickTimer();
    UI.toast('本段在线 ' + (session.minutes / 60).toFixed(2) + ' 小时，点卡 -' + U.fmtMoney(session.cost));
    Views.rerender();
  } catch (error) { UI.toast(error.message, 'err'); }
  finally { q.busy = false; }
};

Views.quickAddLoot = async function (item) {
  const price = D.itemPrice(item.id);
  if (!price) { Views.quickPriceDialog(item, true); return; }
  D.state.transactions.push({
    id: U.uid(), ledger: 'earnings', recordType: item.id === 99 ? 'money' : 'item', characterId: Views.quickCharId(), date: U.today(),
    kind: 'income', currency: 'cash', amount: Math.round(price / 100) / 100,
    category: '物品掉落', minutes: 0, note: item.name,
    source: 'quick', itemId: item.id, itemName: item.name, quantity: 1, unitPrice: Math.round(price / 100) / 100, status: 'held', createdAt: Date.now()
  });
  await D.persist();
  UI.toast('已记录 ' + item.name + (item.id === 99 ? ' +' : ' · 参考估值 ') + U.fmtMoney(price / 10000));
  Views.quick();
};

Views.quickPriceDialog = function (item, thenAdd) {
  const fields = [];
  if (item.id === 200) fields.push({ key: 'name', label: '物品名称', type: 'text', default: item.name || '其他', placeholder: '自定义名称' });
  fields.push({ key: 'price', label: '单价（万）', type: 'number', required: true, step: 0.1, min: 0, placeholder: '如 8.5' });
  const cur = D.itemPrice(item.id);
  UI.formModal({
    title: '设置单价 · ' + item.name,
    fields: fields,
    values: { price: cur ? cur / 10000 : '' },
    submitText: '确定',
    onSubmit: async function (data) {
      D.setItemPrice(item.id, Math.round(data.price * 10000));
      await D.persist();
      const finalItem = item.id === 200 && data.name ? Object.assign({}, item, { name: data.name }) : item;
      if (thenAdd) {
        await Views.quickAddLoot(finalItem);
      } else {
        UI.toast(item.name + ' 单价已更新为 ' + U.fmtMoney(data.price));
        Views.quick();
      }
    }
  });
};

Views.quickSettingsModal = function () {
  const s = D.state.quickSettings;
  UI.formModal({
    title: '快速记录设置',
    fields: [
      { key: 'accounts', label: '在线角色数', type: 'number', required: true, min: 1, step: 1, hint: '1 ~ 20' },
      { key: 'cardPrice', label: '点卡价格（梦幻币/点）', type: 'number', required: true, min: 1000, step: 1000, hint: '按 6 点/小时 计算消耗' }
    ],
    values: { accounts: s.accounts, cardPrice: s.cardPrice },
    onSubmit: async function (data) {
      s.accounts = Math.min(20, Math.max(1, Math.round(data.accounts) || 1));
      s.cardPrice = Math.max(1000, Math.round(data.cardPrice) || 15000);
      await D.persist();
      UI.toast('设置已保存');
      Views.quick();
    }
  });
};

Views.quickExportPrices = async function () {
  const data = {
    fixed: Views.QUICK_ITEMS.map(function (i) { return { id: i.id, name: i.name, price: D.itemPrice(i.id) }; }),
    unset: Views.QUICK_UNSET.map(function (i) { return { id: i.id, name: i.name, price: D.itemPrice(i.id) }; })
  };
  const r = await window.mh.exportJson(data, '物品价格-' + U.today() + '.json');
  if (r.ok) UI.toast('单价已导出');
  else if (!r.canceled) UI.toast('导出失败：' + (r.error || '未知错误'), 'err');
};

Views.quickImportPrices = async function () {
  const r = await window.mh.importData();
  if (!r.ok) { if (!r.canceled) UI.toast('导入失败：' + (r.error || '文件格式错误'), 'err'); return; }
  const d = r.data || {};
  if (!Array.isArray(d.fixed) || !Array.isArray(d.unset)) {
    UI.toast('文件格式不正确，需包含 fixed / unset 列表', 'err');
    return;
  }
  let n = 0;
  d.fixed.concat(d.unset).forEach(function (it) {
    if (it && it.id && Number(it.price) > 0) {
      D.setItemPrice(it.id, Math.round(Number(it.price)));
      n++;
    }
  });
  await D.persist();
  UI.toast('已导入 ' + n + ' 个物品单价');
  Views.quick();
};
