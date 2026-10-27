'use strict';
/* 目标编辑与角色养成、手动进度弹窗。 */
Views.goalModal = function (goal) {
  if (!D.state.characters.length) { UI.toast('请先创建角色', 'err'); Views.go('characters'); return; }
  const values = goal ? { ...goal, title: goal.title === D.goalDefaultTitle(goal) ? '' : goal.title,
    source: goal.tracking ? 'character' : 'manual',
    category: goal.tracking?.category || 'auxiliarySkills', metricKey: goal.tracking?.key || '强身术' } : {
    characterId: D.charFilter, type: 'progress', source: 'character', category: 'auxiliarySkills', metricKey: '强身术',
    title: '', target: 120, unit: '级', deadline: '', note: '',
  };
  let savedId = goal?.id;
  UI.formModal({
    title: goal ? '编辑目标' : '新建目标', wide: true, values,
    returnFocus: () => Views.goalFocusTarget(savedId),
    fields: [
      { key: 'type', label: '目标类型', type: 'select', options: D.goalTypes },
      { key: 'characterId', label: '适用角色', type: 'select', options: [{ v: 'all', t: '全部角色' },
        ...D.orderedCharacters().map((character) => ({ v: character.id, t: character.name }))] },
      { key: 'source', label: '进度来源', type: 'select', options: [{ v: 'character', t: '跟随角色档案' }, { v: 'manual', t: '手动累计' }] },
      { key: 'category', label: '养成分类', type: 'select', options: D.goalMetrics },
      { key: 'metricKey', label: '具体项目', type: 'select', options: D.goalMetricOptions(values.category, values.characterId) },
      { key: 'target', label: '目标数值', type: 'number', required: true, min: 0, step: '1' },
      { key: 'unit', label: '单位', type: 'text', placeholder: '如：万、元、级、个' },
      { key: 'deadline', label: '期望完成日期', type: 'date', hint: '选填' },
      { key: 'title', label: '目标名称', type: 'text', full: true, hint: '留空自动生成，也可以自己命名' },
      { key: 'note', label: '备注', type: 'textarea', full: true, placeholder: '选填' },
    ],
    onRender: (form, api, overlay) => {
      overlay.classList.add('goal-modal');
      const preview = document.createElement('div');
      preview.className = 'goal-form-preview full'; preview.setAttribute('aria-live', 'polite');
      form.querySelector('[data-field="title"]').before(preview);
      let signature = '', mode = '';
      const update = () => {
        const type = api.getVal('type'), source = api.getVal('source'), category = api.getVal('category');
        const automatic = type === 'progress' && source === 'character';
        const nextSignature = category + ':' + api.getVal('characterId');
        if (nextSignature !== signature) {
          const options = D.goalMetricOptions(category, api.getVal('characterId'));
          const selected = api.getVal('metricKey');
          if (goal?.tracking?.category === category && goal.tracking.key && !options.some((item) => item.v === goal.tracking.key)) {
            options.push({ v: goal.tracking.key, t: goal.tracking.key });
          }
          api.setOptions('metricKey', options.length ? options : [{ v: '', t: '请先在角色档案中添加技能' }]);
          api.setVal('metricKey', options.some((item) => item.v === selected) ? selected : options[0]?.v || '');
          signature = nextSignature;
        }
        api.show('source', type === 'progress'); api.show('category', automatic); api.show('unit', !automatic);
        const metric = D.growthCategory(category);
        api.show('metricKey', automatic && ['skills', 'training'].includes(metric.kind));
        const nextMode = automatic ? category : type;
        if (automatic || mode && nextMode !== mode) api.setVal('unit', automatic ? metric.unit : type === 'progress' ? '级' : '万');
        mode = nextMode;
        form.querySelector('[name="target"]').step = automatic ? '1' : '0.1';
        form.querySelector('[data-field="target"] label').textContent = automatic ? '每个角色的目标' : '累计目标数值';
        const draft = { characterId: api.getVal('characterId'), type, target: api.getVal('target'), unit: api.getVal('unit'),
          tracking: automatic ? { category, key: api.getVal('metricKey') } : null };
        form.querySelector('[name="title"]').placeholder = D.goalDefaultTitle(draft);
        const summary = automatic ? D.goalSummary(draft) : null;
        preview.textContent = automatic ? '每个角色分别达到 ' + (draft.target || '—') + draft.unit + ' · 当前 ' + summary.achieved +
          ' / ' + summary.members.length + ' 个已达标' + (summary.unknown ? '，' + summary.unknown + ' 个待补录' : '') +
          '。保存角色档案后自动更新。' : '由适用角色共同累计到 ' + (draft.target || '—') + draft.unit + '，通过「记进度」记录每次变化。';
        if (draft.characterId === 'all') preview.textContent += ' 全部角色包含后续新增角色。';
        if (automatic && goal?.logs.length) preview.textContent += ' 原手动进度保留，跟随模式不累计手动记录。';
      };
      form.addEventListener('change', update); form.addEventListener('input', update); update();
    },
    onSubmit: async (data) => {
      const saved = await D.saveGoal({ ...data, tracking: data.type === 'progress' && data.source === 'character' ?
        { category: data.category, key: data.metricKey } : null }, goal?.id);
      savedId = saved.id;
      if (!goal) Object.assign(Views._goalFilter, { status: D.goalSummary(saved).status, type: '', keyword: '' });
      Views.goalRefresh(); UI.toast(goal ? '目标已保存' : '目标已创建');
    },
  });
};

