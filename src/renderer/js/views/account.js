'use strict';
/* 账号账本：快捷记账、独立币种汇总与交易明细 */
Views._accountRange = { preset: 'month' };
Views.ACCOUNT_SHORTCUTS = [
  { id: 'gear-buy', title: '买入装备', icon: 'sword', hint: '藏宝阁 · 人民币',
    preset: { category: '装备交易', kind: 'expense', currency: 'rmb', channel: '藏宝阁' } },
  { id: 'gear-sell', title: '卖出装备', icon: 'sword', hint: '藏宝阁 · 人民币',
    preset: { category: '装备交易', kind: 'income', currency: 'rmb', channel: '藏宝阁' } },
  { id: 'pet-buy', title: '买入召唤兽', icon: 'pet', hint: '藏宝阁 · 人民币',
    preset: { category: '召唤兽交易', kind: 'expense', currency: 'rmb', channel: '藏宝阁' } },
  { id: 'pet-sell', title: '卖出召唤兽', icon: 'pet', hint: '藏宝阁 · 人民币',
    preset: { category: '召唤兽交易', kind: 'income', currency: 'rmb', channel: '藏宝阁' } },
  { id: 'topup', title: '点卡充值', icon: 'coin', hint: '官方充值 · 人民币',
    preset: { category: '点卡充值', kind: 'expense', currency: 'rmb', channel: '官方充值' } },
  { id: 'coin-buy', title: '买入游戏币', icon: 'coin', hint: '游戏内 · 人民币',
    preset: { category: '游戏币买入', kind: 'expense', currency: 'rmb', channel: '游戏内' } },
  { id: 'coin-sell', title: '卖出游戏币', icon: 'coin', hint: '游戏内 · 人民币',
    preset: { category: '游戏币卖出', kind: 'income', currency: 'rmb', channel: '游戏内' } },
  { id: 'progress', title: '养成投入', icon: 'target', hint: '游戏内 · 梦幻币',
    preset: { category: '养成投入', kind: 'expense', currency: 'cash', channel: '游戏内' } },
  { id: 'other', title: '其他收支', icon: 'ledger', hint: '自选方向与币种',
    preset: { category: '其他收支', kind: 'expense', currency: 'rmb', channel: '其他' } }
];

