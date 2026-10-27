'use strict';
/* 日常收益：游戏币、日常成本、物品获得与出售 */
Views.transactions = function () { Views.recordList('earnings'); };
Views.txModal = function (tx, moving) {
  if (tx && tx.sessionId) { Views.onlineModal(D.state.sessions.find(s => s.id === tx.sessionId)); return; }
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  const isNew = !tx;
  const sold = tx && tx.recordType === 'item' && tx.status === 'sold';
  const sale = tx && tx.itemRecordId && D.state.transactions.find(function (t) { return t.id === tx.itemRecordId; });
  const defaults = {
    characterId: D.charFilter !== 'all' ? D.charFilter : D.state.characters[0].id,
    date: U.today(), recordType: 'money', kind: 'income', currency: 'cash', category: D.incomeCats[0],
    amount: '', minutes: '', note: '', itemName: '', quantity: 1, unitPrice: '', status: 'held'
  };
  const values = Object.assign(defaults, tx || {}, moving ? {
    recordType: 'money', category: tx.kind === 'expense' ? '其他支出' : '其他收入', currency: 'cash', minutes: 0,
    amount: tx.amount + (tx.kind === 'income' ? -1 : 1) * (tx.fee || 0)
  } : {});
  const catsFor = function (kind) {
    const cats = (kind === 'expense' ? D.expenseCats : D.incomeCats).slice();
    if (tx && !moving && !cats.includes(tx.category)) cats.push(tx.category);
    return cats;
  };
  UI.formModal({
    title: moving ? '转入收益记录' : isNew ? '记收益 / 物品' : '编辑收益记录',
    values: values,
    fields: [
      { key: 'characterId', label: '角色', type: 'select', required: true, options: D.state.characters.map(function (c) { return { v: c.id, t: c.name }; }) },
      { key: 'date', label: '获得 / 记录日期', type: 'date', required: true },
      { key: 'recordType', label: '记录内容', type: 'segment', options: [{ v: 'money', t: '游戏币' }, { v: 'item', t: '物品' }] },
      { key: 'kind', label: '收支类型', type: 'segment', options: [{ v: 'income', t: '收入' }, { v: 'expense', t: '日常支出' }] },
      { key: 'currency', label: '货币', type: 'segment', options: [{ v: 'cash', t: '游戏币现金' }, { v: 'reserve', t: '储备金' }] },
      { key: 'category', label: '来源 / 分类', type: 'select', required: true, options: catsFor(values.kind) },
      { key: 'amount', label: '金额（万）', type: 'number', required: true, step: '0.01', min: 0 },
      { key: 'saleQuantity', label: '本次成交数量', type: 'number', required: true, min: 1, step: 1 },
      { key: 'itemName', label: '物品名称', type: 'text', required: true },
      { key: 'quantity', label: '数量', type: 'number', required: true, min: 1, step: 1 },
      { key: 'unitPrice', label: '参考单价（万 / 件）', type: 'number', required: true, min: 0, step: '0.01', hint: '只记估值，出售后按实际成交额计算收入' },
      { key: 'status', label: '物品状态', type: 'select', options: sold ? [{ v: 'sold', t: '已出售（删除成交记录可恢复持有）' }] : [{ v: 'held', t: '持有' }, { v: 'self', t: '自用' }] },
      { key: 'minutes', label: '活动用时（分钟）', type: 'number', min: 0, hint: '选填，仅记录活动耗时；在线净时薪使用独立在线记录' },
      { key: 'note', label: '备注', type: 'text', full: true }
    ],
    onRender: function (form, api) {
      const update = function () {
        const item = api.getVal('recordType') === 'item';
        ['kind', 'currency', 'amount', 'minutes'].forEach(function (k) { api.show(k, !item); });
        ['itemName', 'quantity', 'unitPrice', 'status'].forEach(function (k) { api.show(k, item); });
        api.show('recordType', isNew && !moving);
        api.show('saleQuantity', !!sale);
      };
      form.addEventListener('segchange', function (e) {
        if (e.detail.key === 'kind' || e.detail.key === 'recordType') {
          api.setOptions('category', catsFor(api.getVal('recordType') === 'item' ? 'income' : api.getVal('kind')));
          update();
        }
      });
      update();
    },
    validate: function (data) {
      if (data.recordType === 'item' && !Number.isInteger(data.quantity)) return '物品数量需为正整数';
      if (sale && (data.characterId !== sale.characterId || data.kind !== 'income' || data.currency !== 'cash' || data.date < sale.date)) return '出售结算需保留原角色、游戏币收入，日期不能早于获得日期';
      return '';
    },
    onSubmit: async function (data) {
      const item = data.recordType === 'item';
      const record = Object.assign({}, tx || { id: U.uid(), createdAt: Date.now() }, data, {
        ledger: 'earnings', kind: item ? 'income' : data.kind, currency: item ? 'cash' : data.currency,
        minutes: item ? 0 : data.minutes || 0, fee: 0
      });
      if (item) record.amount = D.itemValue(data);
      if (moving) { delete record.equipmentId; delete record.gearAction; }
      if (!sale) delete record.saleQuantity;
      await D.saveTransaction(record, tx && tx.id);
      UI.toast(moving ? '已转入收益记录' : '已保存');
      Views.rerender();
    }
  });
};
Views.itemSellModal = function (item) {
  UI.formModal({
    title: '出售物品 · ' + item.itemName + '（剩余 ' + D.itemRemaining(item) + '）',
    values: { date: U.today(), quantity: D.itemRemaining(item), amount: D.itemHoldingValue(item), note: '' },
    fields: [
      { key: 'date', label: '出售日期', type: 'date', required: true },
      { key: 'quantity', label: '本次出售数量', type: 'number', required: true, min: 1, step: 1 },
      { key: 'amount', label: '实际成交总额（万）', type: 'number', required: true, min: 0, step: '0.01', hint: '本次数量的成交总额，生成一条游戏币收入；剩余库存继续保留' },
      { key: 'note', label: '备注', type: 'text', full: true }
    ],
    onRender: (form, api) => {
      form.querySelector('[name="quantity"]').addEventListener('input', () => {
        api.setVal('amount', D.itemValue(item, api.getVal('quantity')));
      });
    },
    validate: function (data) {
      if (!Number.isSafeInteger(data.quantity) || data.quantity > D.itemRemaining(D.state.transactions.find((tx) => tx.id === item.id))) return '出售数量需为正整数，且不能超过剩余数量';
      return data.date < item.date ? '出售日期不能早于获得日期' : '';
    },
    onSubmit: async function (data) {
      await D.commit(() => D.settleItem(item, data));
      UI.toast('已结算实际收入并更新库存'); Views.rerender();
    }
  });
};
Views.emptyNeedChar = function (msg) {
  return '<div class="empty"><div class="ic">' + UI.icon('user', 30) + '</div><p>' + U.esc(msg) + '</p><p>请从左侧「角色」菜单创建角色。</p></div>';
};
