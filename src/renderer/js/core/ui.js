'use strict';
/* 通用 UI：Toast / 弹窗 / 表单 */
const UI = window.UI = {};

UI.toast = function (msg, type) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(function () {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 260);
  }, 2200);
};

UI.closeModal = function () {
  UI.closePop();
  const root = document.getElementById('modal-root');
  const overlay = root.querySelector('.modal-overlay');
  if (!overlay) return;
  root.replaceChildren();
  if (overlay._onClose) overlay._onClose();
  const returnFocus = overlay._resolveReturnFocus ? overlay._resolveReturnFocus() : overlay._returnFocus;
  if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
};

UI.watchForm = function (overlay) {
  const snapshot = () => JSON.stringify([
    ...[...overlay.querySelectorAll('input, textarea, select')].map((el) => [el.name, el.type === 'checkbox' ? el.checked : el.value]),
    ...[...overlay.querySelectorAll('.seg[data-key]')].map((el) => [el.dataset.key, el.dataset.val]),
  ]);
  const initial = snapshot();
  overlay._isDirty = () => snapshot() !== initial;
};

UI.requestCloseModal = function () {
  const overlay = document.querySelector('.modal-overlay');
  if (!overlay || overlay._saving) return;
  if (!overlay._isDirty || !overlay._isDirty()) { UI.closeModal(); return; }
  if (overlay.querySelector('.modal-discard')) return;
  const previous = document.activeElement;
  const notice = document.createElement('div');
  notice.className = 'modal-discard';
  notice.setAttribute('role', 'group');
  notice.setAttribute('aria-label', '未保存的修改');
  notice.innerHTML = '<span>修改尚未保存</span><button class="btn btn-sm" data-act="continue">继续编辑</button>' +
    '<button class="btn btn-sm btn-danger" data-act="discard">放弃修改</button>';
  overlay.querySelector('.modal').appendChild(notice);
  notice.querySelector('[data-act="continue"]').onclick = () => { notice.remove(); if (previous.isConnected) previous.focus(); };
  notice.querySelector('[data-act="discard"]').onclick = () => { if (!overlay._saving) UI.closeModal(); };
  notice.querySelector('button').focus();
};

UI.openModal = function (opts) {
  const previous = document.querySelector('.modal-overlay');
  const returnFocus = previous && previous.contains(document.activeElement) ? previous._returnFocus : document.activeElement;
  const resolveReturnFocus = opts.returnFocus || (previous && previous.contains(document.activeElement) ? previous._resolveReturnFocus : null);
  UI.closeModal();
  UI.closePop();
  const root = document.getElementById('modal-root');
  root.innerHTML =
    '<div class="modal-overlay">' +
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">' +
        '<div class="modal-head"><h3 id="modal-title">' + U.esc(opts.title) + '</h3>' +
        '<button class="modal-x" title="关闭" aria-label="关闭">✕</button></div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>' +
    '</div>';
  const overlay = root.querySelector('.modal-overlay');
  overlay._returnFocus = returnFocus;
  overlay._resolveReturnFocus = resolveReturnFocus;
  overlay._onClose = opts.onClose;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) UI.requestCloseModal(); });
  root.querySelector('.modal-x').addEventListener('click', UI.requestCloseModal);
  requestAnimationFrame(() => {
    if (!overlay.isConnected || document.querySelector('.xpop') || overlay.contains(document.activeElement)) return;
    const field = [...overlay.querySelectorAll('.modal-body input:not([type="hidden"]), .modal-body textarea, .modal-body .xsel')]
      .find((el) => el.getClientRects().length && !el.closest('[hidden]'));
    (field || overlay.querySelector('[data-act="no"], .modal-x')).focus();
  });
  return overlay;
};

UI.confirmModal = function (opts) {
  return new Promise((resolve) => {
    const ov = UI.openModal({
      title: opts.title || '确认操作',
      body: '<p class="confirm-message">' + U.esc(opts.message || '确定要执行该操作吗？') + '</p>',
      footer: '<button class="btn" data-act="no">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-gold') + '" data-act="yes">' + U.esc(opts.confirmText || '确定') + '</button>',
      onClose: () => resolve(false),
    });
    ov.querySelector('[data-act="no"]').onclick = UI.requestCloseModal;
    ov.querySelector('[data-act="yes"]').onclick = () => { resolve(true); UI.closeModal(); };
  });
};

