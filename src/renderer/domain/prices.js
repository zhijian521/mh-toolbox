// @ts-check

/**
 * 物价卡片：记录游戏内各物品的行情价。
 *
 * 设计上一条物品只存价格历史（`logs`），当前价由最新一条历史派生，
 * 不再单独存 `price` 字段——两处各存一份，迟早会出现卡片上的价与历史最后一条不一致。
 * 本模块与角色、收益、账号、装备都没有数据关联，也不受全局角色筛选影响。
 *
 * @typedef {Partial<Domain> & ThisType<Domain>} PricesMixin
 *
 * @typedef {object} PriceLog
 * @property {string} id
 * @property {string} date 记录日期 `YYYY-MM-DD`
 * @property {number} price 原始游戏币，15000 表示 1.5 万
 * @property {string} note
 * @property {number} createdAt
 *
 * @typedef {object} PriceItem
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {string} unit 计价单位：个 / 本 / 组
 * @property {string} note
 * @property {PriceLog[]} logs 价格历史，读取时按日期倒序
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** 名称长度上限，与编辑框的 maxlength 保持一致。 */
const NAME_LIMIT = 40;
/** 单个物品最多保留的价格记录条数：够看长期走势，又不至于把档案撑大。 */
const LOG_LIMIT = 200;

/** @param {any} value @returns {string} 去掉首尾空白的文本 */
function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** @param {any} value @returns {number} 非负价格，无法解析按 0 */
function price(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
}

/**
 * 只接受 `YYYY-MM-DD`；用于读取路径时无法识别就退回空串，绝不抛错。
 * @param {any} value
 * @returns {string}
 */
