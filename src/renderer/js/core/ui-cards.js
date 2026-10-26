'use strict';
/* 角色与目标卡片共用拖动、键盘排序和边缘滚动。 */
UI.bindCardOrdering = function (el, opts) {
  const grid = el.querySelector(opts.grid);
  if (!grid) return;
  const cards = [...grid.querySelectorAll(opts.card)];
  let dragged = null, marked = null, scrollFrame = 0, scrollDelta = 0;
  const clearMarker = () => {
    if (marked) { delete marked.dataset.dropSide; marked = null; }
  };
  const cleanup = () => {
    if (dragged) dragged.classList.remove('is-dragging');
    dragged = null; clearMarker(); scrollDelta = 0;
    cancelAnimationFrame(scrollFrame); scrollFrame = 0;
  };
  const autoScroll = () => {
    scrollFrame = 0;
    if (!dragged || !grid.isConnected || !scrollDelta) return;
    el.scrollTop += scrollDelta;
    scrollFrame = requestAnimationFrame(autoScroll);
  };
  const destination = (event) => {
    const card = event.target.closest(opts.card);
    if (!dragged || !card || card === dragged || !grid.contains(card)) return null;
    const bounds = card.getBoundingClientRect();
    const sameRow = Math.abs(dragged.getBoundingClientRect().top - bounds.top) < 1;
    const before = sameRow ? event.clientX < bounds.left + bounds.width / 2 : event.clientY < bounds.top + bounds.height / 2;
    return { card, position: before ? 'before' : 'after', side: sameRow ? before ? 'left' : 'right' : before ? 'top' : 'bottom' };
  };
  for (const card of cards) {
    const handle = card.querySelector('[data-act="move"]');
    handle.ondragstart = (event) => {
      if (opts.pending()) { event.preventDefault(); return; }
      UI.closePop(); dragged = card;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-mh-' + opts.kind, card.dataset.id);
      const bounds = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(card, event.clientX - bounds.left, event.clientY - bounds.top);
      card.classList.add('is-dragging');
    };
    handle.ondragend = cleanup;
    handle.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      if (opts.pending()) return;
      const target = cards[cards.indexOf(card) + direction];
      if (target) opts.onMove(card.dataset.id, { targetId: target.dataset.id, position: direction < 0 ? 'before' : 'after' });
    };
  }
  grid.ondragover = (event) => {
    if (!dragged) return;
    event.preventDefault();
    const target = destination(event);
    event.dataTransfer.dropEffect = target ? 'move' : 'none';
    clearMarker();
    if (target) { marked = target.card; marked.dataset.dropSide = target.side; }
    const bounds = el.getBoundingClientRect();
    scrollDelta = event.clientY < bounds.top + 48 ? -12 : event.clientY > bounds.bottom - 48 ? 12 : 0;
    if (scrollDelta && !scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
  };
  grid.ondragleave = (event) => {
    if (!grid.contains(event.relatedTarget)) { clearMarker(); scrollDelta = 0; }
  };
  grid.ondrop = (event) => {
    if (!dragged) return;
    event.preventDefault();
    const target = destination(event), id = dragged.dataset.id;
    cleanup();
    if (target) opts.onMove(id, { targetId: target.card.dataset.id, position: target.position });
  };
};

/* 保存状态由页面持有，共用锁定、忙碌标记、失败恢复和通知。 */
UI.persistCardOrder = async function (state, pendingKey, opts) {
  if (state[pendingKey]) return;
  state[pendingKey] = true;
  const grid = document.querySelector(opts.grid);
  const controls = [...(grid?.querySelectorAll('[data-act="move"]') || [])]
    .map((button) => [button, button.disabled]);
  controls.forEach(([button]) => { button.disabled = true; });
  grid?.setAttribute('aria-busy', 'true');
  try {
    await opts.save();
    opts.onSaved();
    UI.toast(opts.message);
  } catch (error) { UI.toast(error.message || '排序失败，请重试', 'err'); }
  finally {
    state[pendingKey] = false;
    controls.forEach(([button, disabled]) => { button.disabled = disabled; });
    grid?.removeAttribute('aria-busy');
  }
};
