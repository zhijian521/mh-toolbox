// @ts-check
/**
 * 基础工具：日期、金额与百分比的格式化。
 * 领域模块与界面共用同一套口径，避免各页面自己拼字符串。
 */

/** @returns {string} 形如 `lq3k9x-8f2b1c` 的短随机标识 */
export function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * @param {Date} date
 * @returns {string} `YYYY-MM-DD`，按本地时区取年月日
 */
export function fmtDate(date) {
    const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

/** @returns {string} 今天的 `YYYY-MM-DD` */
export function today() {
    return fmtDate(new Date());
}

/**
 * @param {string} s `YYYY-MM-DD`
 * @returns {Date} 本地时区的零点；缺月日时按 1 月 1 日补齐
 */
export function parseDate(s) {
    const [year, month, day] = String(s).split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

/**
 * @param {string} dateStr 起始日期 `YYYY-MM-DD`
 * @param {number} days 正负天数
 * @returns {string} 偏移后的日期
 */
export function addDays(dateStr, days) {
    const date = parseDate(dateStr);
    date.setDate(date.getDate() + days);
    return fmtDate(date);
}

/**
 * 游戏币按「万」为基准，满一万万自动折算为「亿」。
 * @param {number | string | null | undefined} value
 * @returns {string} 无法解析时返回破折号
 */
export function fmtMoney(value) {
    if (value == null || Number.isNaN(Number(value))) return '—';
    const amount = Number(value);
    if (Math.abs(amount) >= 10000) return (amount / 10000).toFixed(2) + ' 亿';
    const rounded = Math.round(amount * 100) / 100;
    return (Number.isInteger(rounded) ? rounded : rounded.toFixed(2)) + ' 万';
}

/**
 * @param {number | string | null | undefined} value
 * @returns {string} 带千分位、最多两位小数；空值当 0
 */
export function fmtNumber(value) {
    return Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

/**
 * @param {number | string | null | undefined} value
 * @returns {string} 四舍五入后的整数字符串；空值返回 `0`
 */
export function fmtInt(value) {
    if (value == null || Number.isNaN(Number(value))) return '0';
    return Math.round(Number(value)).toLocaleString('zh-CN');
}

/**
 * 人民币固定两位小数并带符号，其余币种走 {@link fmtMoney}。
 * @param {number | string | null | undefined} value
 * @param {string} currency 币种标识，`rmb` 时按元显示
 * @returns {string}
 */
export function fmtAmount(value, currency) {
    if (currency !== 'rmb') return fmtMoney(value);
    return (
        '¥ ' +
        Number(value || 0).toLocaleString('zh-CN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    );
}

/**
 * @param {number | null | undefined} minutes
 * @returns {string} 不足一分钟按秒、不足一小时按分钟（最多两位小数），否则保留一位小数的小时数
 */
export function fmtMinutes(minutes) {
    if (!minutes) return '—';
    // 计时中的分钟数是个长小数（0.016666666666666666），直接拼出来会满屏尾巴。
    if (minutes < 1) return Math.max(1, Math.round(minutes * 60)) + ' 秒';
    // 先按两位小数收一次，再决定用分钟还是小时：59.999 收完是 60，该显示成小时。
    const rounded = Math.round(minutes * 100) / 100;
    if (rounded < 60) return rounded + ' 分钟';
    return (minutes / 60).toFixed(1) + ' 小时';
}

/**
 * 快捷项按当前本地日期计算区间；自定义范围可只设一个边界。
 * @param {string | { preset: string, from?: string, to?: string }} key 预设名或自定义范围
 * @returns {{ from: string, to: string }} 未识别的预设返回空区间
 */
export function rangeFor(key) {
    let preset = key;
    if (typeof preset === 'object') {
        if (preset.preset === 'custom') {
            return { from: preset.from || '', to: preset.to || '' };
        }
        preset = preset.preset;
    }
    const now = new Date();
    const todayText = fmtDate(now);
    if (preset === 'today') return { from: todayText, to: todayText };
    if (preset === 'week') {
        const start = new Date(now);
        const offset = (start.getDay() + 6) % 7; /* 周一为一周开始 */
        start.setDate(start.getDate() - offset);
        const from = fmtDate(start);
        return { from, to: addDays(from, 6) };
    }
    if (preset === 'month') {
        return {
            from: fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)),
            to: fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        };
    }
    if (preset === 'year') {
        return { from: now.getFullYear() + '-01-01', to: now.getFullYear() + '-12-31' };
    }
    return { from: '', to: '' };
}

/**
 * @param {string | null | undefined} dateStr 截止日期
 * @returns {number} 距今天数，已过期返回负数
 */
export function daysLeft(dateStr) {
    if (!dateStr) return 0;
    return Math.ceil((parseDate(dateStr).getTime() - parseDate(today()).getTime()) / 86400000);
}

/**
 * @param {number} part
 * @param {number} total
 * @returns {string} 整数百分比，上限 999%
 */
export function fmtPercent(part, total) {
    if (!total) return '0%';
    return Math.min(999, Math.round((part / total) * 100)) + '%';
}

/** 领域模块统一通过该对象取工具函数，保持 `U.xxx()` 的调用写法。 */
export const U = {
    uid,
    fmtDate,
    today,
    parseDate,
    addDays,
    fmtMoney,
    fmtNumber,
    fmtInt,
    fmtAmount,
    fmtMinutes,
    rangeFor,
    daysLeft,
    fmtPercent,
};
