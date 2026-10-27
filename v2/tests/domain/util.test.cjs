'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/*
 * util.js 是领域层与界面共用的格式化口径，此前没有任何测试。
 * 这里锁住边界行为，避免后续重构悄悄改变显示。
 */
const source = fs.readFileSync(path.join(__dirname, '../../src/renderer/domain/util.js'), 'utf8');
const { U } = require('../../src/renderer/domain/util.js');

test('日期工具按本地时区补零，解析与偏移可往返', () => {
    assert.equal(U.fmtDate(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(U.fmtDate(new Date(2026, 11, 31)), '2026-12-31');
    assert.equal(U.addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(U.addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(U.addDays('2024-02-28', 1), '2024-02-29');
    // 缺月日时按 1 月 1 日补齐，不产生 Invalid Date。
    assert.equal(U.fmtDate(U.parseDate('2026')), '2026-01-01');
    assert.equal(U.fmtDate(U.parseDate('2026-07')), '2026-07-01');
});

test('金额按万为基准，满一万万折算亿，空值与非法值显示破折号', () => {
    assert.equal(U.fmtMoney(0), '0 万');
    assert.equal(U.fmtMoney(12), '12 万');
    assert.equal(U.fmtMoney(12.5), '12.50 万');
    assert.equal(U.fmtMoney(9999), '9999 万');
    assert.equal(U.fmtMoney(10000), '1.00 亿');
    assert.equal(U.fmtMoney(-15000), '-1.50 亿');
    assert.equal(U.fmtMoney(null), '—');
    assert.equal(U.fmtMoney(undefined), '—');
    assert.equal(U.fmtMoney('abc'), '—');
    // 数字字符串按数字处理，避免调用方先转换。
    assert.equal(U.fmtMoney('12'), '12 万');
});

test('整数、数字与人民币格式的千分位与小数位', () => {
    assert.equal(U.fmtNumber(1234.567), '1,234.57');
    assert.equal(U.fmtNumber(null), '0');
    assert.equal(U.fmtInt(1234.5), '1,235');
    assert.equal(U.fmtInt(null), '0');
    assert.equal(U.fmtAmount(1234.5, 'rmb'), '¥ 1,234.50');
    assert.equal(U.fmtAmount(12, 'cash'), '12 万');
    assert.equal(U.fmtAmount(null, 'rmb'), '¥ 0.00');
});

test('在线时长不足一小时按分钟，空值显示破折号', () => {
    assert.equal(U.fmtMinutes(0), '—');
    assert.equal(U.fmtMinutes(null), '—');
    assert.equal(U.fmtMinutes(45), '45 分钟');
    assert.equal(U.fmtMinutes(90), '1.5 小时');
});

test('快捷区间按当前本地日期计算，自定义范围可只设一端', () => {
    const today = U.today();
    assert.deepEqual(U.rangeFor('today'), { from: today, to: today });

    const week = U.rangeFor('week');
    assert.equal(U.parseDate(week.from).getDay(), 1, '周一为一周开始');
    assert.equal(U.addDays(week.from, 6), week.to);

    const month = U.rangeFor('month');
    assert.ok(month.from.endsWith('-01'));
    assert.equal(U.parseDate(U.addDays(month.to, 1)).getDate(), 1, '月末加一天即下月首日');

    const year = U.rangeFor('year');
    assert.equal(year.from.slice(5), '01-01');
    assert.equal(year.to.slice(5), '12-31');

    assert.deepEqual(U.rangeFor({ preset: 'custom', from: '2026-01-01', to: '' }), {
        from: '2026-01-01',
        to: '',
    });
    assert.deepEqual(U.rangeFor({ preset: 'custom' }), { from: '', to: '' });
    assert.deepEqual(U.rangeFor('unknown'), { from: '', to: '' });
});

test('剩余天数取整朝向未来，百分比封顶 999%', () => {
    assert.equal(U.daysLeft(U.today()), 0);
    assert.equal(U.daysLeft(U.addDays(U.today(), 3)), 3);
    assert.equal(U.daysLeft(U.addDays(U.today(), -2)), -2);
    // 空值返回 0 而不是 NaN，界面才不会显示 NaN。
    assert.equal(U.daysLeft(''), 0);
    assert.equal(U.daysLeft(null), 0);

    assert.equal(U.fmtPercent(1, 4), '25%');
    assert.equal(U.fmtPercent(3, 2), '150%');
    assert.equal(U.fmtPercent(1, 0), '0%');
    assert.equal(U.fmtPercent(1000, 1), '999%');
});

test('uid 连续调用不重复', () => {
    const ids = new Set(Array.from({ length: 200 }, () => U.uid()));
    assert.equal(ids.size, 200);
});

test('工具模块不再导出 V1 遗留的 HTML 转义', () => {
    // V2 用 Vue 模板渲染，HTML 转义由框架负责，保留 U.esc 只会误导调用方。
    assert.equal(U.esc, undefined);
    assert.ok(!source.includes('U.esc'), '源码不应再定义 esc');
});
