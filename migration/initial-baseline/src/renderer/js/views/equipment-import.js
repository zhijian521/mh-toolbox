'use strict';
/* 截图只在弹窗内存中处理；草稿核对后一次写入装备档案。 */
Views.eqImportModal = function (context = {}) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); return; }
  let characterId = context.characterId || Views._eq.characterId;
  if (!D.charById(characterId)) characterId = D.state.characters[0].id;
  let target = String(context.index == null ? D.equipmentProfile(characterId).viewedEquipmentSet : context.index);
  const queue = [];
  let selected = '', active = null, closed = false, processing = false, loading = 0;
  let ingestion = Promise.resolve();
  const limits = D.equipmentImportLimits;
  const overlay = UI.openModal({
    title: '截图录入装备', wide: true,
    body: '<div class="eq-import-settings"><div class="frow"><label>角色</label><div data-import-character></div></div>' +
      '<div class="frow"><label>保存到</label><div data-import-target></div></div><p class="eq-import-hint">仅填入空位，已有装备保留</p></div>' +
      '<div class="eq-import-drop"><div><span data-import-instruction>每张截图包含一件装备属性</span>' +
      '<span class="eq-import-hint">支持 Ctrl+V 粘贴、拖入多张图片</span></div><div class="eq-actions">' +
      '<button class="btn btn-gold" data-act="paste">粘贴截图</button><button class="btn" data-act="files">选择图片</button></div></div>' +
      '<input type="file" data-import-files accept="image/png,image/jpeg,image/webp,image/bmp,.bmp" multiple hidden>' +
      '<div class="eq-import-workspace" hidden><nav class="eq-import-queue" aria-label="截图列表"></nav>' +
      '<div class="eq-import-selected"></div></div>',
    footer: '<span class="eq-import-summary" role="status" aria-live="polite">本地识别，图片不会上传</span>' +
      '<button class="btn" data-act="cancel">取消</button><button class="btn btn-gold" data-act="save" disabled>保存</button>',
    onClose: () => {
      closed = true;
      document.removeEventListener('paste', onPaste);
      unsubscribe();
      if (active) window.mh.cancelEquipmentOcr(active.requestId).catch(() => {});
    },
  });
  overlay.classList.add('eq-import-modal');
  overlay._isDirty = () => queue.length > 0 || loading > 0;
  const find = (selector) => overlay.querySelector(selector);
  const saveButton = find('[data-act="save"]');
  const summary = find('.eq-import-summary');
  const queueRoot = find('.eq-import-queue');
  const selectedRoot = find('.eq-import-selected');
  const targetOptions = () => D.equipmentProfile(characterId).equipmentSets.map((set, index) => ({ v: String(index), t: set.name + ' · 补齐空位' }))
    .concat({ v: '', t: '仅存入仓库' });
  const targetSelect = UI.select(find('[data-import-target]'), { label: '保存到', value: target, options: targetOptions(),
    onChange: (value) => { target = value; updateSummary(); } });
  UI.select(find('[data-import-character]'), { label: '角色', value: characterId,
    options: D.orderedCharacters().map((character) => ({ v: character.id, t: character.name })),
    onChange: (value) => {
      characterId = value;
      targetSelect.setOptions(targetOptions());
      if (target !== '') targetSelect.set(String(D.equipmentProfile(characterId).viewedEquipmentSet));
      target = targetSelect.get(); renderQueue(); updateSummary();
    },
  });
  const unsubscribe = window.mh.onEquipmentOcrProgress(({ id, progress }) => {
    if (closed || !active || active.requestId !== id) return;
    active.progress = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    updateSummary();
  });

  function busy(item) { return item.status === 'queued' || item.status === 'running'; }
  function issue(item) { return item.numberError || D.equipmentImportError(item.draft, characterId); }
  function updateSummary() {
    if (closed) return;
    const pending = queue.filter(busy).length;
    const incomplete = queue.filter((item) => !busy(item) && issue(item)).length;
    saveButton.disabled = !queue.length || loading > 0 || pending > 0 || incomplete > 0 || overlay._saving;
    saveButton.textContent = overlay._saving ? '保存中…' : queue.length ? '保存 ' + queue.length + ' 件' : '保存';
    summary.textContent = loading ? '正在读取图片…' : pending ? '识别中 ' + (active ? active.progress || 0 : 0) + '% · 剩余 ' + pending + ' 张'
      : incomplete ? queue.length + ' 件装备 · ' + incomplete + ' 件待补充'
      : queue.length ? queue.length + ' 件可保存 · 请核对名称和数值' : '本地识别，图片不会上传';
    const message = selectedRoot.querySelector('[data-import-error]');
    const item = queue.find((entry) => entry.id === selected);
    if (message && item && !busy(item)) message.textContent = issue(item) || (item.error ? '可手动补全后保存，或重新识别' : '');
  }

  function renderQueue() {
    overlay.classList.toggle('has-images', queue.length > 0);
    find('.eq-import-workspace').hidden = !queue.length;
    find('[data-import-instruction]').textContent = queue.length ? '继续粘贴或拖入截图' : '每张截图包含一件装备属性';
    queueRoot.innerHTML = queue.map((item, index) => {
      const status = busy(item) ? (item.status === 'running' ? '识别中…' : '等待识别')
        : item.error ? (item.error.startsWith('未识别到文字') ? '未识别到文字' : '识别失败') : issue(item) ? '待补充' : '已识别';
      return '<div class="eq-import-entry' + (item.id === selected ? ' on' : '') + '"><button class="eq-import-pick" data-import-pick="' + item.id +
        '" aria-current="' + (item.id === selected) + '"><img src="' + item.image + '" alt=""><span>' +
        U.esc(item.draft && item.draft.name || '截图 ' + (index + 1)) + '</span><small>' + status + '</small></button>' +
        '<button class="eq-import-remove" data-import-remove="' + item.id + '" title="移除截图 ' + (index + 1) + '" aria-label="移除截图 ' + (index + 1) + '">×</button></div>';
    }).join('');
    queueRoot.querySelectorAll('[data-import-pick]').forEach((button) => {
      button.onclick = () => { if (overlay._saving) return; selected = button.dataset.importPick; renderQueue(); renderSelected(); };
    });
    queueRoot.querySelectorAll('[data-import-remove]').forEach((button) => {
      button.onclick = () => {
        if (overlay._saving) return;
        const index = queue.findIndex((item) => item.id === button.dataset.importRemove);
        const item = queue[index];
        if (active === item) window.mh.cancelEquipmentOcr(item.requestId).catch(() => {});
        queue.splice(index, 1);
        if (selected === item.id) selected = (queue[index] || queue[index - 1] || {}).id || '';
        renderQueue(); renderSelected(); updateSummary();
      };
    });
  }

  function renderSelected() {
    UI.closePop();
    const item = queue.find((entry) => entry.id === selected);
    if (!item) { selectedRoot.replaceChildren(); return; }
    const draft = item.draft;
    selectedRoot.innerHTML = '<section class="eq-import-preview"><div class="eq-import-image"><img src="' + item.image +
      '" alt="装备截图原图" draggable="false"><span class="eq-import-crop-box" hidden></span></div><div class="eq-import-image-actions">' +
      '<button class="btn btn-sm" data-act="crop">裁剪重识别</button><button class="btn btn-sm" data-act="retry">重新识别</button>' +
      '<button class="btn btn-sm btn-gold" data-act="apply-crop" hidden disabled>识别选区</button>' +
      '<button class="btn btn-sm" data-act="cancel-crop" hidden>取消裁剪</button></div><p class="eq-import-hint" data-import-caption>' +
      (busy(item) ? '正在本地识别，请稍候…' : U.esc(item.error ||
        (item.confidence < 85 ? '部分文字不确定，请对照原图核对' : '对照原图核对数值；可直接修改右侧内容'))) + '</p></section>' +
      '<section class="eq-import-fields">' + (draft ? '<form class="form-grid" novalidate>' +
        [{ key: 'name', label: '装备名称', required: true, full: true },
          { key: 'slot', label: '部位', type: 'select', options: [{ v: '', t: '请选择部位' }].concat(D.slots.filter((slot) => slot !== '其他')), required: true },
          { key: 'level', label: '等级（可选）', type: 'number', min: 0, step: '1' },
        ].map((field) => UI.fieldHtml(field, draft[field.key])).join('') + '<div class="eq-editor-mount full"></div>' +
        '<p class="eq-import-error full" data-import-error role="status"></p>' +
        '<details class="eq-import-more full"><summary>备注与识别原文</summary>' +
        UI.fieldHtml({ key: 'note', label: '备注', type: 'textarea' }, draft.note) +
        '<pre>' + U.esc(draft.ocrText || '未识别到文字，可手动填写') + '</pre></details></form>' :
        '<div class="eq-import-wait">正在识别这张截图…<span>完成后可在这里核对装备信息</span></div>') + '</section>';
    find('[data-act="retry"]').disabled = busy(item);
    find('[data-act="crop"]').disabled = busy(item);
    find('[data-act="retry"]').onclick = () => requeue(item);
    setupCrop(item);
    if (draft) {
      let form = selectedRoot.querySelector('form');
      if (item.form) {
        form.replaceWith(item.form); form = item.form;
      } else {
      item.form = form;
      form.onsubmit = (event) => event.preventDefault();
      UI.select(form.querySelector('[data-xmount="slot"]'), { label: '部位', value: draft.slot,
        options: [{ v: '', t: '请选择部位' }].concat(D.slots.filter((slot) => slot !== '其他')),
        onChange: (value) => { draft.slot = value; showFields(); renderQueue(); updateSummary(); } });
      const mount = form.querySelector('.eq-editor-mount');
      if (item.editor) mount.replaceWith(item.editorMount);
      else {
        item.editorMount = mount;
        item.editor = UI.equipmentEditor(mount, { slot: draft.slot, equipment: D.equipmentImportRecord(draft, characterId),
          onChange: (details) => { draft.details = details; item.numberError = numberError(); renderQueue(); updateSummary(); } });
      }
      const editor = item.editor;
      const numberError = () => editor.error() || (!D.isJade(draft.slot) && !form.querySelector('[name="level"]').validity.valid ? '请检查装备等级' : '');
      const capture = (event) => {
        const input = event.target;
        if (!['name', 'level', 'note'].includes(input.name)) return;
        draft[input.name] = input.type === 'number' && input.value !== '' ? Number(input.value) : input.value;
        item.numberError = numberError();
        if (input.name === 'name') renderQueue();
        updateSummary();
      };
      form.addEventListener('input', capture); form.addEventListener('change', capture);
      function showFields() {
        const jade = D.isJade(draft.slot);
        form.querySelector('[data-field="level"]').hidden = jade;
        editor.setSlot(draft.slot);
        draft.details = editor.read(); item.numberError = numberError();
      }
      showFields();
      }
      if (busy(item)) {
        if (!item.disabledControls) item.disabledControls = [...form.querySelectorAll('input,textarea,button')].map((input) => [input, input.disabled]);
        item.disabledControls.forEach(([input]) => { input.disabled = true; });
      } else if (item.disabledControls) {
        item.disabledControls.forEach(([input, disabled]) => { input.disabled = disabled; }); item.disabledControls = null;
      }
    }
    updateSummary();
  }

  function setupCrop(item) {
    const preview = selectedRoot.querySelector('.eq-import-image');
    const image = preview.querySelector('img');
    const box = preview.querySelector('.eq-import-crop-box');
    const apply = find('[data-act="apply-crop"]');
    let start = null, rectangle = null;
    const point = (event) => {
      const bounds = image.getBoundingClientRect();
      return { x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
        y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)) };
    };
    find('[data-act="crop"]').onclick = () => {
      image.src = item.original;
      preview.classList.add('is-cropping');
      ['crop', 'retry'].forEach((action) => { find('[data-act="' + action + '"]').hidden = true; });
      apply.hidden = false; find('[data-act="cancel-crop"]').hidden = false;
      find('[data-import-caption]').textContent = '在图上拖出装备属性范围，再点「识别选区」';
    };
    preview.onpointerdown = (event) => {
      if (!preview.classList.contains('is-cropping') || event.button !== 0) return;
      event.preventDefault(); start = point(event); rectangle = null; box.hidden = true; apply.disabled = true;
      preview.setPointerCapture(event.pointerId);
    };
    preview.onpointermove = (event) => {
      if (!start) return;
      const end = point(event);
      rectangle = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
      box.hidden = false;
      Object.assign(box.style, { left: rectangle.x + image.offsetLeft + 'px', top: rectangle.y + image.offsetTop + 'px',
        width: rectangle.width + 'px', height: rectangle.height + 'px' });
      apply.disabled = rectangle.width < 16 || rectangle.height < 16;
    };
    preview.onpointerup = preview.onpointercancel = () => { start = null; };
    find('[data-act="cancel-crop"]').onclick = renderSelected;
    apply.onclick = () => {
      if (!rectangle || apply.disabled || !image.complete || !image.naturalWidth) return;
      const scale = image.naturalWidth / image.clientWidth;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(rectangle.width * scale); canvas.height = Math.round(rectangle.height * scale);
      canvas.getContext('2d').drawImage(image, rectangle.x * scale, rectangle.y * scale, rectangle.width * scale,
        rectangle.height * scale, 0, 0, canvas.width, canvas.height);
      item.image = canvas.toDataURL('image/png'); requeue(item);
    };
  }

  function requeue(item) {
    item.status = 'queued'; item.error = ''; item.progress = 0;
    renderQueue(); renderSelected(); updateSummary(); pump();
  }

  async function pump() {
    if (processing || closed) return;
    processing = true;
    try {
      for (let item; !closed && (item = queue.find((entry) => entry.status === 'queued'));) {
        active = item; item.status = 'running'; item.requestId = 'equipment-' + U.uid();
        renderQueue(); if (selected === item.id) renderSelected(); updateSummary();
        let result;
        try { result = await window.mh.recognizeEquipment(item.image, item.requestId); }
        catch (error) { result = { ok: false, error: '识别未完成，可重新识别或手动补全' }; }
        if (result.ok && !result.text.trim()) result = { ok: false, error: '未识别到文字，请裁剪到装备文字区域后重试' };
        active = null;
        if (closed) return;
        if (!queue.includes(item)) continue;
        item.status = result.ok ? 'ready' : 'error'; item.error = result.error || ''; item.confidence = result.confidence;
        if (result.ok || !item.draft) {
          item.form = null; item.editor = null; item.editorMount = null; item.disabledControls = null; item.numberError = '';
          item.draft = D.parseEquipmentText(result.text || '');
          if (!item.draft.slot && context.slot) item.draft.slot = context.slot;
        }
        renderQueue(); if (selected === item.id) renderSelected(); updateSummary();
      }
    } finally { processing = false; }
  }

  async function addImage(dataUrl) {
    if (closed) return;
    if (queue.length >= limits.count) throw new Error('每批最多 30 张截图，请先保存当前装备');
    if (dataUrl.length > limits.bytes * 1.4) throw new Error('单张图片不超过 16 MB');
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('无法读取图片，请重新截图')); image.src = dataUrl; });
    if (closed) return;
    if (image.naturalWidth * image.naturalHeight > limits.pixels) throw new Error('图片尺寸过大，请截取单件装备属性');
    if (image.naturalWidth < 16 || image.naturalHeight < 16) throw new Error('图片过小，请重新截取装备属性');
    if (!/^data:image\/(?:png|jpeg);base64,/.test(dataUrl)) {
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0); dataUrl = canvas.toDataURL('image/png');
    }
    if (dataUrl.length > limits.bytes * 1.4) throw new Error('转换后的图片过大，请先截取装备属性区域');
    if (queue.some((item) => item.original === dataUrl)) { UI.toast('这张截图已在列表中'); return; }
    const item = { id: U.uid(), original: dataUrl, image: dataUrl, status: 'queued', draft: null, error: '' };
    queue.push(item); if (!selected) selected = item.id;
    renderQueue(); if (selected === item.id) renderSelected(); updateSummary(); pump();
  }

  function ingest(sources) {
    if (closed || overlay._saving) return;
    loading++; updateSummary();
    ingestion = ingestion.then(async () => {
      for (const source of sources) {
        if (closed) break;
        try {
          if (typeof source === 'string') { await addImage(source); continue; }
          if (!/^(image\/(png|jpeg|webp|bmp|x-ms-bmp))$/.test(source.type) && !/\.(png|jpe?g|webp|bmp)$/i.test(source.name)) throw new Error('请选择 PNG、JPG、WebP 或 BMP 图片');
          if (source.size > limits.bytes) throw new Error('单张图片不超过 16 MB');
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('图片读取失败，请重试')); reader.readAsDataURL(source);
          });
          await addImage(dataUrl);
        } catch (error) { if (!closed) UI.toast(error.message, 'err'); }
      }
    }).finally(() => { loading--; updateSummary(); });
  }

  function onPaste(event) {
    const files = [...(event.clipboardData && event.clipboardData.files || [])].filter((file) => file.type.startsWith('image/'));
    if (!files.length || closed || overlay._saving) return;
    event.preventDefault(); ingest(files);
  }
  document.addEventListener('paste', onPaste);
  find('[data-act="paste"]').onclick = async () => {
    try {
      const image = await window.mh.equipmentClipboard();
      if (closed) return;
      if (image) ingest([image]); else UI.toast('剪贴板中没有图片，请先截图或复制图片', 'err');
    } catch (error) { if (!closed) UI.toast('无法读取截图，请改用选择图片或拖入', 'err'); }
  };
  find('[data-act="files"]').onclick = () => find('[data-import-files]').click();
  find('[data-import-files]').onchange = (event) => { ingest([...event.target.files]); event.target.value = ''; };
  overlay.ondragover = (event) => { event.preventDefault(); if (!overlay._saving) overlay.classList.add('is-dragging'); };
  overlay.ondragleave = (event) => { if (!overlay.contains(event.relatedTarget)) overlay.classList.remove('is-dragging'); };
  overlay.ondrop = (event) => { event.preventDefault(); overlay.classList.remove('is-dragging'); ingest([...event.dataTransfer.files]); };
  find('[data-act="cancel"]').onclick = UI.requestCloseModal;
  saveButton.onclick = async () => {
    if (saveButton.disabled || closed || !UI.validateNumberInputs(selectedRoot)) return;
    overlay._saving = true; UI.closePop(); updateSummary();
    const controls = [...overlay.querySelectorAll('input,textarea,button')].map((input) => [input, input.disabled]);
    controls.forEach(([input]) => { input.disabled = true; });
    try {
      const result = await D.importEquipment(queue.map((item) => structuredClone(item.draft)), { characterId, index: target === '' ? null : Number(target) });
      Views._eq.characterId = characterId;
      UI.closeModal();
      if (Views._current === 'equipment') Views.equipment();
      UI.toast('已新增 ' + result.created + ' 件' + (result.reused ? '，复用 ' + result.reused + ' 件' : '') +
        (result.equipped ? '，填入 ' + result.equipped + ' 个空位' : '') + (result.stored ? '，其余保留在仓库' : ''));
    } catch (error) {
      overlay._saving = false;
      controls.forEach(([input, disabled]) => { input.disabled = disabled; });
      updateSummary(); UI.toast(error.message || '保存失败，请重试', 'err');
    }
  };
};