function dateText(value) {
    const candidate = text(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
}

/**
 * @param {Domain} D
 * @param {any} U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, U, _gateway, _localStorage) {
    Object.assign(
        D,
        /** @type {PricesMixin} */ ({
            /**
             * 最近更新的排在前面；同一时间戳按名称排，避免刷新一次顺序就变。
             * @this {Domain}
             * @param {any[]} [items]
             * @returns {any[]}
             */
            orderedPrices(items) {
                const list = items === undefined ? this.state.prices : items;
                return (Array.isArray(list) ? list : [])
                    .slice()
                    .sort(
                        (/** @type {any} */ a, /** @type {any} */ b) =>
                            (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0) ||
                            String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'),
                    );
            },

            /** @this {Domain} @param {string} id @returns {any} */
            priceItemById(id) {
                return this.state.prices.find((/** @type {any} */ item) => item.id === id);
            },

            /**
             * 价格历史按「日期倒序、同一天后记的在前」排好再给界面。
             * @this {Domain}
             * @param {any} item
             * @returns {any[]}
             */
            priceLogsSorted(item) {
                const logs = item && Array.isArray(item.logs) ? item.logs : [];
                return logs
                    .slice()
                    .sort(
                        (/** @type {any} */ a, /** @type {any} */ b) =>
                            String(b.date || '').localeCompare(String(a.date || '')) ||
                            (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0),
                    );
            },

            /**
             * 当前价 = 最新一条历史，没有记录时为 null（界面显示「未记录」）。
             * @this {Domain}
             * @param {any} item
             * @returns {any}
             */
            priceCurrent(item) {
                return this.priceLogsSorted(item)[0] || null;
            },

            /**
             * 与「上一条不同日期的记录」比：同一天改两次价不该算成一次涨跌。
             * 不足两条记录或找不到更早日期时返回 null。
             * @this {Domain}
             * @param {any} item
             * @returns {any}
             */
            priceChange(item) {
                const logs = this.priceLogsSorted(item);
                if (logs.length < 2) return null;
                const latest = logs[0];
                const base = logs.find(
                    (/** @type {any} */ log, /** @type {number} */ index) =>
                        index > 0 && log.date !== latest.date,
                );
                if (!base) return null;
                const delta = latest.price - base.price;
                return {
                    delta,
                    pct: base.price > 0 ? delta / base.price : null,
                    from: base.price,
                    to: latest.price,
                    since: base.date,
                };
            },

            /**
             * 价格显示口径：满亿折算亿，满万折算万，其余按原值。
             * 卡片与历史共用，不要在页面里各写一套。
             * @this {Domain}
             * @param {any} value
             * @returns {{ value: string, unit: string }}
             */
            priceLabel(value) {
                const amount = Number(value);
                if (!Number.isFinite(amount) || amount <= 0) return { value: '—', unit: '' };
                if (amount >= 100000000) {
                    return { value: trimZero(amount / 100000000), unit: '亿' };
                }
                if (amount >= 10000) return { value: trimZero(amount / 10000), unit: '万' };
                return { value: trimZero(amount), unit: '' };
            },

            /**
             * 单条物品的读取路径规范化：坏数据无损降级，保留未知字段，不抛错。
             * @this {Domain}
             * @param {any} raw
             * @returns {any}
             */
            normalizePriceItem(raw) {
                const item = raw && typeof raw === 'object' ? raw : {};
                const logs = (Array.isArray(item.logs) ? item.logs : [])
                    .filter((/** @type {any} */ log) => log && typeof log === 'object')
                    .map((/** @type {any} */ log) =>
                        Object.assign({}, log, {
                            id: text(log.id) || U.uid(),
                            date: dateText(log.date),
                            price: price(log.price),
                            note: text(log.note),
                            createdAt: Number(log.createdAt) || 0,
                        }),
                    );
                return Object.assign({}, item, {
                    id: text(item.id) || U.uid(),
                    name: text(item.name) || '未命名物品',
                    category: text(item.category) || '其他',
                    unit: text(item.unit) || '个',
                    note: text(item.note),
                    logs,
                    createdAt: Number(item.createdAt) || 0,
                    updatedAt: Number(item.updatedAt) || Number(item.createdAt) || 0,
                });
            },

            /**
             * 保存物品本身（名称、分类、单位、备注）。新建时可以顺带记一条初始价。
             * @this {Domain}
             * @param {any} input
             * @param {string} [id]
             * @returns {Promise<any>}
             */
            async savePriceItem(input, id) {
                const draft = this.priceItemInput(input);
                const initialDate = text(input && input.date) || U.today();
                const initialPrice = price(input && input.price);
                return this.commit(() => {
                    const items = this.state.prices;
                    const now = Date.now();
                    const clash = items.some(
                        (/** @type {any} */ other) =>
                            other.id !== id && String(other.name).trim() === draft.name,
                    );
                    if (clash) throw new Error('已存在同名物品，换个名字或改现有那张卡');
                    if (id) {
                        const item = items.find((/** @type {any} */ one) => one.id === id);
                        if (!item) throw new Error('物品不存在，请刷新后重试');
                        Object.assign(item, draft, { updatedAt: now });
                        return item;
                    }
                    const item = Object.assign({}, draft, {
                        id: U.uid(),
                        logs: /** @type {any[]} */ ([]),
                        createdAt: now,
                        updatedAt: now,
                    });
                    if (initialPrice > 0) {
                        item.logs.push({
                            id: U.uid(),
                            date: dateText(initialDate) || U.today(),
                            price: initialPrice,
                            note: '',
                            createdAt: now,
                        });
                    }
                    items.push(item);
                    return item;
                });
            },

            /**
             * 追加或修改一条价格记录。
             * @this {Domain}
             * @param {string} itemId
             * @param {any} input
             * @param {string} [logId]
             * @returns {Promise<any>}
             */
            async savePriceLog(itemId, input, logId) {
                const draft = this.priceLogInput(input);
                return this.commit(() => {
                    const item = this.state.prices.find(
                        (/** @type {any} */ one) => one.id === itemId,
                    );
                    if (!item) throw new Error('物品不存在，请刷新后重试');
                    if (!Array.isArray(item.logs)) item.logs = [];
                    if (logId) {
                        const log = item.logs.find((/** @type {any} */ one) => one.id === logId);
                        if (!log) throw new Error('这条价格记录已不存在，请刷新后重试');
                        Object.assign(log, draft);
                        item.updatedAt = Date.now();
                        return log;
                    }
                    if (item.logs.length >= LOG_LIMIT)
                        throw new Error(
                            '这张卡已有 ' + LOG_LIMIT + ' 条价格记录，先删掉一些旧记录再记',
                        );
                    // 连点两次时 Date.now() 可能落在同一毫秒，排序就分不出先后，
                    // 这里保证时间戳在该卡内严格递增，最新一条永远排在最前。
                    const lastAt = item.logs.reduce(
                        (/** @type {number} */ max, /** @type {any} */ one) =>
                            Math.max(max, Number(one.createdAt) || 0),
                        0,
                    );
                    const createdAt = Math.max(Date.now(), lastAt + 1);
                    const log = Object.assign({ id: U.uid(), createdAt }, draft);
                    item.logs.push(log);
                    item.updatedAt = log.createdAt;
                    return log;
                });
            },

            /**
             * 删掉一条价格记录；物品本身保留，没有记录时卡片显示「未记录」。
             * @this {Domain}
             * @param {string} itemId
             * @param {string} logId
             * @returns {Promise<void>}
             */
            async removePriceLog(itemId, logId) {
                return this.commit(() => {
                    const item = this.state.prices.find(
                        (/** @type {any} */ one) => one.id === itemId,
                    );
                    if (!item) throw new Error('物品不存在，请刷新后重试');
                    const index = item.logs.findIndex((/** @type {any} */ one) => one.id === logId);
                    if (index < 0) throw new Error('这条价格记录已不存在，请刷新后重试');
                    item.logs.splice(index, 1);
                    item.updatedAt = Date.now();
                });
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @returns {Promise<void>}
             */
            async removePriceItem(id) {
                return this.commit(() => {
                    const index = this.state.prices.findIndex(
                        (/** @type {any} */ one) => one.id === id,
                    );
                    if (index < 0) throw new Error('物品不存在，请刷新后重试');
                    this.state.prices.splice(index, 1);
                });
            },

            /**
             * 物品表单校验（只在交互式保存路径调用，可以抛错）。
             * @this {Domain}
             * @param {any} input
             * @returns {{ name: string, category: string, unit: string, note: string }}
             */
            priceItemInput(input) {
                const raw = input && typeof input === 'object' ? input : {};
                const name = text(raw.name);
                if (!name) throw new Error('请填写物品名称');
                if (name.length > NAME_LIMIT)
                    throw new Error('物品名称不能超过 ' + NAME_LIMIT + ' 个字');
                return {
                    name,
                    category: text(raw.category) || '其他',
                    unit: text(raw.unit) || '个',
                    note: text(raw.note),
                };
            },

            /**
             * 价格记录校验：日期必填且合法，价格必须大于 0。
             * @this {Domain}
             * @param {any} input
             * @returns {{ date: string, price: number, note: string }}
             */
            priceLogInput(input) {
                const raw = input && typeof input === 'object' ? input : {};
                const date = dateText(raw.date);
                if (!date) throw new Error('请选择记录日期');
                const value = price(raw.price);
                if (value <= 0) throw new Error('请填写大于 0 的价格');
                return { date, price: value, note: text(raw.note) };
            },
        }),
    );
}

/**
 * 去掉多余的小数尾巴：1.50 → 1.5，2.00 → 2。
 * @param {number} value
 * @returns {string}
 */
function trimZero(value) {
    const fixed = value.toFixed(2).replace(/\.?0+$/, '');
    return fixed === '' ? '0' : fixed;
}