Views.accountRecords = function () { Views.recordList('account'); };
Views.account = function () {
  const el = document.getElementById('view');
  if (!D.state.characters.length) {
    el.innerHTML = Views.emptyNeedChar('先创建一个角色，再记录账号收支');
    return;
  }
  const range = U.rangeFor(Views._accountRange);
  const selected = D.txIn(D.charFilter, range.from, range.to, 'account');
  const records = D.scope(D.accounts()).sort(function (a, b) {
    return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
  });
  const recent = records.slice(0, 8);
  el.innerHTML =
    '<div data-range-filter="account"></div>' +
    '<div class="ledger-overview-grid account-quick-totals">' + ['rmb', 'cash'].map(function (currency) {
      const st = D.accountStats(selected, currency);
      return '<div class="card"><div class="card-title">' + (currency === 'rmb' ? '人民币收支' : '梦幻币收支') +
        '<span class="sub">含手续费 · ' + st.count + ' 笔</span></div><div class="account-metrics">' +
        Views.statHtml('收入', U.fmtAmount(st.income, currency), 'good') +
        Views.statHtml('支出', U.fmtAmount(st.expense, currency), 'bad') +
        Views.statHtml('收支差额', U.fmtAmount(st.net, currency), st.net >= 0 ? 'good' : 'bad') + '</div></div>';
    }).join('') + '</div>' +
    '<div class="quick-main"><div class="card">' +
      '<div class="card-title">快捷记账<span class="sub">选择类型后填写金额</span></div>' +
      '<div class="account-shortcut-grid">' + Views.ACCOUNT_SHORTCUTS.map(function (shortcut) {
        const income = shortcut.preset.kind === 'income';
        return '<button type="button" class="account-shortcut" data-shortcut="' + shortcut.id + '">' +
          '<span class="account-shortcut-head">' + UI.icon(shortcut.icon, 22) + '<span class="badge ' + (income ? 'in' : 'out') + '">' +
          (income ? '收入' : '支出') + '</span></span><b>' + shortcut.title + '</b><span class="account-shortcut-hint">' + shortcut.hint + '</span></button>';
      }).join('') + '</div></div>' +
      '<div class="card quick-result"><div class="card-title">最近记录<span class="sub">全部时间 · 点击编辑</span></div>' +
      '<div class="quick-result-list">' + (recent.length ? recent.map(function (tx) {
        const income = tx.kind === 'income';
        const amount = tx.amount + (income ? -1 : 1) * (tx.fee || 0);
        const currency = tx.currency === 'rmb' ? '人民币' : tx.currency === 'reserve' ? '储备金' : '梦幻币';
        return '<button type="button" class="account-recent-row" data-record="' + U.esc(tx.id) + '" title="编辑这条账号记录">' +
          '<span class="account-recent-content"><span class="account-recent-title">' + U.esc(tx.note || tx.category) + '</span>' +
          '<span class="account-recent-meta">' + U.esc(tx.date + ' · ' + D.charName(tx.characterId) + ' · ' + currency) + '</span></span>' +
          '<span class="' + (income ? 'money-in' : 'money-out') + '">' + (income ? '+' : '−') + U.fmtAmount(amount, tx.currency) + '</span></button>';
      }).join('') : '<div class="quick-result-empty">选择左侧记账类型<br>记录第一笔账号收支</div>') + '</div>' +
      '<div class="quick-result-footer"><span>共 <b>' + records.length + '</b> 笔账号记录</span>' +
        '<button class="btn btn-sm btn-ghost" data-act="tolist">查看全部记录</button></div></div></div>';
  UI.dateRange(el.querySelector('[data-range-filter="account"]'), {
    value: Views._accountRange, label: '账号统计时间',
    onChange: function (value) { Views._accountRange = value; Views.account(); }
  });
  el.querySelectorAll('[data-shortcut]').forEach(function (button) {
    button.addEventListener('click', function () {
      const shortcut = Views.ACCOUNT_SHORTCUTS.find(function (s) { return s.id === button.dataset.shortcut; });
      Views.accountModal(null, false, shortcut.preset);
    });
  });
  el.querySelectorAll('[data-record]').forEach(function (button) {
    button.addEventListener('click', function () {
      Views.accountModal(D.state.transactions.find(function (tx) { return tx.id === button.dataset.record; }));
    });
  });
  el.querySelector('[data-act="tolist"]').addEventListener('click', function () { Views.go('accountRecords'); });
};

