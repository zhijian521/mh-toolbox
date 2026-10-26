'use strict';
/* 养成变更只读快照，角色与日期筛选不影响页面筛选。 */
Views.charHistoryModal = function (characterId = 'all') {
  let selected = characterId;
  const overlay = UI.openModal({
    title: '养成记录', wide: true,
    returnFocus: () => characterId === 'all' ? document.getElementById('character-history') : Views.charFocusTarget(characterId, 'history'),
    body: '<div class="char-history-filters"><label>角色<span data-history="character"></span></label>' +
      '<div data-history="range"></div></div><div data-history="records"></div>',
    footer: '<p class="char-history-hint">保存档案时自动记录养成变化；首次建档作为起点。</p><button class="btn" data-act="close">关闭</button>',
  });
  overlay.classList.add('char-modal', 'char-history-modal');
  overlay.querySelector('[data-act="close"]').onclick = UI.requestCloseModal;
  UI.select(overlay.querySelector('[data-history="character"]'), {
    options: [{ v: 'all', t: '全部角色' }, ...D.orderedCharacters().map((character) => ({ v: character.id, t: character.name }))],
    value: selected, label: '筛选角色',
    onChange: (value) => { selected = value; history.refresh(); },
  });
  const history = UI.historyList(overlay, {
    getEntries: (range) => D.characterGrowthHistory(selected, range),
    emptyText: '还没有养成记录。下次修改并保存技能、修炼或养成数值后，会自动出现在这里。',
    countLabel: '次变更', rangeLabel: '养成记录日期范围',
    renderEntries: (entries) => {
      const days = new Map();
      for (const entry of entries) {
        if (!days.has(entry.date)) days.set(entry.date, []);
        days.get(entry.date).push(entry);
      }
      return [...days].map(([date, events]) => '<section class="char-history-day">' +
        '<div class="char-section-head"><h4 class="char-form-title"><time datetime="' + date + '">' + date + '</time></h4></div>' +
        events.map(Views.charHistoryEntryHtml).join('') + '</section>').join('');
    },
  });
};

Views.charHistoryEntryHtml = function (entry) {
  const context = [entry.source === 'copy' ? '复制自 ' + entry.sourceName : '', entry.note].filter(Boolean).join('\n');
  return '<article class="char-history-entry" data-entry="' + U.esc(entry.id) + '" aria-label="' + U.esc(entry.characterName) +
    '的养成变化"><ul class="char-history-changes">' + entry.changes.map((change, index) => {
      return '<li><span class="char-history-character" title="' + U.esc(entry.characterName) + '">' + U.esc(entry.characterName) + '</span>' +
        '<span class="char-history-item"><small>' + U.esc(change.group) + '</small><span class="char-history-label" title="' + U.esc(change.label) + '">' + U.esc(change.label) + '</span></span>' +
        '<span class="char-history-values" title="' + U.esc(UI.growthHistoryTitle(change)) + '">' + UI.growthHistoryValuesHtml(change) + '</span>' +
        '<span class="char-history-kind ' + (change.kind === 'increase' ? 'is-increase' : '') + '">' + UI.growthHistoryKindHtml(change) + '</span>' +
        (index === 0 && context ? '<span class="char-history-context" tabindex="0" role="img" aria-label="' + U.esc(context) + '">' +
          UI.icon('book', 13) + '<span class="char-history-note">' + U.esc(context) + '</span></span>' : '') + '</li>';
    }).join('') + '</ul></article>';
};