/* ---------- 表单弹窗 ---------- */
UI.fieldHtml = function (f, val) {
  const v = val != null && val !== '' ? val : (f.default != null ? f.default : '');
  const req = f.required ? ' req' : '';
  let inner = '';
  switch (f.type) {
    case 'select': {
      const opts = f.options.map(function (o) { return typeof o === 'string' ? { v: o, t: o } : o; });
      const cur = opts.some(function (o) { return String(o.v) === String(v); }) ? v : (opts[0] ? opts[0].v : '');
      inner = '<div class="xmount" data-xmount="' + f.key + '"><input type="hidden" name="' + f.key + '" value="' + U.esc(cur) + '"></div>';
      break;
    }
    case 'date':
      inner = '<div class="xmount" data-xmount="' + f.key + '"><input type="hidden" name="' + f.key + '" value="' + U.esc(v) + '"></div>';
      break;
    case 'textarea':
      inner = '<textarea name="' + f.key + '" aria-label="' + U.esc(f.label) + '" placeholder="' + U.esc(f.placeholder || '') + '">' + U.esc(v) + '</textarea>';
      break;
    case 'segment': {
      const cur = v !== '' ? String(v) : String(f.options[0].v);
      inner = '<div class="seg" data-key="' + f.key + '" data-val="' + U.esc(cur) + '">' +
        f.options.map(function (o) {
          return '<button type="button" class="seg-btn' + (String(o.v) === cur ? ' on' : '') + '" data-v="' + U.esc(o.v) + '">' + U.esc(o.t) + '</button>';
        }).join('') + '</div>';
      break;
    }
    case 'check':
      return '<div class="frow full" data-field="' + f.key + '"><label class="check-line"><input type="checkbox" name="' + f.key + '"' + (v ? ' checked' : '') + '> <span>' + U.esc(f.label) + (f.hint ? ' <span class="hint">' + U.esc(f.hint) + '</span>' : '') + '</span></label></div>';
    default: {
      const step = f.step ? ' step="' + f.step + '"' : '';
      const min = f.min != null ? ' min="' + f.min + '"' : '';
      inner = '<input type="' + (f.type || 'text') + '" name="' + f.key + '" aria-label="' + U.esc(f.label) + '" value="' + U.esc(v) + '" placeholder="' + U.esc(f.placeholder || '') + '"' + step + min + '>';
    }
  }
  return '<div class="frow' + (f.full ? ' full' : '') + '" data-field="' + f.key + '">' +
    '<label class="' + req.trim() + '">' + U.esc(f.label) + '</label>' + inner +
    (f.hint ? '<span class="hint">' + U.esc(f.hint) + '</span>' : '') + '</div>';
};

