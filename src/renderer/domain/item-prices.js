// @ts-check
import { fixedItemMeta } from '../game-data/quick-catalog.js';

/**
 * 固定价物品的单价表：导出成 CSV 让用户在 Excel 里一次改完，再导回来。
 *
 * 为什么不复用「物价」模块（`prices.js`）：那是独立的行情档案，按物品名建卡片、
 * 自己记价格历史，与速记用的单价表没有外键。而速记的单价是**按目录 id** 存的
 * `state.itemPrices`，四十个物品逐个点右键改一次太费事，这里只解决这一件事。
 *
 * 只有固定价组参与：不固定价组的单价本来就每条现填、不写回单价表，
 * 导进来也会被下一次点击覆盖，写进去只会让人误以为生效了。
 *
 * @typedef {object} ItemPriceImport 导入结果，用于提示「改了几个、跳过几个」。
 * @property {number} updated 写入或改动的条数
 * @property {number} cleared 单价被清空的条数
 * @property {number} skipped 因为非法或未知被跳过的条数
 * @property {string[]} problems 前几条具体原因，供界面展示
 */

/** 单价上限：一百亿，超过这个数基本是把「分」当成「万」填了。 */
const PRICE_LIMIT = 10000000000;

/**
 * 极简 CSV 解析：够用即可，不引入依赖。
 *
 * 只处理三种情况——引号包裹、引号内逗号、`""` 转义；
 * 其余按行按逗号切。Excel 导出的文件一定落在这三种里。
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvRows(text) {
    /** @type {string[][]} */
    const rows = [];
    /** @type {string[]} */
    let row = [];
    let cell = '';
    let quoted = false;
    // 去掉 UTF-8 BOM：Excel 另存后一定带，留着会让第一条 ID 变成 "\uFEFF1" 而匹配不上。
    const source = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (quoted) {
            if (char === '"') {
                if (source[index + 1] === '"') {
                    cell += '"';
                    index++;
                } else quoted = false;
            } else cell += char;
            continue;
        }
        if (char === '"') {
            quoted = true;
            continue;
        }
        if (char === ',') {
            row.push(cell);
            cell = '';
            continue;
        }
        if (char === '\r') continue;
        if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }
        cell += char;
    }
    if (cell !== '' || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

/**
 * 单元格文本化：加引号并转义内部引号，保证名称里带逗号也不会错行。
 * @param {unknown} value
 * @returns {string}
 */
function cell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
}

/** @param {any} value @returns {number} 万为单位的数值，非法按 0 */
function wan(value) {
    const parsed = Number(String(value == null ? '' : value).replace(/[,，\s]/g, ''));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * @param {Domain} D
 * @param {any} _U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, _U, _gateway, _localStorage) {
    /**
     * 导出单价表：没设过价的也占一行（单价留空），
     * 这样用户在 Excel 里看到的是完整清单，而不是只有改过的那几个。
     * @this {Domain}
     * @returns {string} 带 BOM 的 CRLF 文本
     */
    D.itemPriceCsv = function () {
        const rows = [['物品ID', '物品名称', '单价（万）']];
        fixedItemMeta.forEach((item) => {
            const price = this.itemPrice(String(item.id));
            rows.push([String(item.id), item.name, price > 0 ? String(price / 10000) : '']);
        });
        return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
    };

    /**
     * 导入单价表。
     *
     * 规则刻意保守：**空单元格表示「不改」**，而不是清零——用户从导出文件里删掉几个数
     * 再导回来，不该把那几个物品的价悄悄抹掉。要清零请显式填 `0`。
     *
     * 表头整行忽略（按「第一列不是纯数字」判断），所以用户删不删表头都能导。
     * @this {Domain}
     * @param {string} text
     * @returns {Promise<ItemPriceImport>}
     */
    D.importItemPriceCsv = function (text) {
        const rows = parseCsvRows(text);
        const known = new Map(fixedItemMeta.map((item) => [String(item.id), item]));
        /** @type {Array<{ id: string, price: number }>} */
        const writes = [];
        /** @type {string[]} */
        const cleared = [];
        /** @type {string[]} */
        const problems = [];
        let skipped = 0;
        const seen = new Set();

        rows.forEach((row, line) => {
            const id = String(row[0] == null ? '' : row[0]).trim();
            // 空行、表头、以及只有一列的碎行都跳过，不当作错误计数。
            if (!id || !/^\d+$/.test(id)) return;
            const item = known.get(id);
            if (!item) {
                skipped++;
                if (problems.length < 5)
                    problems.push('第 ' + (line + 1) + ' 行：目录里没有 ID ' + id);
                return;
            }
            if (seen.has(id)) {
                skipped++;
                if (problems.length < 5)
                    problems.push('第 ' + (line + 1) + ' 行：ID ' + id + ' 重复，只认第一行');
                return;
            }
            seen.add(id);
            const raw = String(row[2] == null ? '' : row[2]).trim();
            if (raw === '') return; // 留空 = 保持不变
            const value = wan(raw);
            if (value > PRICE_LIMIT) {
                skipped++;
                if (problems.length < 5)
                    problems.push('第 ' + (line + 1) + ' 行：单价过大，已跳过 ' + item.name);
                return;
            }
            if (value === 0) {
                cleared.push(id);
                return;
            }
            writes.push({ id, price: Math.round(value * 10000) });
        });

        if (!writes.length && !cleared.length) {
            return Promise.resolve({
                updated: 0,
                cleared: 0,
                skipped,
                problems: problems.length ? problems : ['文件里没有可用的单价格'],
            });
        }

        return this.commit(() => {
            if (!this.state.itemPrices) this.state.itemPrices = {};
            const table = this.state.itemPrices;
            writes.forEach(({ id, price }) => {
                table[id] = price;
            });
            cleared.forEach((id) => {
                delete table[id];
            });
            return { updated: writes.length, cleared: cleared.length, skipped, problems };
        });
    };
}
