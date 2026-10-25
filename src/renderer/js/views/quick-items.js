'use strict';
/* 速记物品目录、价格与库存录入。 */
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

Views.quickAddLoot = async function (item) {
  const price = D.itemPrice(item.id);
  if (!price) { Views.quickPriceDialog(item, true); return; }
  await D.saveTransaction({
    id: U.uid(), ledger: 'earnings', recordType: item.id === 99 ? 'money' : 'item', characterId: Views.quickCharId(), date: U.today(),
    kind: 'income', currency: 'cash', amount: Math.round(price / 100) / 100,
    category: '物品掉落', minutes: 0, note: item.name,
    source: 'quick', itemId: item.id, itemName: item.name, quantity: 1, unitPrice: Math.round(price / 100) / 100, status: 'held', createdAt: Date.now()
  });
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
    validate: (data) => thenAdd && data.price <= 0 ? '记录物品前请设置大于 0 的参考单价' : '',
    onSubmit: async function (data) {
      await D.commit(() => D.setItemPrice(item.id, Math.round(data.price * 10000)));
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
      await D.commit(() => {
        D.state.quickSettings.accounts = Math.min(20, Math.max(1, Math.round(data.accounts) || 1));
        D.state.quickSettings.cardPrice = Math.max(1000, Math.round(data.cardPrice) || 15000);
      });
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
  try {
    await D.commit(() => d.fixed.concat(d.unset).forEach(function (it) {
      if (it && Views.quickItemById(Number(it.id)) && Number.isFinite(Number(it.price)) && Number(it.price) >= 0) {
        D.setItemPrice(it.id, Math.round(Number(it.price)));
        n++;
      }
    }));
  } catch (error) { UI.toast(error.message, 'err'); return; }
  UI.toast('已导入 ' + n + ' 个物品单价');
  Views.quick();
};