UI.formModal = function (opts) {
  const fields = opts.fields;
  const values = opts.values || {};
  const body = '<form id="mform" class="form-grid">' +
    fields.map(function (f) { return UI.fieldHtml(f, values[f.key]); }).join('') + '</form>';
  const ov = UI.openModal({
    title: opts.title,
    wide: opts.wide,
    returnFocus: opts.returnFocus,
    body: body,
    footer:
      '<button class="btn" data-act="cancel">取消</button>' +
      '<button class="btn btn-gold" data-act="ok">' + U.esc(opts.submitText || '保存') + '</button>'
  });
  const form = ov.querySelector('#mform');
  ov.querySelector('[data-act="cancel"]').addEventListener('click', UI.requestCloseModal);

  /* 分段选择器交互 */
  ov.querySelectorAll('.seg').forEach(function (seg) {
    seg.addEventListener('click', function (e) {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      seg.dataset.val = btn.dataset.v;
      seg.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('on', b === btn); });
      seg.dispatchEvent(new CustomEvent('segchange', { bubbles: true, detail: { key: seg.dataset.key, val: seg.dataset.val } }));
    });
  });

  /* 自定义下拉 / 日期组件挂载（写入 form._xcomps 供 api 使用） */
  form._xcomps = {};
  fields.forEach(function (f) {
    if (f.type !== 'select' && f.type !== 'date') return;
    const m = form.querySelector('[data-xmount="' + f.key + '"]');
    if (!m) return;
    const h = m.querySelector('input[type="hidden"]');
    const initVal = h ? h.value : '';
    form._xcomps[f.key] = f.type === 'select'
      ? UI.select(m, { name: f.key, options: f.options, value: initVal, placeholder: f.placeholder, label: f.label })
      : UI.date(m, { name: f.key, value: initVal, placeholder: f.placeholder || '选择日期', label: f.label });
    m.querySelector('button').setAttribute('aria-label', f.label);
  });

  const hiddenFields = new Set();
  const api = {
    show(key, visible) {
      const row = form.querySelector('[data-field="' + key + '"]');
      if (row) row.hidden = !visible;
      if (visible) hiddenFields.delete(key); else hiddenFields.add(key);
    },
    getVal(key) {
      const f = fields.find(function (x) { return x.key === key; });
      if (!f) return '';
      if (f.type === 'segment') {
        const seg = form.querySelector('.seg[data-key="' + key + '"]');
        return seg ? seg.dataset.val : '';
      }
      if (f.type === 'check') {
        const el = form.querySelector('[name="' + key + '"]');
        return el ? el.checked : false;
      }
      const el = form.querySelector('[name="' + key + '"]');
      if (!el) return '';
      if (f.type === 'number') {
        const n = parseFloat(el.value);
        return isNaN(n) ? '' : n;
      }
      return el.value.trim();
    },
    setVal(key, v) {
      if (form._xcomps && form._xcomps[key]) { form._xcomps[key].set(v); return; }
      const f = fields.find(function (x) { return x.key === key; });
      if (!f) return;
      if (f.type === 'segment') {
        const seg = form.querySelector('.seg[data-key="' + key + '"]');
        if (seg) {
          seg.dataset.val = v;
          seg.querySelectorAll('.seg-btn').forEach(function (b) { b.classList.toggle('on', b.dataset.v === String(v)); });
        }
        return;
      }
      const el = form.querySelector('[name="' + key + '"]');
      if (el) {
        if (f.type === 'check') el.checked = !!v;
        else el.value = v;
      }
    },
    setOptions(key, options) {
      if (form._xcomps && form._xcomps[key] && form._xcomps[key].setOptions) {
        form._xcomps[key].setOptions(options);
        return;
      }
      const sel = form.querySelector('select[name="' + key + '"]');
      if (!sel) return;
      const cur = api.getVal(key) || (typeof options[0] === 'string' ? options[0] : options[0].v);
      sel.innerHTML = options.map(function (o) {
        const ov = typeof o === 'string' ? { v: o, t: o } : o;
        return '<option value="' + U.esc(ov.v) + '"' + (String(ov.v) === String(cur) ? ' selected' : '') + '>' + U.esc(ov.t) + '</option>';
      }).join('');
    }
  };

  async function submit() {
    const data = {};
    for (const f of fields) data[f.key] = api.getVal(f.key);
    for (const f of fields) {
      if (hiddenFields.has(f.key)) continue;
      if (f.required && (data[f.key] === '' || data[f.key] == null)) {
        UI.toast('请填写「' + f.label + '」', 'err');
        const el = form.querySelector('[name="' + f.key + '"]');
        if (el) el.focus();
        return;
      }
      if (f.type === 'number' && data[f.key] !== '' && (!Number.isFinite(data[f.key]) || (f.min != null && data[f.key] < f.min))) {
        UI.toast('「' + f.label + '」需填写' + (f.min != null ? '不小于 ' + f.min + ' 的' : '有效') + '数字', 'err');
        return;
      }
    }
    const error = opts.validate && opts.validate(data);
    if (error) { UI.toast(error, 'err'); return; }
    const button = ov.querySelector('[data-act="ok"]');
    if (button.disabled) return;
    const discard = ov.querySelector('.modal-discard');
    if (discard) discard.remove();
    const controls = [...ov.querySelectorAll('button, input, textarea, select')].map((element) => [element, element.disabled]);
    const label = button.textContent;
    UI.closePop();
    controls.forEach(([element]) => { element.disabled = true; });
    button.textContent = '保存中…'; ov._saving = true;
    ov.querySelector('.modal').setAttribute('aria-busy', 'true');
    try {
      await opts.onSubmit(data);
      if (ov.isConnected) UI.closeModal();
    } catch (err) {
      UI.toast(err.message || '保存失败，请重试', 'err');
    } finally {
      controls.forEach(([element, disabled]) => { element.disabled = disabled; });
      button.textContent = label; ov._saving = false;
      ov.querySelector('.modal').removeAttribute('aria-busy');
    }
  }

  ov.querySelector('[data-act="ok"]').addEventListener('click', submit);
  form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  if (opts.onRender) opts.onRender(form, api, ov);
  UI.watchForm(ov);
  return api;
};

