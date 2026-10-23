'use strict';
/* 基础工具 */
const U = window.U = {};

U.uid = function () {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
};

U.fmtDate = function (d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

U.today = function () { return U.fmtDate(new Date()); };

U.addDays = function (dateStr, n) {
  const d = U.parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return U.fmtDate(d);
};

U.parseDate = function (s) {
  const a = String(s).split('-').map(Number);
  return new Date(a[0], (a[1] || 1) - 1, a[2] || 1);
};

U.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

U.fmtMoney = function (v) {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 10000) return (v / 10000).toFixed(2) + ' 亿';
  const r = Math.round(v * 100) / 100;
  return (Number.isInteger(r) ? r : r.toFixed(2)) + ' 万';
};

U.fmtInt = function (v) {
  if (v == null || isNaN(v)) return '0';
  return Math.round(v).toLocaleString('zh-CN');
};

U.fmtMinutes = function (m) {
  if (!m) return '—';
  if (m < 60) return m + ' 分钟';
  return (m / 60).toFixed(1) + ' 小时';
};

U.rangeFor = function (key) {
  const now = new Date();
  const today = U.fmtDate(now);
  if (key === 'today') return { from: today, to: today };
  if (key === 'week') {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; /* 周一为一周开始 */
    d.setDate(d.getDate() - day);
    const from = U.fmtDate(d);
    return { from: from, to: U.addDays(from, 6) };
  }
  if (key === 'month') {
    return {
      from: U.fmtDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: U.fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    };
  }
  if (key === 'year') {
    return { from: now.getFullYear() + '-01-01', to: now.getFullYear() + '-12-31' };
  }
  return { from: '', to: '' };
};

U.daysLeft = function (dateStr) {
  return Math.ceil((U.parseDate(dateStr) - U.parseDate(U.today())) / 86400000);
};

U.fmtPercent = function (a, b) {
  if (!b) return '0%';
  return Math.min(999, Math.round((a / b) * 100)) + '%';
};
