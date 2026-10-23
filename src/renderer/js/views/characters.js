'use strict';
/* 角色页 */
Views.characters = function () {
  const el = document.getElementById('view');
  const chars = D.state.characters.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

  el.innerHTML =
    '<div class="char-grid">' +
    chars.map(function (c) {
      const txN = D.earnings().filter(function (t) { return t.characterId === c.id; }).length;
      const accountN = D.accounts().filter(function (t) { return t.characterId === c.id; }).length;
      const goalN = D.state.goals.filter(function (g) { return g.characterId === c.id && g.status === 'active'; }).length;
      const eqN = D.state.equipment.filter(function (e) { return e.characterId === c.id && e.status === 'active'; }).length;
      return '<div class="char-card" data-id="' + c.id + '">' +
        '<div class="char-top"><div class="avatar">' + U.esc((c.name || '?').slice(0, 1)) + '</div>' +
        '<div><div class="char-name">' + U.esc(c.name) + '</div>' +
        '<div class="char-sub">' + (c.level ? c.level + ' 级 · ' : '') + U.esc(c.school || '') + (c.server ? ' · ' + U.esc(c.server) : '') + '</div></div></div>' +
        '<div class="char-stats">' +
          '<div class="char-stat"><div class="n">' + U.fmtInt(txN) + '</div><div class="t">收益记录</div></div>' +
          '<div class="char-stat"><div class="n">' + U.fmtInt(accountN) + '</div><div class="t">账号记录</div></div>' +
          '<div class="char-stat"><div class="n">' + U.fmtInt(goalN) + '</div><div class="t">进行中目标</div></div>' +
          '<div class="char-stat"><div class="n">' + U.fmtInt(eqN) + '</div><div class="t">在用装备</div></div>' +
        '</div>' +
        '<div class="char-actions"><button class="btn btn-sm" data-act="edit">编辑</button>' +
        '<button class="btn btn-sm btn-ghost btn-danger" data-act="del">删除</button></div>' +
      '</div>';
    }).join('') +
    '<div class="char-card add" data-act="add"><span>＋ 添加角色</span></div>' +
    '</div>' +
    (chars.length ? '' : '<p style="color:var(--muted);font-size:12.5px;margin-top:14px">提示：养老多开的话，每个号建一个角色，记录时会自动归类。</p>');

  el.querySelector('[data-act="add"]').addEventListener('click', function () { Views.charModal(); });
  el.querySelectorAll('.char-card[data-id]').forEach(function (card) {
    const c = D.charById(card.dataset.id);
    card.querySelector('[data-act="edit"]').addEventListener('click', function () { Views.charModal(c); });
    card.querySelector('[data-act="del"]').addEventListener('click', async function () {
      const n = D.state.transactions.filter(function (t) { return t.characterId === c.id; }).length +
        D.state.goals.filter(function (g) { return g.characterId === c.id; }).length +
        D.state.equipment.filter(function (e) { return e.characterId === c.id; }).length;
      const ok = await UI.confirmModal({
        title: '删除角色',
        message: '确定删除角色「' + c.name + '」吗？其名下 ' + n + ' 条相关记录（收益/账号账本/目标/装备）会一并删除，且无法恢复。',
        danger: true, confirmText: '确认删除'
      });
      if (!ok) return;
      D.state.characters = D.state.characters.filter(function (x) { return x.id !== c.id; });
      D.state.transactions = D.state.transactions.filter(function (x) { return x.characterId !== c.id; });
      D.state.goals = D.state.goals.filter(function (x) { return x.characterId !== c.id; });
      const eqIds = D.state.equipment.filter(function (x) { return x.characterId === c.id; }).map(function (x) { return x.id; });
      D.state.equipment = D.state.equipment.filter(function (x) { return x.characterId !== c.id; });
      D.state.gearLogs = D.state.gearLogs.filter(function (x) { return eqIds.indexOf(x.equipmentId) < 0; });
      if (D.charFilter === c.id) D.setCharFilter('all');
      await D.persist();
      Views.refreshHeader(); UI.toast('角色已删除'); Views.characters();
    });
  });
};

Views.charModal = function (c) {
  const isNew = !c;
  UI.formModal({
    title: isNew ? '添加角色' : '编辑角色',
    values: c || { name: '', level: '', school: '大唐官府', server: '' },
    fields: [
      { key: 'name', label: '角色昵称', type: 'text', required: true, placeholder: '如：养老一号' },
      { key: 'level', label: '等级', type: 'number', min: 0, placeholder: '如 69、109' },
      { key: 'school', label: '门派', type: 'select', options: D.schools },
      { key: 'server', label: '服务器', type: 'text', placeholder: '如：紫禁城' }
    ],
    onSubmit: async function (data) {
      if (isNew) {
        D.state.characters.push(Object.assign({ id: U.uid(), createdAt: Date.now() }, data));
        Views.refreshHeader();
        UI.toast('角色已创建，开始记录吧');
      } else {
        Object.assign(c, data);
        UI.toast('已保存 ✓');
      }
      await D.persist();
      Views.characters();
    }
  });
};