/* ---------- 细线性 SVG 图标库（规范见 STYLE_GUIDE.md 第 6 节） ---------- */
UI.icons = {
  edit: '<path d="m16 3 5 5M4 20l4-1L21 6a2.1 2.1 0 0 0-3-3L5 16zM4 20h16"/>',
  pin: '<path d="m16 3 5 5-4 1-3 5-4-4 5-3zM10 10l-3 1-2 2 6 6 2-2 1-3M8 16l-5 5"/>',
  sort: '<path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  helmet: '<path d="M4 14v-3a8 8 0 0 1 16 0v3M3 14h18v4H3zM8 18v3m8-3v3M12 3v7"/>',
  necklace: '<path d="M5 3v5a7 7 0 0 0 14 0V3M9 18l3-3 3 3-3 4z"/>',
  armor: '<path d="M8 3 3 6l2 6 3-1v10h8V11l3 1 2-6-5-3a4 4 0 0 1-8 0zM8 15h8"/>',
  belt: '<rect x="2" y="8" width="20" height="8" rx="1"/><rect x="9" y="7" width="6" height="10" rx="1"/><path d="M12 12h4"/>',
  boots: '<path d="M5 3h6v10l8 3v5H3v-7l2-2zM5 7h6M3 18h16"/>',
  ring: '<circle cx="12" cy="15" r="6"/><path d="m8 5 4-3 4 3-4 5z"/>',
  earring: '<path d="M8 7a4 4 0 1 1 4 4v3M8 17l4-4 4 4-4 5z"/>',
  bracelet: '<ellipse cx="12" cy="12" rx="9" ry="7"/><ellipse cx="12" cy="11" rx="6" ry="4"/><path d="M3 12v2a9 7 0 0 0 18 0v-2"/>',
  pendant: '<path d="M8 2c0 5 4 4 4 7 0-3 4-2 4-7M7 10h10l2 8-7 4-7-4zM9 14h6m-6 3h6"/>',
  'jade-yang': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3m0 12v3M3 12h3m12 0h3"/>',
  'jade-yin': '<circle cx="12" cy="12" r="9"/><path d="M14 4a7 7 0 1 0 6 11M9 8l1 1m-3 4 1 1"/>',
  hero: '<path d="M9 5h6l1 3-1 4-3 2-3-2-1-4zM10 4l1-2h2l1 2M7 14l-3 7h16l-3-7-5 3zM7 14l-3 2-2 5m15-7 3 2 2 5M9 17l-1 4m7-4 1 4M10 19h4"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  ledger: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sword: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/>',
  pet: '<ellipse cx="5" cy="10" rx="2" ry="2.5"/><ellipse cx="9" cy="5" rx="2" ry="2.5"/><ellipse cx="15" cy="5" rx="2" ry="2.5"/><ellipse cx="19" cy="10" rx="2" ry="2.5"/><path d="M12 11c-2 0-3 2-4 4-1 1-2 2-2 3.5S7 21 9 21c1.5 0 2-1 3-1s1.5 1 3 1c2 0 3-1 3-2.5S17 16 16 15c-1-2-2-4-4-4z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  archive: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
  settings: '<path d="M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
  'sidebar-collapse': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m7-11-3 3 3 3"/>',
  'sidebar-expand': '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m4-11 3 3-3 3"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>'
};

UI.icon = function (name, size) {
  const s = size || 16;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (UI.icons[name] || '') + '</svg>';
};