Views.accountModal = function (tx, moving, preset) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  const isNew = !tx;
  const values = Object.assign({
    characterId: D.charFilter !== 'all' ? D.charFilter : D.state.characters[0].id,
    date: U.today(), kind: 'expense', currency: 'rmb', category: '装备交易', channel: '藏宝阁',
    amount: '', fee: 0, equipmentId: '', gearAction: '', note: ''
  }, tx || {}, moving ? { category: '其他收支', fee: 0 } : {}, preset || {});
  if (!['craft', 'gem'].includes(values.gearAction)) values.gearAction = '';
  const categories = D.accountCats.slice();
  if (!categories.includes(values.category)) categories.push(values.category);
  UI.formModal({
    title: moving ? '转入账号账本' : isNew ? '记账号收支' : '编辑账号收支',
    values: values,
    fields: [
      { key: 'characterId', label: '角色', type: 'select', required: true, options: D.state.characters.map(function (c) { return { v: c.id, t: c.name }; }) },
      { key: 'date', label: '日期', type: 'date', required: true },
      { key: 'category', label: '分类', type: 'select', required: true, options: categories },
      { key: 'kind', label: '收支方向', type: 'segment', options: [{ v: 'expense', t: '支出 / 买入' }, { v: 'income', t: '收入 / 卖出' }] },
      { key: 'currency', label: '币种', type: 'segment', options: [{ v: 'rmb', t: '人民币 · 元' }, { v: 'cash', t: '梦幻币 · 万' }].concat(values.currency === 'reserve' ? [{ v: 'reserve', t: '储备金 · 万（旧记录）' }] : []) },
      { key: 'channel', label: '交易渠道', type: 'select', options: D.channels },
      { key: 'amount', label: '成交金额', type: 'number', required: true, min: 0, step: '0.01' },
      { key: 'fee', label: '手续费', type: 'number', min: 0, step: '0.01', hint: '收入扣除、支出加上；与成交金额币种一致' },
      { key: 'equipmentId', label: '关联装备', type: 'select', options: [{ v: '', t: '不关联装备' }], hint: '先在装备页建档；关联后自动记入更新时间线' },
      { key: 'gearAction', label: '装备变动', type: 'select', options: [{ v: '', t: '按收支方向（买入 / 卖出）' }, { v: 'craft', t: '打造' }, { v: 'gem', t: '镶嵌宝石' }] },
      { key: 'note', label: '记录内容 / 备注', type: 'text', full: true, placeholder: '如：藏宝阁购入简易武器 / 充值 100 元点卡' }
    ],
    onRender: function (form, api) {
      const updateEquipment = function () {
        api.setOptions('equipmentId', [{ v: '', t: '不关联装备' }].concat(D.state.equipment.filter(function (e) {
          return e.characterId === api.getVal('characterId');
        }).map(function (e) { return { v: e.id, t: e.name }; })));
      };
      const update = function () {
        const equipment = ['装备交易', '养成投入'].includes(api.getVal('category'));
        api.show('equipmentId', equipment); api.show('gearAction', equipment);
        const unit = api.getVal('currency') === 'rmb' ? '元' : '万梦幻币';
        form.querySelector('[data-field="amount"] label').textContent = '成交金额（' + unit + '）';
        form.querySelector('[data-field="fee"] label').textContent = '手续费（' + unit + '）';
      };
      form.addEventListener('change', function (e) {
        if (e.target.closest('[data-xmount="characterId"]')) updateEquipment();
        if (e.target.closest('[data-xmount="category"]')) {
          const category = api.getVal('category');
          if (category === '点卡充值' && isNew) {
            api.setVal('kind', 'expense'); api.setVal('currency', 'rmb'); api.setVal('channel', '官方充值');
          }
        }
        update();
      });
      form.addEventListener('segchange', update);
      updateEquipment(); api.setVal('equipmentId', values.equipmentId); api.setVal('gearAction', values.gearAction); update();
    },
    validate: function (data) {
      if (data.kind === 'income' && (data.fee || 0) > data.amount) return '手续费不能超过收入金额';
      if (data.equipmentId && ['装备交易', '养成投入'].includes(data.category)) {
        const eq = D.state.equipment.find(function (e) { return e.id === data.equipmentId; });
        if (!eq || eq.characterId !== data.characterId) return '请选择属于当前角色的装备';
        if (['craft', 'gem'].includes(data.gearAction) && data.kind === 'income') return '打造、镶嵌宝石应记为支出';
      }
      return '';
    },
    onSubmit: async function (data) {
      const previousEquipment = tx && tx.equipmentId;
      const record = Object.assign({}, tx || { id: U.uid(), createdAt: Date.now() }, data, {
        ledger: 'account', recordType: 'money', minutes: 0, fee: data.fee || 0,
        equipmentId: ['装备交易', '养成投入'].includes(data.category) ? data.equipmentId : '',
        gearAction: ['装备交易', '养成投入'].includes(data.category) ? data.gearAction : ''
      });
      if (isNew) D.state.transactions.push(record); else Object.assign(tx, record);
      D.syncAccountEquipment(record);
      if (previousEquipment && previousEquipment !== record.equipmentId) D.syncEquipmentStatus(previousEquipment);
      await D.persist(); UI.toast(moving ? '已转入账号账本' : '已保存'); Views.rerender();
    }
  });
};
