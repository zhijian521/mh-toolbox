'use strict';
/* 备份与设置页 */
Views.backup = async function () {
  const el = document.getElementById('view');
  const info = await window.mh.info();
  const s = D.state;
  el.innerHTML =
    '<div class="backup-grid">' +
      '<div>' +
        '<div class="card"><div class="card-title">数据概览</div>' +
          '<div class="kv"><span class="k">角色</span><span class="v">' + U.fmtInt(s.characters.length) + ' 个</span></div>' +
          '<div class="kv"><span class="k">收益记录</span><span class="v">' + U.fmtInt(D.earnings().length) + ' 笔（含物品）</span></div>' +
          '<div class="kv"><span class="k">在线记录</span><span class="v">' + U.fmtInt(s.sessions.length) + ' 段</span></div>' +
          '<div class="kv"><span class="k">账号账本</span><span class="v">' + U.fmtInt(D.accounts().length) + ' 笔</span></div>' +
          '<div class="kv"><span class="k">目标</span><span class="v">' + U.fmtInt(s.goals.length) + ' 个</span></div>' +
          '<div class="kv"><span class="k">装备档案</span><span class="v">' + U.fmtInt(s.equipment.length) + ' 件（变动 ' + U.fmtInt(s.gearLogs.length) + ' 次）</span></div>' +
          '<div class="kv"><span class="k">数据文件</span><span class="v">' + U.esc(info.dataFile) + '</span></div>' +
        '</div>' +
        '<div class="card"><div class="card-title">备份与恢复</div>' +
          '<p style="font-size:12.5px;color:var(--muted);line-height:1.7;margin-bottom:14px">所有数据仅保存在本机，不上传云端。建议定期导出 JSON 备份，换电脑或重装前先导出。</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<button class="btn btn-gold" data-act="export">导出备份</button>' +
            '<button class="btn" data-act="import">导入备份</button>' +
            '<button class="btn" data-act="demo">加载示例数据</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<div class="card"><div class="card-title">关于</div>' +
          '<div class="kv"><span class="k">应用</span><span class="v">梦幻养老助手 v' + U.esc(info.version) + '</span></div>' +
          '<div class="kv"><span class="k">技术</span><span class="v">Electron 桌面应用 · 本地 JSON 存储</span></div>' +
          '<div class="kv"><span class="k">记账单位</span><span class="v">梦幻币按「万」、人民币按「元」记录；物品估值独立统计。</span></div>' +
        '</div>' +
        '<div class="card"><div class="card-title" style="color:var(--red)">危险区</div>' +
          '<p style="font-size:12.5px;color:var(--muted);margin-bottom:14px">清空将删除本机全部记录，请务必先导出备份。</p>' +
          '<button class="btn btn-danger" data-act="wipe">清空全部数据</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  el.querySelector('[data-act="demo"]').addEventListener('click', function () { Views.loadDemoData(); });
  el.querySelector('[data-act="export"]').addEventListener('click', async function () {
    const r = await window.mh.exportData(D.state);
    if (r.ok) UI.toast('已导出到：' + r.path);
    else if (!r.canceled) UI.toast('导出失败：' + (r.error || '未知错误'), 'err');
  });
  el.querySelector('[data-act="import"]').addEventListener('click', async function () {
    const r = await window.mh.importData();
    if (!r.ok) { if (!r.canceled) UI.toast('导入失败：' + (r.error || '文件格式错误'), 'err'); return; }
    let preview;
    try { D.validateBackup(r.data); preview = D.normalize(r.data); }
    catch (error) { UI.toast(error.message, 'err'); return; }
    const ok = await UI.confirmModal({ title: '导入备份', message: '备份含 ' + preview.characters.length + ' 个角色、' +
      preview.transactions.length + ' 条收支、' + preview.goals.length + ' 个目标。将覆盖当前全部数据，覆盖前会保存本地副本，确定继续吗？', danger: true, confirmText: '覆盖导入' });
    if (!ok) return;
    try { await D.replaceState(r.data); }
    catch (error) { UI.toast(error.message, 'err'); return; }
    Views.clearQuickTimer();
    Views._quick.recovering = !!D.state.activeSession;
    D.setCharFilter('all');

    Views.refreshHeader();
    UI.toast('导入成功 ✓');
    Views.backup();
    if (Views._quick.recovering) Views.recoverOnline();
  });
  el.querySelector('[data-act="wipe"]').addEventListener('click', async function () {
    const ok1 = await UI.confirmModal({ title: '清空数据', message: '确定要清空全部数据吗？此操作不可恢复！', danger: true, confirmText: '我要清空' });
    if (!ok1) return;
    const ok2 = await UI.confirmModal({ title: '再次确认', message: '真的确定吗？建议先导出备份！', danger: true, confirmText: '确认清空' });
    if (!ok2) return;
    try { await D.replaceState({ characters: [], transactions: [] }, 'wipe'); }
    catch (error) { UI.toast(error.message, 'err'); return; }
    Views.clearQuickTimer();
    D.setCharFilter('all');

    Views.refreshHeader();
    UI.toast('已清空');
    Views.backup();
  });
};
