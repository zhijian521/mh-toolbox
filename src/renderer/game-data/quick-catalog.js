// @ts-check

/**
 * 速记物品目录的纯数据部分：只有 id、名称与图标文件名。
 *
 * 为什么和 `quick-items.js` 分开：那个文件用 `import.meta.glob` 拿图标 URL，是 Vite
 * 专属语法，Node 下直接报「glob is not a function」。领域层的单价表导入导出需要这份
 * 目录来校验 id，一旦 import 了带 glob 的文件，整套领域测试都会在加载阶段就崩。
 * 所以纯数据留在这里，图片 URL 由界面侧补齐。
 *
 * 名单调整前先确认游戏内说法，并同步 `docs/VALIDATION.md`。
 */

/** 固定参考价位的常见掉落：记一条就按历史单价估价入库。 */
export const fixedItemMeta = [
    { id: 1, name: '60武器', img: '60武器.png' },
    { id: 2, name: '70武器', img: '70武器.png' },
    { id: 3, name: '80武器', img: '80武器.png' },
    { id: 4, name: '60装备', img: '60防具.png' },
    { id: 5, name: '70装备', img: '70防具.png' },
    { id: 6, name: '80装备', img: '80防具.png' },
    { id: 7, name: '特赦令牌', img: '特赦令牌.png' },
    { id: 8, name: '金刚石', img: '金刚石.png' },
    { id: 9, name: '定魂珠', img: '定魂珠.png' },
    { id: 10, name: '夜明珠', img: '夜明珠.png' },
    { id: 11, name: '龙鳞', img: '龙鳞.png' },
    { id: 12, name: '避水珠', img: '避水珠.png' },
    { id: 13, name: '金柳露', img: '金柳露.png' },
    { id: 14, name: '超级金柳露', img: '超级金柳露.png' },
    { id: 15, name: '净瓶玉露', img: '净瓶玉露.png' },
    { id: 16, name: '超级净瓶玉露', img: '超级净瓶玉露.png' },
    { id: 36, name: '月华露', img: '月华露.png' },
    { id: 20, name: '修炼果', img: '修炼果.png' },
    { id: 22, name: '黑宝石', img: '黑宝石.png' },
    { id: 23, name: '红玛瑙', img: '红玛瑙.png' },
    { id: 24, name: '太阳石', img: '太阳石.png' },
    { id: 25, name: '月亮石', img: '月亮石.png' },
    { id: 26, name: '舍利子', img: '舍利子.png' },
    { id: 27, name: '光芒石', img: '光芒石.png' },
    { id: 29, name: '星辉石', img: '星辉石.png' },
    { id: 31, name: '精魄灵石', img: '精魄灵石.png' },
    { id: 30, name: '五色灵尘', img: '五色灵尘.gif' },
    { id: 17, name: '强化石', img: '强化石.png' },
    { id: 34, name: '符石', img: '符石.png' },
    { id: 35, name: '符石卷轴', img: '符石卷轴.png' },
    { id: 19, name: '海马', img: '海马.png' },
    { id: 18, name: '摇钱树苗', img: '摇钱树树苗.png' },
    { id: 21, name: '彩果', img: '彩果.png' },
    { id: 40, name: '种子', img: '种子.png' },
    { id: 32, name: '乐器', img: '乐器.png' },
    { id: 33, name: '玫瑰', img: '玫瑰.png' },
    { id: 38, name: '金银锦盒', img: '金银锦盒.png' },
    { id: 39, name: '法宝任务书', img: '法宝任务书.png' },
];

/**
 * 不固定价格的物品：价格随等级、品类浮动，记一条的单价不能代表下一条，
 * 所以每次点击都现填一次，只用于那一条记录的估值，不写回单价表。
 */
export const variableItemMeta = [
    { id: 99, name: '金币', img: '金币.png' },
    { id: 100, name: '兽决', img: '兽决.png' },
    { id: 101, name: '高级兽决', img: '高级兽决.gif' },
    { id: 102, name: '内丹', img: '内丹.png' },
    { id: 103, name: '高内丹', img: '高内丹.png' },
    { id: 104, name: '珍珠', img: '珍珠.png' },
    { id: 105, name: '附魔', img: '附魔.png' },
    { id: 106, name: '书', img: '书.png' },
    { id: 107, name: '铁', img: '铁.png' },
    { id: 108, name: '晶石', img: '晶石.png' },
    { id: 109, name: '灵饰书', img: '灵饰书.png' },
    { id: 110, name: '炼妖石', img: '炼妖石.png' },
    { id: 111, name: '图册', img: '图册.png' },
    { id: 112, name: '金丹', img: '金丹.png' },
    { id: 113, name: '如意丹', img: '如意丹.png' },
    { id: 114, name: '卡', img: '卡.png' },
    { id: 115, name: '钟灵石', img: '钟灵石.gif' },
    { id: 116, name: '法宝', img: '法宝.png' },
    { id: 117, name: '鬼谷子', img: '鬼谷子.png' },
    { id: 118, name: '瓶子', img: '瓶子.png' },
    { id: 200, name: '其他', img: '其他.png' },
];
