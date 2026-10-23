'use strict';
/* 账号账本：人民币与梦幻币分开记录，装备交易关联时间线 */
Views.account = function () { Views.recordList('account'); };
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
