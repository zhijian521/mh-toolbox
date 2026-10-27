'use strict';
/* 开发模式客户端：CSS 热替换、刷新前状态快照与恢复 */
const Dev = window.Dev = {
  saveSnapshot(resumeOnline) {
    try {
      localStorage.setItem('mh.dev', JSON.stringify({
        page: (window.Views && Views._current) || 'dashboard',
        char: (window.D && D.charFilter) || 'all',
        onlineId: window.D && D.state.activeSession ? D.state.activeSession.id : null,
        resumeOnline: resumeOnline === true && !!(window.Views && Views._quick.isOnline),
        savedAt: Date.now()
      }));
    } catch (e) { /* 忽略快照失败 */ }
  },

  restore() {
    try {
      const snap = JSON.parse(localStorage.getItem('mh.dev') || 'null');
      if (!snap) return;
      const resumeOnline = snap.resumeOnline;
      snap.resumeOnline = false;
      localStorage.setItem('mh.dev', JSON.stringify(snap));
      if (snap.char && window.D) D.setCharFilter(snap.char);
      if (snap.page && window.Views && Views._pages.some(function (p) { return p.id === snap.page; })) {
        Views._current = snap.page;
      }
      /* 仅开发热刷新自动续计；普通重启由持久化在线记录触发恢复提示。 */
      const fresh = snap.savedAt && Date.now() - snap.savedAt < 10 * 60 * 1000;
      if (fresh && resumeOnline && D.state.activeSession && D.state.activeSession.id === snap.onlineId) {
        Views._quick.recovering = false;
        if (!Views._quick.interval) Views._quick.interval = setInterval(Views.quickTick, 1000);
      }
    } catch (e) { /* 忽略恢复失败 */ }
  }
};

(function initDev() {
  if (!window.mh || !mh.onDevReload) return;
  mh.onDevReload(function () {
    Dev._reloading = true;
    Dev.saveSnapshot(true);
    location.reload();
  });
  mh.onDevCss(function () {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
      const url = new URL(link.href); url.searchParams.set('v', Date.now()); link.href = url.href;
    });
  });
  window.addEventListener('beforeunload', function () { Dev.saveSnapshot(Dev._reloading === true); });
})();
