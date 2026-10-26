// Migrated from the immutable v1 baseline; see migration/baseline.json.
export function createData(localStorage) {
    /* 数据层：状态、常量、持久化 */
    return {
        schemaVersion: 6,
        state: {
            schemaVersion: 6,
            characters: [],
            transactions: [],
            sessions: [],
            activeSession: null,
            goals: [],
            equipment: [],
            gearLogs: [],
        },
        charFilter: localStorage.getItem('mh.charFilter') || 'all',

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

        /** 在最新集合中按相邻卡片定位；筛选隐藏的项目保留相对顺序。 */
        moveCard(items, id, changes) {
            const item = items.find((entry) => entry.id === id),
                target = items.find((entry) => entry.id === changes.targetId);
            if (!item) throw new Error('排序项目不存在，请刷新后重试');
            if (!target || target.id === id || !['before', 'after'].includes(changes.position))
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
                const positions = new Map(ids.map((key, index) => [key, index]));
                const visible = ordered
                    .filter((entry) => positions.has(entry.id))
                    .sort((a, b) => positions.get(a.id) - positions.get(b.id));
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
            '点卡充值',
            '游戏币买入',
            '游戏币卖出',
            '养成投入',
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
        schools: [
            '大唐官府',
            '方寸山',
            '化生寺',
            '女儿村',
            '神木林',
            '凌波城',
            '花果山',
            '天机城',
            '魔王寨',
            '阴曹地府',
            '狮驼岭',
            '盘丝洞',
            '无底洞',
            '女魃墓',
            '天宫',
            '龙宫',
            '五庄观',
            '普陀山',
            '九黎城',
            '东海渊',
            '弥勒山',
            '其他',
        ],
        characterTraining: [
            { key: 'attack', label: '攻击修炼' },
            { key: 'magic', label: '法术修炼' },
            { key: 'defense', label: '防御修炼' },
            { key: 'resistance', label: '抗法修炼' },
            { key: 'hunting', label: '猎术修炼' },
        ],
        petTraining: [
            { key: 'attack', label: '攻击控制力' },
            { key: 'magic', label: '法术控制力' },
            { key: 'defense', label: '防御控制力' },
            { key: 'resistance', label: '抗法控制力' },
        ],
        auxiliarySkillNames: [
            '强身术',
            '强壮',
            '神速',
            '冥想',
            '烹饪技巧',
            '中药医理',
            '打造技巧',
            '裁缝技巧',
            '炼金术',
            '淬灵之术',
            '养生之道',
            '健身术',
            '巧匠之术',
            '熔炼技巧',
        ],
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

        setCharFilter(v) {
            this.charFilter = v;
            localStorage.setItem('mh.charFilter', v);
        },

        chars() {
            return this.state.characters;
        },
        charById(id) {
            return this.state.characters.find(function (c) {
                return c.id === id;
            });
        },
        charName(id) {
            const c = this.charById(id);
            return c ? c.name : '未知角色';
        },

        /* 按全局角色筛选（不筛选日期） */
        scope(list) {
            if (this.charFilter === 'all') return list;
            const f = this.charFilter;
            return list.filter(function (x) {
                return x.characterId === f;
            });
        },

        earnings(list) {
            return (list || this.state.transactions).filter((t) => t.ledger === 'earnings');
        },
        accounts(list) {
            return (list || this.state.transactions).filter((t) => t.ledger === 'account');
        },
        itemValue(t, quantity = t.quantity) {
            return Math.round((Number(quantity) || 0) * (Number(t.unitPrice) || 0) * 100) / 100;
        },

        txIn(charId, from, to, ledger) {
            return this.state.transactions.filter(function (t) {
                if (t.ledger !== (ledger || 'earnings')) return false;
                if (charId && charId !== 'all' && t.characterId !== charId) return false;
                if (from && t.date < from) return false;
                if (to && t.date > to) return false;
                return true;
            });
        },

        goalTypeText(v) {
            const it = this.goalTypes.find(function (x) {
                return x.v === v;
            });
            return it ? it.t : '目标';
        },

        gearAction(v) {
            return (
                this.gearActions.find(function (x) {
                    return x.v === v;
                }) || { v: 'other', t: '其他', dir: 0 }
            );
        },

        itemPrice(id) {
            return Number(this.state.itemPrices && this.state.itemPrices[id]) || 0;
        },

        setItemPrice(id, price) {
            if (!this.state.itemPrices) this.state.itemPrices = {};
            this.state.itemPrices[id] = price;
        },

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
    };
}