Views.goalGrowthModal = function (goal) {
  const members = D.goalSummary(goal).members;
  UI.formModal({
    title: '更新养成 · ' + D.goalMetricLabel(goal.tracking), wide: true,
    returnFocus: () => Views.goalFocusTarget(goal.id, 'progress'),
    values: Object.fromEntries(members.map((member, index) => ['member' + index, member.value])),
    fields: [
      ...members.map((member, index) => ({ key: 'member' + index, label: member.name, type: 'number', min: 0, step: '1',
        placeholder: '未记录', hint: '目标 ' + goal.target + goal.unit + (member.done ? ' · 已达标' : '') })),
      { key: 'date', label: '变更日期', type: 'date', required: true, default: U.today() },
      { key: 'note', label: '本次说明', type: 'text', placeholder: '选填，如：周末统一补强身' },
    ],
    onRender: (form, api, overlay) => {
      overlay.classList.add('goal-modal');
      const hint = document.createElement('p'); hint.className = 'goal-form-preview full';
      hint.textContent = '填写角色当前的实际等级或数量，一次保存到角色档案，并同步生成养成记录。留空表示未记录。';
      form.prepend(hint);
    },
    onSubmit: async (data) => {
      const count = await D.saveGoalGrowth(goal.id, Object.fromEntries(members.map((member, index) => [member.id, data['member' + index]])),
        { date: data.date, note: data.note });
      const current = D.state.goals.find((item) => item.id === goal.id);
      UI.toast('已更新 ' + count + ' 个角色' + (D.goalSummary(current).status === 'done' ? '，目标已达成' : ''));
      Views.goalRefresh();
    },
  });
};

Views.goalProgressModal = function (goal, log) {
  UI.formModal({
    title: (log ? '编辑进度 · ' : '记进度 · ') + goal.title, values: log || {}, submitText: '记入',
    returnFocus: () => Views.goalFocusTarget(goal.id, 'progress'),
    fields: [
      { key: 'date', label: '日期', type: 'date', required: true, default: U.today() },
      { key: 'delta', label: '进度变化', type: 'number', required: true, step: '0.1', placeholder: '单位：' + (goal.unit || '万'),
        hint: '正数增加、负数减少；当前进度最低为 0' },
      { key: 'note', label: '备注', type: 'text', full: true, placeholder: '如：本月捉鬼净收益' },
    ],
    onSubmit: async (data) => {
      await D.saveGoalProgress(goal.id, data, log?.id); UI.toast('进度已更新'); Views.goalRefresh();
    },
  });
};
