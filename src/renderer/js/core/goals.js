'use strict';
/* 目标及进度流水，基础进度保留旧档案中未列入流水的数值。 */
Object.assign(D, {
  saveGoal(input, id) {
    return this.commit(() => {
      const previous = id && this.state.goals.find((goal) => goal.id === id);
      if (id && !previous) throw new Error('目标不存在');
      if (!this.charById(input.characterId) || !String(input.title || '').trim()) throw new Error('请填写角色与目标标题');
      if (!Number.isFinite(input.target) || input.target < 0) throw new Error('目标数值需为非负数');
      const goal = Object.assign({}, previous || {
        id: U.uid(), createdAt: Date.now(), current: 0, baseProgress: 0, status: 'active', logs: [],
      }, input, { title: input.title.trim(), unit: input.unit || '万' });
      if (previous) Object.assign(previous, goal); else this.state.goals.push(goal);
      this.recalculateGoal(previous || goal);
      return previous || goal;
    });
  },

  removeGoal(id) {
    return this.commit(() => { this.state.goals = this.state.goals.filter((goal) => goal.id !== id); });
  },

  setGoalStatus(id, status) {
    return this.commit(() => {
      if (!['active', 'done'].includes(status)) throw new Error('无效的目标状态');
      const goal = this.state.goals.find((item) => item.id === id);
      if (!goal) throw new Error('目标不存在');
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
