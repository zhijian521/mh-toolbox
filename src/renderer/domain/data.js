// @ts-check
import { schools } from '../game-data/schools.js';
import { priceCategories } from '../game-data/price-catalog.js';
import {
    characterTraining,
    petTraining,
    auxiliarySkillNames,
} from '../game-data/character-progress.js';

// Migrated from the immutable v1 baseline; see migration/baseline.json.

/**
 * 这里只构造状态与常量，其余一百多个方法由各模块 install 混入同一个对象，
 * 所以返回值要经 unknown 中转成完整的 Domain。对象字面量本身拿不到 Domain
 * 的上下文类型，因此每个方法都单独标注 this 与参数。
 * @param {Preferences} localStorage
 * @returns {Domain}
 */
export function createData(localStorage) {
    /* 数据层：状态、常量、持久化 */
    /** @type {Domain} */
    const data = /** @type {any} */ ({
        schemaVersion: 8,
        state: {
            schemaVersion: 8,
            characters: [],
            transactions: [],
            sessions: [],
            /* 计时中的会话：每个在线角色一段，各自起停；老档的单个对象由 normalizeOnline 迁移。 */
            activeSessions: [],
            goals: [],
            equipment: [],
            gearLogs: [],
            /* 物价卡片的独立集合，与账本、角色、装备都没有外键。 */
            prices: [],
        },
        charFilter: localStorage.getItem('mh.charFilter') || 'all',

        /**
         * @this {Domain}
         * @param {any[]} items
         * @returns {any[]}
         */
        orderedCards(items) {
            return items
                .slice()
                .sort(
                    (a, b) =>
                        (this.characterNumber(a.sortOrder) ?? Infinity) -
                            (this.characterNumber(b.sortOrder) ?? Infinity) ||
                        (b.createdAt || 0) - (a.createdAt || 0),
                );
        },

        /**
         * 在最新集合中按相邻卡片定位；筛选隐藏的项目保留相对顺序。
         * @this {Domain}
         * @param {any[]} items
         * @param {string} id
         * @param {any} changes
         */
        moveCard(items, id, changes) {
            const item = items.find((entry) => entry.id === id),
                target = items.find((entry) => entry.id === changes.targetId);
            if (!item) throw new Error('排序项目不存在，请刷新后重试');
            if (
                !target ||
                target.id === id ||
                !['before', 'after'].includes(/** @type {string} */ (changes.position))
            )
                throw new Error('请选择有效的排序位置');
            let ordered = this.orderedCards(items);
            if (changes.visibleIds !== undefined) {
                const ids = changes.visibleIds;
                if (
                    !Array.isArray(ids) ||
                    new Set(ids).size !== ids.length ||
                    !ids.includes(id) ||
                    !ids.includes(target.id) ||
                    ids.some((key) => !items.some((entry) => entry.id === key))
                )
                    throw new Error('卡片列表已变更，请重试');
                /** @type {Map<string, number>} */
                const positions = new Map(ids.map((key, index) => [key, index]));
                const visible = ordered
                    .filter((entry) => positions.has(entry.id))
                    .sort((a, b) => Number(positions.get(a.id)) - Number(positions.get(b.id)));
                let index = 0;
                ordered = ordered.map((entry) =>
                    positions.has(entry.id) ? visible[index++] : entry,
                );
            }
            ordered = ordered.filter((entry) => entry.id !== id);
            const position =
                ordered.findIndex((entry) => entry.id === target.id) +
                Number(changes.position === 'after');
            ordered.splice(position, 0, item);
            ordered.forEach((entry, index) => {
                entry.sortOrder = index;
            });
        },

        incomeCats: [
            '捉鬼',
            '押镖',
            '师门',
            '封妖',
            '副本',
            '周末活动',
            '节日活动',
            '摆摊卖货',
            '物品掉落',
            '宝图',
            '牧场',
            '种植',
            '帮派产出',
            '其他收入',
        ],
        expenseCats: ['点卡', '修理装备', '药品补给', '其他支出'],
        accountCats: [
            '装备交易',
            '召唤兽交易',
            /* 点卡分两条：官方人民币充值，与游戏内用梦幻币买卡。 */
            '点卡充值',
            '点卡购买',
            '游戏币买入',
            '游戏币卖出',
            '养成投入',
            /* 日常打金的净产出：收益页结算一局时写进来，同一天只留一条。 */
            '游戏收益',
            '其他收支',
        ],
        channels: ['游戏内', '藏宝阁', '官方充值', '其他'],
        itemStatuses: { held: '持有', sold: '已出售', self: '自用' },
        slots: [
            '武器',
            '头盔',
            '项链',
            '衣服',
            '腰带',
            '鞋子',
            '戒指',
            '耳饰',
            '手镯',
            '佩饰',
            '玉魄·阳',
            '玉魄·阴',
            '其他',
        ],
        schools: [...schools],
        /* 物价分类只作下拉选项，用户仍可手填自定义分类。 */
        priceCategories: [...priceCategories],
        characterTraining: characterTraining.map((field) => ({ ...field })),
        petTraining: petTraining.map((field) => ({ ...field })),
        auxiliarySkillNames: [...auxiliarySkillNames],
        goalTypes: [
            { v: 'money', t: '存钱目标' },
            { v: 'gear', t: '装备目标' },
            { v: 'progress', t: '养成目标' },
        ],
        gearActions: [
            { v: 'buy', t: '购入', dir: -1 },
            { v: 'sell', t: '售出', dir: 1 },
            { v: 'craft', t: '打造', dir: -1 },
            { v: 'replace', t: '替换', dir: 0 },
            { v: 'gem', t: '镶嵌宝石', dir: -1 },
            { v: 'dust', t: '镶嵌灵尘', dir: -1 },
            { v: 'consecrate', t: '开光强化', dir: -1 },
            { v: 'other', t: '其他', dir: 0 },
        ],

        /** @this {Domain} @param {string} v */
        setCharFilter(v) {
            this.charFilter = v;
            localStorage.setItem('mh.charFilter', v);
        },

        /** @this {Domain} */
        chars() {
            return this.state.characters;
        },
        /** @this {Domain} @param {string} id */
        charById(id) {
            return this.state.characters.find(function (c) {
                return c.id === id;
            });
        },
        /** @this {Domain} @param {string} id */
        charName(id) {
            const c = this.charById(id);
            return c ? c.name : '未知角色';
        },

        /* 按全局角色筛选（不筛选日期） */
        /** @this {Domain} @param {any[]} list @returns {any[]} */
        scope(list) {
            if (this.charFilter === 'all') return list;
            const f = this.charFilter;
            return list.filter(function (x) {
                return x.characterId === f;
            });
        },

        /** @this {Domain} @param {any[]} [list] @returns {any[]} */
        earnings(list) {
            return (list || this.state.transactions).filter((t) => t.ledger === 'earnings');
        },
        /** @this {Domain} @param {any[]} [list] @returns {any[]} */
        accounts(list) {
            return (list || this.state.transactions).filter((t) => t.ledger === 'account');
        },
        /**
         * 物品记录的计价单价（万）：有当前参考价就用它，否则退回记录里那一笔填的价。
         *
         * 界面显示「单价 × 数量」和统计汇总都走这里，避免两处各算一遍再对不上。
         * @this {Domain}
         * @param {any} t
         * @returns {number}
         */
        itemUnitPrice(t) {
            const current = this.itemPrice(t && t.itemId ? String(t.itemId) : '');
            return current > 0 ? current / 10000 : Number(t && t.unitPrice) || 0;
        },

        /**
         * 物品记录的估值：数量 × **当前**参考单价。
         *
         * 口径从「记录时的单价」改成「当前单价」是刻意的：这套工具不做出售与库存，
         * 物品价值只在界面上表示「这些东西按今天的行情值多少」。改了物价就跟着变，
         * 不用回头改一批历史记录。
         *
         * 没有当前单价的退回记录里的单价——不固定价格的物品（书、铁、兽决…）本来就
         * 每条现填、不写回单价表，只能用记账那一刻填的数。
         * @this {Domain}
         * @param {any} t
         * @param {number} [quantity]
         * @returns {number}
         */
        itemValue(t, quantity = t.quantity) {
            return Math.round((Number(quantity) || 0) * this.itemUnitPrice(t) * 100) / 100;
        },

        /**
         * @this {Domain}
         * @param {string} charId
         * @param {string} from
         * @param {string} to
         * @param {string} [ledger]
         * @returns {any[]}
         */
        txIn(charId, from, to, ledger) {
            return this.state.transactions.filter(function (t) {
                if (t.ledger !== (ledger || 'earnings')) return false;
                if (charId && charId !== 'all' && t.characterId !== charId) return false;
                if (from && t.date < from) return false;
                if (to && t.date > to) return false;
                return true;
            });
        },

        /** @this {Domain} @param {string} v */
        goalTypeText(v) {
            const it = this.goalTypes.find(function (x) {
                return x.v === v;
            });
            return it ? it.t : '目标';
        },

        /** @this {Domain} @param {string} v */
        gearAction(v) {
            return (
                this.gearActions.find(function (x) {
                    return x.v === v;
                }) || { v: 'other', t: '其他', dir: 0 }
            );
        },

        /** @this {Domain} @param {string} id */
        itemPrice(id) {
            return Number(this.state.itemPrices && this.state.itemPrices[id]) || 0;
        },

        /** @this {Domain} @param {string} id @param {number} price */
        setItemPrice(id, price) {
            if (!this.state.itemPrices) this.state.itemPrices = {};
            this.state.itemPrices[id] = price;
        },

        /** @this {Domain} @param {string} eqId @returns {any[]} */
        gearLogsOf(eqId) {
            return this.state.gearLogs
                .slice()
                .reverse()
                .filter(function (l) {
                    return l.equipmentId === eqId;
                })
                .sort(function (a, b) {
                    return b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0);
                });
        },
    });

    return data;
}
