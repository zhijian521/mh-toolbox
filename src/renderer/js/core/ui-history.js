'use strict';
/* 弹窗记录列表共用日期范围、分页与焦点；行内容由所属页面渲染。 */
UI.historyList = function (overlay, opts) {
  let range = { preset: 'all', ...opts.state?.range }, page = opts.state?.page || 1;
  const pageSize = 12, records = overlay.querySelector('[data-history="records"]');
  records.setAttribute('aria-live', 'polite');
  const renderRecords = () => {
    const entries = opts.getEntries(U.rangeFor(range));
    if (!entries.length) {
      const hasHistory = opts.getEntries({}).length > 0;
      records.innerHTML = '<div class="empty"><div class="ic">' + UI.icon('calendar', 26) + '</div><p>' +
        U.esc(hasHistory ? '此时间范围内没有记录，请调整日期范围。' : opts.emptyText) + '</p></div>';
      return;
    }
    const pages = Math.ceil(entries.length / pageSize);
    page = Math.max(1, Math.min(page, pages));
    const visible = entries.slice((page - 1) * pageSize, page * pageSize);
    records.innerHTML = opts.renderEntries(visible) +
      '<div class="ledger-pagination"><span>共 ' + entries.length + ' ' + (opts.countLabel || '条记录') + ' · ' + page + ' / ' + pages + ' 页</span>' +
      '<button class="btn btn-sm" data-page="previous"' + (page === 1 ? ' disabled' : '') + '>上一页</button>' +
      '<button class="btn btn-sm" data-page="next"' + (page === pages ? ' disabled' : '') + '>下一页</button></div>';
    records.querySelectorAll('[data-page]').forEach((button) => {
      button.onclick = () => {
        page += button.dataset.page === 'next' ? 1 : -1;
        renderRecords();
        overlay.querySelector('.modal-body').scrollTop = 0;
        const focus = records.querySelector('[data-page="' + button.dataset.page + '"]:not(:disabled)') ||
          records.querySelector('[data-page]:not(:disabled)');
        focus?.focus({ preventScroll: true });
      };
    });
    opts.bindEntries?.(records, visible);
  };
  const renderRange = () => UI.dateRange(overlay.querySelector('[data-history="range"]'), {
    value: range, label: opts.rangeLabel || '记录日期范围',
    onChange: (value) => {
      const previous = U.rangeFor(range), dateKey = value.from !== previous.from ? 'from' : 'to';
      UI.closePop(); range = value; page = 1; renderRange(); renderRecords();
      const selector = value.preset === 'custom' ? '[data-date="' + dateKey + '"] button' : '[data-range="' + value.preset + '"]';
      overlay.querySelector(selector)?.focus({ preventScroll: true });
    },
  });
  renderRange(); renderRecords();
  return {
    refresh() { page = 1; renderRecords(); },
    getState() { return { range: { ...range }, page }; },
  };
};
