'use strict';
/* 在线计时展示与开始、结束操作。 */
Views.quickTick = function () {
  const q = Views._quick;
  if (!q.isOnline || !q.startTime || Views._current !== 'quick') return;
  const range = U.rangeFor(Views._quickRange);
  const key = [D.charFilter, range.from, range.to].join('|');
  if (!Views._quickSettled || Views._quickSettled.key !== key) {
    Views._quickSettled = { key, stats: D.earningsStats(D.charFilter, range.from, range.to) };
  }
  const stats = D.includeActiveEarnings(Views._quickSettled.stats, D.charFilter, range.from, range.to);
  const diff = Date.now() - q.startTime;

  const p2 = function (n) { return String(n).padStart(2, '0'); };
  const tEl = document.getElementById('quick-time');
  if (tEl) tEl.textContent = p2(Math.floor(diff / 3600000)) + ':' + p2(Math.floor(diff / 60000) % 60) + ':' + p2(Math.floor(diff / 1000) % 60);
  const hEl = document.getElementById('quick-h');
  if (hEl) hEl.textContent = (stats.onlineMinutes / 60).toFixed(2) + ' 小时';
  const cEl = document.getElementById('quick-card');
  if (cEl) cEl.textContent = U.fmtMoney(stats.cardCost);
  const bEl = document.getElementById('quick-balance');
  if (bEl) { bEl.textContent = U.fmtMoney(stats.net); bEl.parentElement.className = 'stat ' + (stats.net >= 0 ? 'good' : 'bad'); }
  const hourly = document.getElementById('quick-hourly');
  if (hourly) hourly.textContent = stats.hourly == null ? '—' : U.fmtMoney(stats.hourly) + '/时';
};

Views.quickStart = async function () {
  const q = Views._quick;
  if (q.busy || D.state.activeSession) return;
  q.busy = true;
  try {
    await D.startSession(Views.quickCharId());
    q.recovering = false;
    if (!q.interval) q.interval = setInterval(Views.quickTick, 1000);
    UI.toast('开始记录游戏时间');
    Views.rerender();
  } catch (error) { UI.toast(error.message, 'err'); }
  finally { q.busy = false; }
};

Views.quickStop = async function () {
  const q = Views._quick;
  const active = D.state.activeSession;
  if (q.busy || !q.isOnline || !active) return;
  q.busy = true;
  try {
    const session = await D.saveSession(Object.assign({}, active, { mode: 'range', endAt: Date.now(), source: 'timer' }), active.id);
    Views.clearQuickTimer();
    UI.toast('本段在线 ' + (session.minutes / 60).toFixed(2) + ' 小时，点卡 -' + U.fmtMoney(session.cost));
    Views.rerender();
  } catch (error) { UI.toast(error.message, 'err'); }
  finally { q.busy = false; }
};
