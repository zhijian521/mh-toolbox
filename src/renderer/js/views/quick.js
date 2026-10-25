'use strict';
/* 快速记录页：参考网页版 mh-toolbox OnlineRecord（在线计时 / 点卡 / 物品掉落速记） */
Views._quick = {
  interval: null, recovering: false, busy: false,
  get isOnline() { return !!D.state.activeSession && !this.recovering; },
  get startTime() { return D.state.activeSession ? D.state.activeSession.startAt : null; }
};
Views._quickRange = { preset: 'today' };

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
    loot: lootTxs.reduce(function (s, t) { return s + (t.recordType === 'item' ? D.itemHoldingValue(t) : 0); }, 0)
  };
  Views._quickSettled = { key: [D.charFilter, range.from, range.to].join('|'), stats: D.earningsStats(D.charFilter, range.from, range.to) };
  const stats = q.isOnline ? D.includeActiveEarnings(Views._quickSettled.stats, D.charFilter, range.from, range.to) : Views._quickSettled.stats;
  const priceText = settings.cardPrice >= 10000 ? (settings.cardPrice / 10000).toFixed(1) + '万' : settings.cardPrice.toLocaleString('zh-CN');

  function itemCard(item) {
    const p = D.itemPrice(item.id);
    return '<button class="quick-item" data-id="' + item.id + '" aria-label="记录' + U.esc(item.name) + '" title="' + U.esc(item.name) + ' · 左键记录 · 右键改价">' +
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
              '<span class="quick-row-name" title="' + U.esc(t.note || '') + '">' + U.esc(t.itemName || t.note || '物品') + (t.recordType === 'item' ? '<small class="cell-sub">' + U.esc(D.itemStatuses[t.status]) + ' · 剩余 ' + D.itemRemaining(t) + ' / ' + t.quantity + '</small>' : '') + '</span>' +
              '<span class="quick-row-price ' + (t.recordType === 'item' ? 'money-estimate' : '') + '">' + U.esc(U.fmtMoney(t.recordType === 'item' ? D.itemHoldingValue(t) : t.amount)) + '</span>' +
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
      try {
        await D.commit(() => D.removeTransaction(row.dataset.tid));
        UI.toast('已移除该记录');
        Views.quick();
      } catch (error) { UI.toast(error.message, 'err'); }
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
