// 速记物品目录，原样整理自 V1 `views/quick-items.js`（V1 归档取法：`git show e51908c:migration/initial-baseline/<path>`）。
// 图标来自 V1 `assets/images/online-record/`，已随 V2 一起迁移。
// 修改名单或价格档位前先确认游戏内说法，并同步 `docs/VALIDATION.md`。
//
// 名单本身在 `quick-catalog.js`（纯数据，领域层也能安全 import）；这个文件只负责
// 把图标文件名换成构建后的 URL，是目录的「界面侧」。
import { fixedItemMeta, variableItemMeta } from './quick-catalog.js';

/**
 * 图标按文件名映射成构建后的 URL。
 *
 * 目录里的文件名与 `img` 字段一一对应（`摇钱树树苗.png` 对应名称「摇钱树苗」这类
 * 不完全一致的情况以 `img` 为准）。用 glob 而不是拼字符串，Vite 才会把图片一起打包
 * 并带上 hash。
 */
const icons = import.meta.glob('../assets/images/online-record/*.{png,gif}', {
    eager: true,
    query: '?url',
    import: 'default',
});

/** @param {string} file @returns {string} */
function iconOf(file) {
    const key = '../assets/images/online-record/' + file;
    return /** @type {Record<string, string>} */ (icons)[key] || '';
}

/** 补上图标 URL；分组与合并目录共用同一份对象。 */
function withIcon(/** @type {Array<{ id: number, name: string, img: string }>} */ list) {
    return list.map((item) => ({ ...item, icon: iconOf(item.img) }));
}

/** 固定价格组：记一条就按参考单价入库。 */
export const quickItems = withIcon(fixedItemMeta);
/** 不固定价格组：每次记录前现填单价。 */
export const quickVariable = withIcon(variableItemMeta);
/** 完整目录，`quickItemById` 用它反查名称与图标。 */
const quickCatalog = [...quickItems, ...quickVariable];

/** @param {number} id @returns {{ id: number, name: string, img: string, icon: string } | undefined} */
export function quickItemById(id) {
    return quickCatalog.find((item) => item.id === id);
}

/** 只有「金币」直接记成金额，其余都进物品库存。 */
export const QUICK_MONEY_ITEM = 99;
