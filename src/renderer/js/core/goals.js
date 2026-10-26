'use strict';
/* 手动累计目标与跟随角色档案的养成目标。 */
Object.assign(D, {
  orderedGoals(goals = this.state.goals) {
    return this.orderedCards(goals);
  },

  saveGoalOrder(id, changes) {
    return this.commit(() => this.moveCard(this.state.goals, id, changes));
  },

  goalCharacters(goal) {
    return this.orderedCharacters().filter((character) => goal.characterId === 'all' || character.id === goal.characterId);
  },

  goalsFor(characterId = this.charFilter) {
    return this.state.goals.filter((goal) => characterId === 'all' || goal.characterId === 'all' || goal.characterId === characterId);
  },

  goalMetricOptions(category, characterId) {
    if (category === 'training') return this.characterTraining.map((field) => ({ v: field.key, t: field.label }));
    if (category === 'petTraining') return this.petTraining.map((field) => ({ v: field.key, t: field.label }));
    if (!['schoolSkills', 'auxiliarySkills'].includes(category)) return [];
    const characters = this.goalCharacters({ characterId });
    const names = category === 'auxiliarySkills' ? this.auxiliarySkillNames :
      characters.flatMap((character) => this.schoolSkillNames[character.school] || []);
    return [...new Set([...names, ...characters.flatMap((character) => character.progress[category].map((skill) => skill.name))])]
      .map((name) => ({ v: name, t: name }));
  },

  goalMetricLabel(tracking) {
    const metric = this.goalMetrics.find((item) => item.v === tracking.category);
    if (['training', 'petTraining'].includes(tracking.category)) {
      return this.goalMetricOptions(tracking.category).find((item) => item.v === tracking.key)?.t || '未知修炼';
    }
    return ['schoolSkills', 'auxiliarySkills'].includes(tracking.category) ? tracking.key : metric?.t || '未知项目';
  },

  goalCharacterValue(character, tracking) {
    const { category, key } = tracking;
    if (category === 'level') return this.characterNumber(character.level);
    const progress = character.progress;
    if (['schoolSkills', 'auxiliarySkills'].includes(category)) {
      return this.characterNumber(progress[category].find((skill) => skill.name === key)?.level);
    }
    return this.characterNumber(['training', 'petTraining'].includes(category) ? progress[category][key] : progress[category]);
  },

  /* 全体目标始终按完整成员计算；超额部分封顶，不能抵消其他角色的不足。 */
  goalSummary(goal) {
    if (!goal.tracking) {
      return { current: goal.current, target: goal.target, status: goal.status,
        pct: goal.target > 0 ? Math.min(100, Math.max(0, Math.round(goal.current / goal.target * 100))) : 0 };
    }
    const members = this.goalCharacters(goal).map((character) => {
      const value = this.goalCharacterValue(character, goal.tracking);
      return { id: character.id, name: character.name, value, done: value !== null && value >= goal.target,
        remaining: value === null ? null : Math.max(0, goal.target - value) };
    });
    const achieved = members.filter((member) => member.done).length;
    const unknown = members.filter((member) => member.value === null).length;
    const current = members.reduce((sum, member) => sum + Math.min(goal.target, member.value || 0), 0);
    const target = goal.target * members.length;
    const status = members.length > 0 && achieved === members.length ? 'done' : 'active';
    return { members, achieved, unknown, current, target, status,
      pct: target > 0 ? Math.min(status === 'done' ? 100 : 99, Math.round(current / target * 100)) : 0 };
  },

  goalDefaultTitle(goal) {
    const subject = goal.characterId === 'all' ? '全部角色' : this.charName(goal.characterId);
    return subject + ' · ' + (goal.tracking ? this.goalMetricLabel(goal.tracking) : this.goalTypeText(goal.type)) +
      '达到 ' + goal.target + goal.unit;
  },

  saveGoal(input, id) {
    return this.commit(() => {
      const previous = id && this.state.goals.find((goal) => goal.id === id);
      if (id && !previous) throw new Error('目标不存在');
      if (!this.state.characters.length || input.characterId !== 'all' && !this.charById(input.characterId)) throw new Error('请选择有效角色');
      if (!Number.isFinite(input.target) || input.target <= 0) throw new Error('目标数值需大于 0');
      const type = input.type || previous?.type || 'money';
      if (!this.goalTypes.some((item) => item.v === type)) throw new Error('无效的目标类型');
      const tracking = input.tracking === undefined ? previous?.tracking || null : input.tracking;
      const metric = tracking && this.goalMetrics.find((item) => item.v === tracking.category);
      if (tracking) {
        if (type !== 'progress' || !metric) throw new Error('请选择有效的养成项目');
        if (!Number.isSafeInteger(input.target)) throw new Error('养成目标需填写正整数');
        if (['schoolSkills', 'auxiliarySkills'].includes(tracking.category) &&
          (typeof tracking.key !== 'string' || !tracking.key.trim())) throw new Error('请选择技能');
        if (['training', 'petTraining'].includes(tracking.category) &&
          !this.goalMetricOptions(tracking.category).some((item) => item.v === tracking.key)) throw new Error('请选择修炼项目');
      }
      if (input.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) ||
        U.fmtDate(U.parseDate(input.deadline)) !== input.deadline)) throw new Error('请选择有效的期望完成日期');
      const goal = { ...(previous || {
        id: U.uid(), createdAt: Date.now(), sortOrder: 0, current: 0, baseProgress: 0, status: 'active', logs: [],
      }), characterId: input.characterId, type, target: input.target,
        tracking: tracking ? { category: tracking.category,
          key: ['schoolSkills', 'auxiliarySkills', 'training', 'petTraining'].includes(tracking.category) ? tracking.key.trim() : '' } : null,
        unit: metric ? metric.unit : String(input.unit || '万').trim() || '万',
        deadline: input.deadline || '', note: String(input.note || '').trim() };
      goal.title = String(input.title || '').trim() || this.goalDefaultTitle(goal);
      if (previous) Object.assign(previous, goal);
      else {
        this.orderedGoals().forEach((item, index) => { item.sortOrder = index + 1; });
        this.state.goals.push(goal);
      }
      this.recalculateGoal(previous || goal);
      return previous || goal;
    });
  },

  /** 在同一事务中更新各角色对应的养成值，同时生成原有角色养成记录。 */
  saveGoalGrowth(id, values, record = {}) {
    return this.commit(() => {
      const goal = this.state.goals.find((item) => item.id === id);
      if (!goal?.tracking) throw new Error('该目标未跟随角色档案');
      const members = this.goalCharacters(goal);
      const { category, key } = goal.tracking;
      let count = 0;
      for (const [characterId, input] of Object.entries(values)) {
        const character = members.find((member) => member.id === characterId);
        if (!character) throw new Error('目标角色已变更，请重新打开进度表单');
        const value = this.characterNumber(input);
        if (input !== '' && input != null && value === null) throw new Error('养成进度需填写非负整数或留空');
        if (value === this.goalCharacterValue(character, goal.tracking)) continue;
        const changes = category === 'level' ? { level: value } : { progress: this.normalizeCharacterProgress(character.progress) };
        if (['schoolSkills', 'auxiliarySkills'].includes(category)) {
          const skill = changes.progress[category].find((item) => item.name === key);
          if (skill) skill.level = value; else changes.progress[category].push({ name: key, level: value });
        } else if (['training', 'petTraining'].includes(category)) changes.progress[category][key] = value;
        else if (category !== 'level') changes.progress[category] = value;
        this.applyCharacter(changes, characterId, record);
        count++;
      }
      if (!count) throw new Error('没有需要更新的进度');
      return count;
    });
  },

  goalGrowthHistory(goal) {
    const groups = { schoolSkills: '师门技能', auxiliarySkills: '辅助技能', training: '人物修炼', petTraining: '召唤兽修炼',
      level: '基础信息', qianyuanPills: '其他养成', potentialFruits: '其他养成' };
    const label = goal.tracking.category === 'level' ? '等级' : this.goalMetricLabel(goal.tracking);
    return this.characterGrowthHistory(goal.characterId).flatMap((entry) => entry.changes
      .filter((change) => change.group === groups[goal.tracking.category] && change.label === label)
      .map((change) => ({ ...entry, change })));
  },

  removeGoal(id) {
    return this.commit(() => { this.state.goals = this.state.goals.filter((goal) => goal.id !== id); });
  },

  setGoalStatus(id, status) {
    return this.commit(() => {
      if (!['active', 'done'].includes(status)) throw new Error('无效的目标状态');
      const goal = this.state.goals.find((item) => item.id === id);
      if (!goal) throw new Error('目标不存在');
      if (goal.tracking) throw new Error('养成目标按角色档案自动判断是否达成');
      if (status === 'done') {
        if (goal.target > goal.current) {
          const total = goal.baseProgress + goal.logs.reduce((sum, log) => sum + log.delta, 0);
          goal.logs.push({ id: U.uid(), date: U.today(), delta: goal.target - total, note: '标记完成', createdAt: Date.now() });
          goal.current = goal.target;
        }
        goal.doneAt = U.today();
      } else {
        delete goal.doneAt;
      }
      goal.status = status;
    });
  },

  saveGoalProgress(id, input, logId) {
    return this.commit(() => {
      const goal = this.state.goals.find((item) => item.id === id);
      if (!goal) throw new Error('目标不存在');
      if (goal.tracking) throw new Error('请更新角色养成进度');
      if (!Number.isFinite(input.delta) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
        U.fmtDate(U.parseDate(input.date)) !== input.date) throw new Error('请填写有效日期与进度变化');
      const previous = logId && goal.logs.find((log) => log.id === logId);
      if (logId && !previous) throw new Error('进度记录不存在');
      const entry = Object.assign({}, previous || { id: U.uid(), createdAt: Date.now() }, input);
      if (!logId) entry.delta = Math.max(0, goal.current + input.delta) - goal.current;
      if (previous) Object.assign(previous, entry); else goal.logs.push(entry);
      this.recalculateGoal(goal);
      return entry;
    });
  },

  removeGoalProgress(id, logId) {
    return this.commit(() => {
      const goal = this.state.goals.find((item) => item.id === id);
      if (!goal) throw new Error('目标不存在');
      if (goal.tracking) throw new Error('请在角色养成记录中查看原始变更');
      goal.logs = goal.logs.filter((log) => log.id !== logId);
      this.recalculateGoal(goal);
    });
  },

  recalculateGoal(goal) {
    goal.current = Math.max(0, goal.baseProgress + goal.logs.reduce((sum, log) => sum + log.delta, 0));
    if (goal.status === 'done' && goal.current < goal.target) {
      goal.status = 'active';
      delete goal.doneAt;
    }
  },
});