/* 窗口控制图标（细线，同规范） */
Object.assign(UI.icons, {
  'win-min': '<line x1="5" y1="12" x2="19" y2="12"/>',
  'win-max': '<rect x="6" y="6" width="12" height="12" rx="1"/>',
  'win-restore': '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  'win-close': '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  'bolt': '<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/>',
  'coin': '<circle cx="12" cy="12" r="9"/><rect x="9.5" y="9.5" width="5" height="5"/>'
});


/* 下拉 / 日历图标 */
Object.assign(UI.icons, {
  'chev-down': '<path d="M6 9l6 6 6-6"/>',
  'chev-left': '<path d="M15 6l-6 6 6 6"/>',
  'chev-right': '<path d="M9 6l6 6-6 6"/>',
  'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'
});


/* ---------- 弹层基座（下拉菜单 / 日历共用） ---------- */
UI.closePop = function (restoreFocus) {
  const old = document.querySelector('.xpop');
  if (old) {
    if (old._anchor && old.id && old._anchor.getAttribute('aria-describedby') === old.id) old._anchor.removeAttribute('aria-describedby');
    if (old._anchor) { old._anchor.setAttribute('aria-expanded', 'false'); old._anchor.removeAttribute('aria-controls'); }
    old.remove();
    if (restoreFocus && old._anchor && old._anchor.isConnected) old._anchor.focus();
  }
  document.removeEventListener('mousedown', UI._popOut, true);
};

UI._popOut = function (e) {
  const pop = document.querySelector('.xpop');
  if (!pop) return;
  if (pop._anchor && !pop._anchor.isConnected) { UI.closePop(); return; }
  if (pop.contains(e.target)) return;
  if (pop._anchor && pop._anchor.contains(e.target)) return;
  UI.closePop();
};

UI.openPop = function (anchor, contentHtml, opts) {
  UI.closePop();
  opts = opts || {};
  const pop = document.createElement('div');
  pop.className = 'xpop';
  pop._anchor = anchor;
  pop.id = 'xpop-' + U.uid();
  anchor.setAttribute('aria-expanded', 'true');
  anchor.setAttribute('aria-controls', pop.id);
  pop.innerHTML = contentHtml;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.visibility = 'hidden';
  {
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = opts.align === 'right' ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.bottom + 4;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.visibility = '';
  }
  document.addEventListener('mousedown', UI._popOut, true);
  return pop;
};

document.addEventListener('keydown', function (event) {
  if (event.defaultPrevented) return;
  if (event.key === 'Escape') {
    if (document.querySelector('.xpop')) UI.closePop(true);
    else UI.requestCloseModal();
    event.preventDefault();
    return;
  }
  if (event.key !== 'Tab') return;
  const overlay = document.querySelector('.modal-overlay');
  if (!overlay) return;
  const focusable = [...overlay.querySelectorAll('button:not([disabled]), input:not([type="hidden"]):not([disabled]), textarea, [tabindex="0"]')]
    .filter((el) => el.getClientRects().length && !el.closest('[hidden]'));
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
    event.preventDefault(); first.focus();
  }
});

