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
  if (UI.closePop) UI.closePop();
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
      return '<div class="frow full" data-field="' + f.key + '"><div class="check-line"><input type="checkbox" name="' + f.key + '"' + (v ? ' checked' : '') + '> <span>' + U.esc(f.label) + (f.hint ? ' <span class="hint">' + U.esc(f.hint) + '</span>' : '') + '</span></div></div>';
    default: {
      const step = f.step ? ' step="' + f.step + '"' : '';
      const min = f.min != null ? ' min="' + f.min + '"' : '';
      inner = '<input type="' + (f.type || 'text') + '" name="' + f.key + '" value="' + U.esc(v) + '" placeholder="' + U.esc(f.placeholder || '') + '"' + step + min + '>';
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

  /* 自定义下拉 / 日期组件挂载（写入 form._xcomps 供 api 使用） */
  form._xcomps = {};
  fields.forEach(function (f) {
    if (f.type !== 'select' && f.type !== 'date') return;
    const m = form.querySelector('[data-xmount="' + f.key + '"]');
    if (!m) return;
    const h = m.querySelector('input[type="hidden"]');
    const initVal = h ? h.value : '';
    form._xcomps[f.key] = f.type === 'select'
      ? UI.select(m, { name: f.key, options: f.options, value: initVal, placeholder: f.placeholder })
      : UI.date(m, { name: f.key, value: initVal, placeholder: f.placeholder || '选择日期' });
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
      if (el) el.value = v;
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
    button.disabled = true;
    try {
      await opts.onSubmit(data);
      if (ov.isConnected) UI.closeModal();
    } catch (err) {
      UI.toast(err.message || '保存失败，请重试', 'err');
    } finally { button.disabled = false; }
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


/* 下拉 / 日历图标 */
Object.assign(UI.icons, {
  'chev-down': '<path d="M6 9l6 6 6-6"/>',
  'chev-left': '<path d="M15 6l-6 6 6 6"/>',
  'chev-right': '<path d="M9 6l6 6-6 6"/>',
  'calendar': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>'
});


/* ---------- 弹层基座（下拉菜单 / 日历共用） ---------- */
UI.closePop = function () {
  const old = document.querySelector('.xpop');
  if (old) old.remove();
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
  pop.innerHTML = contentHtml;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.visibility = 'hidden';
  requestAnimationFrame(function () {
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = opts.align === 'right' ? r.right - pw : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    let top = r.bottom + 4;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 4);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.visibility = '';
  });
  document.addEventListener('mousedown', UI._popOut, true);
  return pop;
};

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') UI.closePop();
});

/* ---------- 自定义下拉选择 ---------- */
UI.select = function (mount, opts) {
  opts = opts || {};
  if (typeof mount === 'string') mount = document.querySelector(mount);
  if (!mount) return null;
  const norm = function (o) { return typeof o === 'string' ? { v: o, t: o } : o; };
  let options = (opts.options || []).map(norm);
  let value = (opts.value != null && opts.value !== '') ? String(opts.value) : (options.length ? String(options[0].v) : '');
  let trigger = null;

  function curLabel() {
    const cur = options.find(function (o) { return String(o.v) === value; });
    return cur ? cur.t : (opts.placeholder || '请选择');
  }
  function syncHidden(v) {
    const h = mount.querySelector('input[type="hidden"]');
    if (h) h.value = v;
  }
  function renderTrigger() {
    mount.innerHTML = '<input type="hidden"' + (opts.name ? ' name="' + U.esc(opts.name) + '"' : '') + ' value="' + U.esc(value) + '">' +
      '<button type="button" class="xsel"><span class="xsel-t">' + U.esc(curLabel()) + '</span>' + UI.icon('chev-down', 13) + '</button>';
    trigger = mount.querySelector('button');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      openMenu();
    });
  }
  function openMenu() {
    const pop = UI.openPop(trigger,
      '<div class="xmenu">' + options.map(function (o) {
        const on = String(o.v) === value;
        return '<div class="xitem' + (on ? ' on' : '') + '" data-v="' + U.esc(o.v) + '">' +
          '<span class="xitem-t">' + U.esc(o.t) + '</span>' + (on ? UI.icon('check', 13) : '') + '</div>';
      }).join('') + '</div>',
      { align: opts.align });
    pop.querySelectorAll('.xitem').forEach(function (item) {
      item.addEventListener('click', function () {
        value = item.dataset.v;
        renderTrigger();
        syncHidden(value);
        UI.closePop();
        mount.dispatchEvent(new Event('change', { bubbles: true }));
        if (opts.onChange) opts.onChange(value);
      });
    });
    trigger.focus();
  }
  renderTrigger();
  return {
    get: function () { return value; },
    set: function (v) { value = (v == null ? '' : String(v)); renderTrigger(); syncHidden(value); },
    setOptions: function (newOptions) {
      options = (newOptions || []).map(norm);
      if (!options.some(function (o) { return String(o.v) === value; })) {
        value = options.length ? String(options[0].v) : '';
      }
      renderTrigger();
      syncHidden(value);
    },
    el: mount
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
    mount.innerHTML = '<input type="hidden"' + (opts.name ? ' name="' + U.esc(opts.name) + '"' : '') + ' value="' + U.esc(value) + '">' +
      '<button type="button" class="xsel"><span class="xsel-t' + (value ? '' : ' ph') + '">' + U.esc(value || opts.placeholder || '选择日期') + '</span>' + UI.icon('calendar', 13) + '</button>';
    trigger = mount.querySelector('button');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (value) { const d = U.parseDate(value); vy = d.getFullYear(); vm = d.getMonth(); }
      openCal();
    });
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
      '<div class="xcal">' +
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
