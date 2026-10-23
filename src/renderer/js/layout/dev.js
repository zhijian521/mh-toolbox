'use strict';
/* 开发模式客户端：CSS 热替换、刷新前状态快照与恢复 */
const Dev = window.Dev = {
  saveSnapshot() {
    try {
      const q = window.Views && Views._quick ? { isOnline: !!Views._quick.isOnline, startTime: Views._quick.startTime || null } : null;
      localStorage.setItem('mh.dev', JSON.stringify({
        page: (window.Views && Views._current) || 'dashboard',
        char: (window.D && D.charFilter) || 'all',
        quick: q,
        savedAt: Date.now()
      }));
    } catch (e) { /* 忽略快照失败 */ }
  },

  restore() {
    try {
      const snap = JSON.parse(localStorage.getItem('mh.dev') || 'null');
      if (!snap) return;
      if (snap.char && window.D) D.setCharFilter(snap.char);
      if (snap.page && window.Views && Views._pages.some(function (p) { return p.id === snap.page; })) {
        Views._current = snap.page;
      }
      /* 计时器仅在 10 分钟内的快照且为当天时恢复，避免隔夜误续 */
      const fresh = snap.savedAt && Date.now() - snap.savedAt < 10 * 60 * 1000;
      if (fresh && snap.quick && snap.quick.isOnline && snap.quick.startTime && window.Views && Views._quick) {
        const sameDay = new Date(snap.quick.startTime).toDateString() === new Date().toDateString();
        if (sameDay) {
          Views._quick.isOnline = true;
          Views._quick.startTime = snap.quick.startTime;
          if (!Views._quick.interval) Views._quick.interval = setInterval(Views.quickTick, 1000);
        }
      }
    } catch (e) { /* 忽略恢复失败 */ }
  }
};

(function initDev() {
  if (!window.mh || !mh.onDevReload) return;
  mh.onDevReload(function () {
    Dev.saveSnapshot();
    location.reload();
  });
  mh.onDevCss(function () {
    const link = document.querySelector('link[rel="stylesheet"]');
    if (link) link.href = 'styles.css?v=' + Date.now();
  });
  window.addEventListener('beforeunload', function () { Dev.saveSnapshot(); });
})();