/* ---------- 自定义下拉选择 ---------- */
UI.select = function (mount, opts = {}) {
  if (typeof mount === 'string') mount = document.querySelector(mount);
  if (!mount) return null;
  const norm = (option) => typeof option === 'string' ? { v: option, t: option } : option;
  let options = (opts.options || []).map(norm);
  let value = opts.value != null ? String(opts.value) : (options.length ? String(options[0].v) : '');
  mount.innerHTML = '<input type="hidden"' + (opts.name ? ' name="' + U.esc(opts.name) + '"' : '') + '>' +
    '<button type="button" class="xsel" aria-haspopup="listbox" aria-expanded="false" aria-label="' +
    U.esc(opts.label || opts.placeholder || '选择选项') + '"><span class="xsel-t"></span>' + UI.icon('chev-down', 13) + '</button>';
  const trigger = mount.querySelector('button');
  const render = () => {
    mount.querySelector('input').value = value;
    const current = options.find((option) => String(option.v) === value);
    trigger.querySelector('.xsel-t').textContent = current ? current.t : opts.placeholder || '请选择';
  };
  function openMenu(direction) {
    const pop = UI.openPop(trigger, '<div class="xmenu" role="listbox" aria-label="' +
      U.esc(trigger.getAttribute('aria-label')) + '">' + options.map((option) => {
      const on = String(option.v) === value;
      return '<div class="xitem' + (on ? ' on' : '') + '" role="option" aria-selected="' + on + '" tabindex="-1" data-v="' + U.esc(option.v) + '">' +
        '<span class="xitem-t">' + U.esc(option.t) + '</span>' + (on ? UI.icon('check', 13) : '') + '</div>';
    }).join('') + '</div>', { align: opts.align });
    const items = [...pop.querySelectorAll('.xitem')];
    let index = options.findIndex((option) => String(option.v) === value);
    if (index < 0) index = direction === -1 ? items.length - 1 : 0;
    const focus = (next) => {
      if (!items.length) return;
      index = (next + items.length) % items.length;
      items[index].focus(); items[index].scrollIntoView({ block: 'nearest' });
    };
    items.forEach((item) => item.onclick = () => {
      value = item.dataset.v; render(); UI.closePop(true);
      mount.dispatchEvent(new Event('change', { bubbles: true }));
      if (opts.onChange) opts.onChange(value);
    });
    pop.onkeydown = (event) => {
      if (event.key === 'Tab') { UI.closePop(true); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focus(index + (event.key === 'ArrowDown' ? 1 : -1)); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focus(event.key === 'Home' ? 0 : items.length - 1); }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (items[index]) items[index].click(); }
    };
    focus(index);
  }
  trigger.onclick = (event) => { event.stopPropagation(); if (trigger.getAttribute('aria-expanded') === 'true') UI.closePop(true); else openMenu(); };
  trigger.onkeydown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openMenu(event.key === 'ArrowUp' ? -1 : 1); }
  };
  render();
  return {
    get: () => value,
    set: (next) => { value = next == null ? '' : String(next); render(); },
    setOptions: (next) => {
      options = (next || []).map(norm);
      if (!options.some((option) => String(option.v) === value)) value = options.length ? String(options[0].v) : '';
      render();
    },
    el: mount,
  };
};

