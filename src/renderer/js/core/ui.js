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
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
};

UI.openModal = function (opts) {
  const root = document.getElementById('modal-root');
  root.innerHTML =
    '<div class="modal-overlay">' +
      '<div class="modal' + (opts.wide ? ' wide' : '') + '">' +
        '<div class="modal-head"><h3>' + U.esc(opts.title) + '</h3>' +
        '<button class="modal-x" title="关闭">✕</button></div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>' +
    '</div>';
  const overlay = root.querySelector('.modal-overlay');
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) UI.closeModal(); });
  root.querySelector('.modal-x').addEventListener('click', UI.closeModal);
  return overlay;
};

UI.confirmModal = function (opts) {
  return new Promise(function (resolve) {
    const ov = UI.openModal({
      title: opts.title || '确认操作',
      body: '<p style="line-height:1.7">' + U.esc(opts.message || '确定要执行该操作吗？') + '</p>',
      footer:
        '<button class="btn" data-act="no">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-gold') + '" data-act="yes">' + U.esc(opts.confirmText || '确定') + '</button>'
    });
    ov.querySelector('[data-act="no"]').addEventListener('click', function () { UI.closeModal(); resolve(false); });
    ov.querySelector('[data-act="yes"]').addEventListener('click', function () { UI.closeModal(); resolve(true); });
  });
};

/* ---------- 表单弹窗 ---------- */
UI.fieldHtml = function (f, val) {
  const v = val != null && val !== '' ? val : (f.default != null ? f.default : '');
  const req = f.required ? ' req' : '';
  let inner = '';
  switch (f.type) {
    case 'select':
      inner = '<select name="' + f.key + '">' +
        f.options.map(function (o) {
          const ov = typeof o === 'string' ? { v: o, t: o } : o;
          return '<option value="' + U.esc(ov.v) + '"' + (String(ov.v) === String(v) ? ' selected' : '') + '>' + U.esc(ov.t) + '</option>';
        }).join('') + '</select>';
      break;
    case 'textarea':
      inner = '<textarea name="' + f.key + '" placeholder="' + U.esc(f.placeholder || '') + '">' + U.esc(v) + '</textarea>';
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
      return '<div class="frow full"><div class="check-line"><input type="checkbox" name="' + f.key + '"' + (v ? ' checked' : '') + '> <span>' + U.esc(f.label) + (f.hint ? ' <span class="hint">' + U.esc(f.hint) + '</span>' : '') + '</span></div></div>';
    default: {
      const step = f.step ? ' step="' + f.step + '"' : '';
      const min = f.min != null ? ' min="' + f.min + '"' : '';
      inner = '<input type="' + (f.type || 'text') + '" name="' + f.key + '" value="' + U.esc(v) + '" placeholder="' + U.esc(f.placeholder || '') + '"' + step + min + '>';
    }
  }
  return '<div class="frow' + (f.full ? ' full' : '') + '">' +
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
    body: body,
    footer:
      '<button class="btn" data-act="cancel">取消</button>' +
      '<button class="btn btn-gold" data-act="ok">' + U.esc(opts.submitText || '保存') + '</button>'
  });
  const form = ov.querySelector('#mform');
  ov.querySelector('[data-act="cancel"]').addEventListener('click', UI.closeModal);

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

  const api = {
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
      if (el) el.value = v;
    },
    setOptions(key, options) {
      const sel = form.querySelector('select[name="' + key + '"]');
      if (!sel) return;
      const cur = api.getVal(key) || (typeof options[0] === 'string' ? options[0] : options[0].v);
      sel.innerHTML = options.map(function (o) {
        const ov = typeof o === 'string' ? { v: o, t: o } : o;
        return '<option value="' + U.esc(ov.v) + '"' + (String(ov.v) === String(cur) ? ' selected' : '') + '>' + U.esc(ov.t) + '</option>';
      }).join('');
    }
  };

  function submit() {
    const data = {};
    for (const f of fields) data[f.key] = api.getVal(f.key);
    for (const f of fields) {
      if (f.required && (data[f.key] === '' || data[f.key] == null)) {
        UI.toast('请填写「' + f.label + '」', 'err');
        const el = form.querySelector('[name="' + f.key + '"]');
        if (el) el.focus();
        return;
      }
    }
    UI.closeModal();
    opts.onSubmit(data);
  }

  ov.querySelector('[data-act="ok"]').addEventListener('click', submit);
  form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  if (opts.onRender) opts.onRender(form, api, ov);
  return api;
};

/* ---------- 细线性 SVG 图标库（规范见 STYLE_GUIDE.md 第 6 节） ---------- */
UI.icons = {
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  ledger: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sword: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  archive: '<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
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