/* ---------- 自定义日历日期选择 ---------- */
UI.date = function (mount, opts) {
  opts = opts || {};
  if (typeof mount === 'string') mount = document.querySelector(mount);
  if (!mount) return null;
  let value = opts.value || '';
  const initD = value ? U.parseDate(value) : new Date();
  let vy = initD.getFullYear(), vm = initD.getMonth();
  let trigger = null;

  function syncHidden(v) {
    const h = mount.querySelector('input[type="hidden"]');
    if (h) h.value = v;
  }
  function renderTrigger() {
    if (!trigger) {
      mount.innerHTML = '<input type="hidden"' + (opts.name ? ' name="' + U.esc(opts.name) + '"' : '') + '>' +
        '<button type="button" class="xsel" aria-haspopup="dialog" aria-expanded="false" aria-label="' + U.esc(opts.label || opts.placeholder || '选择日期') +
        '"><span class="xsel-t"></span>' + UI.icon('calendar', 13) + '</button>';
      trigger = mount.querySelector('button');
      trigger.onclick = (event) => {
        event.stopPropagation();
        if (trigger.getAttribute('aria-expanded') === 'true') { UI.closePop(true); return; }
        if (value) { const date = U.parseDate(value); vy = date.getFullYear(); vm = date.getMonth(); }
        openCal();
      };
    }
    mount.querySelector('input').value = value;
    trigger.querySelector('.xsel-t').textContent = value || opts.placeholder || '选择日期';
    trigger.querySelector('.xsel-t').classList.toggle('ph', !value);
  }
  function dayHtml() {
    const base = new Date(vy, vm, 1);
    base.setDate(base.getDate() - (base.getDay() + 6) % 7); /* 周一对齐 */
    let html = '';
    const today = U.today();
    for (let i = 0; i < 42; i++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      const ds = U.fmtDate(dt);
      const dim = dt.getMonth() !== vm;
      const cls = 'xday' + (dim ? ' dim' : '') + (ds === today ? ' today' : '') + (ds === value ? ' on' : '');
      html += '<button type="button" class="' + cls.trim() + '" data-d="' + ds + '">' + dt.getDate() + '</button>';
    }
    return html;
  }
  function openCal() {
    const title = vy + ' 年 ' + (vm + 1) + ' 月';
    const pop = UI.openPop(trigger,
      '<div class="xcal" role="dialog" aria-label="选择日期">' +
        '<div class="xcal-head">' +
          '<button type="button" class="xcal-nav" data-nav="-1" title="上个月">' + UI.icon('chev-left', 14) + '</button>' +
          '<div class="xcal-title">' + U.esc(title) + '</div>' +
          '<button type="button" class="xcal-nav" data-nav="1" title="下个月">' + UI.icon('chev-right', 14) + '</button>' +
        '</div>' +
        '<div class="xcal-quick">' +
          '<button type="button" class="btn btn-sm" data-q="today">今天</button>' +
          (opts.allowClear === false ? '' : '<button type="button" class="btn btn-sm btn-ghost" data-q="clear">清除</button>') +
        '</div>' +
        '<div class="xcal-week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
        '<div class="xcal-grid">' + dayHtml() + '</div>' +
      '</div>',
      { align: opts.align });
    pop.querySelectorAll('[data-nav]').forEach(function (b) {
      b.addEventListener('click', function () {
        vm += Number(b.dataset.nav);
        if (vm < 0) { vm = 11; vy--; } else if (vm > 11) { vm = 0; vy++; }
        UI.closePop();
        openCal();
      });
    });
    const todayBtn = pop.querySelector('[data-q="today"]');
    if (todayBtn) todayBtn.addEventListener('click', function () { pick(U.today()); });
    const clearBtn = pop.querySelector('[data-q="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      value = '';
      renderTrigger();
      syncHidden('');
      UI.closePop();
      mount.dispatchEvent(new Event('change', { bubbles: true }));
      if (opts.onChange) opts.onChange('');
    });
    pop.querySelectorAll('.xday').forEach(function (b) {
      b.addEventListener('click', function () { pick(b.dataset.d); });
    });
    function pick(ds) {
      value = ds;
      renderTrigger();
      syncHidden(ds);
      UI.closePop();
      mount.dispatchEvent(new Event('change', { bubbles: true }));
      if (opts.onChange) opts.onChange(ds);
    }
  }
  renderTrigger();
  return {
    get: function () { return value; },
    set: function (v) { value = v || ''; if (value) { const d = U.parseDate(value); vy = d.getFullYear(); vm = d.getMonth(); } renderTrigger(); syncHidden(value); },
    el: mount
  };
};

/* 统计页共用的快捷时间与自定义日期范围。 */
UI.dateRange = function (mount, opts) {
  const value = opts.value;
  const range = U.rangeFor(value);
  const presets = [
    { v: 'today', t: '本日' }, { v: 'week', t: '本周' }, { v: 'month', t: '本月' },
    { v: 'year', t: '本年' }, { v: 'all', t: '全部' }
  ];
  mount.classList.add('filter-bar', 'date-range-filter');
  mount.setAttribute('role', 'group');
  mount.setAttribute('aria-label', opts.label);
  mount.innerHTML = '<div class="seg" role="group" aria-label="快捷时间">' + presets.map(function (p) {
    const selected = p.v === value.preset;
    return '<button type="button" class="seg-btn' + (selected ? ' on' : '') + '" data-range="' + p.v +
      '" aria-pressed="' + selected + '">' + p.t + '</button>';
  }).join('') + '</div><div class="date-range-fields"><span class="xmount" data-date="from"></span>' +
    '<span class="ledger-hint">至</span><span class="xmount" data-date="to"></span></div>';
  mount.querySelectorAll('[data-range]').forEach(function (button) {
    button.addEventListener('click', function () { opts.onChange({ preset: button.dataset.range }); });
  });
  const dates = {};
  ['from', 'to'].forEach(function (key) {
    const label = key === 'from' ? '开始日期' : '结束日期';
    dates[key] = UI.date(mount.querySelector('[data-date="' + key + '"]'), {
      value: range[key], placeholder: label, label: label,
      onChange: function (date) {
        const next = Object.assign({ preset: 'custom' }, range, { [key]: date });
        if (next.from && next.to && next.from > next.to) {
          dates[key].set(range[key]);
          UI.toast('开始日期不能晚于结束日期', 'err');
          return;
        }
        opts.onChange(next);
      }
    });
  });
};
