// @ts-check
// Migrated from the immutable v1 baseline; see docs/SYNC.md.

/** @typedef {Partial<Domain> & ThisType<Domain>} GoalsMixin */

/** @typedef {{ from?: string, to?: string }} DateRange */

/**
 * @param {Domain} D
 * @param {any} U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, U, _gateway, _localStorage) {
    /* 手动累计目标与跟随角色档案的养成目标。 */
    Object.assign(
        D,
        /** @type {GoalsMixin} */ ({
            /**
             * @this {Domain}
             * @param {any[]} [goals]
             * @returns {any[]}
             */
            orderedGoals(goals) {
                return this.orderedCards(goals === undefined ? this.state.goals : goals);
            },

            /** @this {Domain} @param {string} id @param {any} changes @returns {Promise<any>} */
            saveGoalOrder(id, changes) {
                return this.commit(() => this.moveCard(this.state.goals, id, changes));
            },

            /**
             * @this {Domain}
             * @param {any} goal
             * @returns {any[]}
             */
            goalCharacters(goal) {
                return this.orderedCharacters().filter(
                    (/** @type {any} */ character) =>
                        goal.characterId === 'all' || character.id === goal.characterId,
                );
            },

            /**
             * @this {Domain}
             * @param {string} [characterId]
             * @returns {any[]}
             */
            goalsFor(characterId) {
                const filter = characterId === undefined ? this.charFilter : characterId;
                return this.state.goals.filter(
                    (/** @type {any} */ goal) =>
                        filter === 'all' ||
                        goal.characterId === 'all' ||
                        goal.characterId === filter,
                );
            },

            /**
             * @this {Domain}
             * @param {string} category
             * @param {string} characterId
             * @returns {Array<{ v: string, t: string }>}
             */
            goalMetricOptions(category, characterId) {
                return this.growthMetricOptions(category, this.goalCharacters({ characterId }));
            },

            /**
             * @this {Domain}
             * @param {any} tracking
             * @returns {string}
             */
            goalMetricLabel(tracking) {
                try {
                    const metric = this.growthMetric(tracking.category, tracking.key);
                    return metric.kind === 'level' ? metric.t : metric.label;
                } catch (_) {
                    return this.growthCategory(tracking.category)?.kind === 'training'
                        ? '未知修炼'
                        : '未知项目';
                }
            },

            /**
             * @this {Domain}
             * @param {any} character
             * @param {any} tracking
             * @returns {number | null}
             */
            goalCharacterValue(character, tracking) {
                return this.growthValue(character, tracking.category, tracking.key);
            },

            /**
             * 全体目标始终按完整成员计算；超额部分封顶，不能抵消其他角色的不足。
             *
             * @this {Domain}
             * @param {any} goal
             * @returns {any}
             */
            goalSummary(goal) {
                if (!goal.tracking) {
                    return {
                        current: goal.current,
                        target: goal.target,
                        status: goal.status,
                        pct:
                            goal.target > 0
                                ? Math.min(
                                      100,
                                      Math.max(0, Math.round((goal.current / goal.target) * 100)),
                                  )
                                : 0,
                    };
                }
                const members = this.goalCharacters(goal).map((/** @type {any} */ character) => {
                    const value = this.goalCharacterValue(character, goal.tracking);
                    return {
                        id: character.id,
                        name: character.name,
                        value,
                        done: value !== null && value >= goal.target,
                        remaining: value === null ? null : Math.max(0, goal.target - value),
                    };
                });
                const achieved = members.filter((/** @type {any} */ member) => member.done).length;
                const unknown = members.filter(
                    (/** @type {any} */ member) => member.value === null,
                ).length;
                const current = members.reduce(
                    (/** @type {number} */ sum, /** @type {any} */ member) =>
                        sum + Math.min(goal.target, member.value || 0),
                    0,
                );
                const target = goal.target * members.length;
                const status =
                    members.length > 0 && achieved === members.length ? 'done' : 'active';
                return {
                    members,
                    achieved,
                    unknown,
                    current,
                    target,
                    status,
                    pct:
                        target > 0
                            ? Math.min(
                                  status === 'done' ? 100 : 99,
                                  Math.round((current / target) * 100),
                              )
                            : 0,
                };
            },

            /**
             * @this {Domain}
             * @param {any} goal
             * @returns {string}
             */
            goalDefaultTitle(goal) {
                const subject =
                    goal.characterId === 'all' ? '全部角色' : this.charName(goal.characterId);
                return (
                    subject +
                    ' · ' +
                    (goal.tracking
                        ? this.goalMetricLabel(goal.tracking)
                        : this.goalTypeText(goal.type)) +
                    '达到 ' +
                    goal.target +
                    goal.unit
                );
            },

            /**
             * @this {Domain}
             * @param {any} input
             * @param {string} [id]
             * @returns {Promise<any>}
             */
            saveGoal(input, id) {
                return this.commit(() => {
                    const previous =
                        id && this.state.goals.find((/** @type {any} */ goal) => goal.id === id);
                    if (id && !previous) throw new Error('目标不存在');
                    if (
                        !this.state.characters.length ||
                        (input.characterId !== 'all' && !this.charById(input.characterId))
                    )
                        throw new Error('请选择有效角色');
                    if (!Number.isFinite(input.target) || input.target <= 0)
                        throw new Error('目标数值需大于 0');
                    const type = input.type || previous?.type || 'money';
                    if (!this.goalTypes.some((/** @type {any} */ item) => item.v === type))
                        throw new Error('无效的目标类型');
                    const tracking =
                        input.tracking === undefined ? previous?.tracking || null : input.tracking;
                    const metric = tracking && this.growthCategory(tracking.category);
                    if (tracking) {
                        if (type !== 'progress' || !metric) throw new Error('请选择有效的养成项目');
                        if (!Number.isSafeInteger(input.target))
                            throw new Error('养成目标需填写正整数');
                        if (
                            metric.kind === 'skills' &&
                            (typeof tracking.key !== 'string' || !tracking.key.trim())
                        )
                            throw new Error('请选择技能');
                        if (
                            metric.kind === 'training' &&
                            !this.goalMetricOptions(tracking.category).some(
                                (/** @type {any} */ item) => item.v === tracking.key,
                            )
                        )
                            throw new Error('请选择修炼项目');
                    }
                    if (
                        input.deadline &&
                        (!/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) ||
                            U.fmtDate(U.parseDate(input.deadline)) !== input.deadline)
                    )
                        throw new Error('请选择有效的期望完成日期');
                    const goal = {
                        ...(previous || {
                            id: U.uid(),
                            createdAt: Date.now(),
                            sortOrder: 0,
                            current: 0,
                            baseProgress: 0,
                            status: 'active',
                            logs: [],
                        }),
                        characterId: input.characterId,
                        type,
                        target: input.target,
                        tracking: tracking
                            ? {
                                  category: tracking.category,
                                  key: ['skills', 'training'].includes(metric.kind)
                                      ? tracking.key.trim()
                                      : '',
                              }
                            : null,
                        unit: metric ? metric.unit : String(input.unit || '万').trim() || '万',
                        deadline: input.deadline || '',
                        note: String(input.note || '').trim(),
                    };
                    goal.title = String(input.title || '').trim() || this.goalDefaultTitle(goal);
                    if (previous) Object.assign(previous, goal);
                    else {
                        this.orderedGoals().forEach(
                            (/** @type {any} */ item, /** @type {number} */ index) => {
                                item.sortOrder = index + 1;
                            },
                        );
                        this.state.goals.push(goal);
                    }
                    this.recalculateGoal(previous || goal);
                    return previous || goal;
                });
            },

            /**
             * 在同一事务中更新各角色对应的养成值，同时生成原有角色养成记录。
             *
             * @this {Domain}
             * @param {string} id
             * @param {any} values
             * @param {any} [record]
             * @returns {Promise<any>}
             */
            saveGoalGrowth(id, values, record = {}) {
                return this.commit(() => {
                    const goal = this.state.goals.find((/** @type {any} */ item) => item.id === id);
                    if (!goal?.tracking) throw new Error('该目标未跟随角色档案');
                    const members = this.goalCharacters(goal);
                    const { category, key } = goal.tracking;
                    let count = 0;
                    for (const [characterId, input] of Object.entries(values)) {
                        const character = members.find(
                            (/** @type {any} */ member) => member.id === characterId,
                        );
                        if (!character) throw new Error('目标角色已变更，请重新打开进度表单');
                        const changes = this.characterValueChanges(
                            character,
                            category,
                            key,
                            input,
                            { allowMissingSkill: true },
                        );
                        if (
                            this.characterNumber(input) ===
                            this.goalCharacterValue(character, goal.tracking)
                        )
                            continue;
                        this.applyCharacter(changes, characterId, record);
                        count++;
                    }
                    if (!count) throw new Error('没有需要更新的进度');
                    return count;
                });
            },

            /**
             * @this {Domain}
             * @param {any} goal
             * @param {DateRange} [range]
             * @returns {any[]}
             */
            goalGrowthHistory(goal, range = {}) {
                /** @type {GrowthMetric & { key: string, label: string }} */
                let metric;
                try {
                    metric = this.growthMetric(goal.tracking.category, goal.tracking.key);
                } catch (_) {
                    return [];
                }
                return this.characterGrowthHistory(goal.characterId, range).flatMap(
                    (/** @type {any} */ entry) =>
                        entry.changes
                            .filter(
                                (/** @type {any} */ change) =>
                                    change.group === metric.group && change.label === metric.label,
                            )
                            .map((/** @type {any} */ change) => ({ ...entry, change })),
                );
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @returns {Promise<any>}
             */
            removeGoal(id) {
                return this.commit(() => {
                    this.state.goals = this.state.goals.filter(
                        (/** @type {any} */ goal) => goal.id !== id,
                    );
                });
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @param {string} status
             * @returns {Promise<any>}
             */
            setGoalStatus(id, status) {
                return this.commit(() => {
                    if (!['active', 'done'].includes(status)) throw new Error('无效的目标状态');
                    const goal = this.state.goals.find((/** @type {any} */ item) => item.id === id);
                    if (!goal) throw new Error('目标不存在');
                    if (goal.tracking) throw new Error('养成目标按角色档案自动判断是否达成');
                    if (status === 'done') {
                        if (goal.target > goal.current) {
                            const total =
                                goal.baseProgress +
                                goal.logs.reduce(
                                    (/** @type {number} */ sum, /** @type {any} */ log) =>
                                        sum + log.delta,
                                    0,
                                );
                            goal.logs.push({
                                id: U.uid(),
                                date: U.today(),
                                delta: goal.target - total,
                                note: '标记完成',
                                createdAt: Date.now(),
                            });
                            goal.current = goal.target;
                        }
                        goal.doneAt = U.today();
                    } else {
                        delete goal.doneAt;
                    }
                    goal.status = status;
                });
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @param {any} input
             * @param {string} [logId]
             * @returns {Promise<any>}
             */
            saveGoalProgress(id, input, logId) {
                return this.commit(() => {
                    const goal = this.state.goals.find((/** @type {any} */ item) => item.id === id);
                    if (!goal) throw new Error('目标不存在');
                    if (goal.tracking) throw new Error('请更新角色养成进度');
                    if (
                        !Number.isFinite(input.delta) ||
                        !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
                        U.fmtDate(U.parseDate(input.date)) !== input.date
                    )
                        throw new Error('请填写有效日期与进度变化');
                    const previous =
                        logId && goal.logs.find((/** @type {any} */ log) => log.id === logId);
                    if (logId && !previous) throw new Error('进度记录不存在');
                    const entry = Object.assign(
                        {},
                        previous || { id: U.uid(), createdAt: Date.now() },
                        input,
                    );
                    if (!logId)
                        entry.delta = Math.max(0, goal.current + input.delta) - goal.current;
                    if (previous) Object.assign(previous, entry);
                    else goal.logs.push(entry);
                    this.recalculateGoal(goal);
                    return entry;
                });
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @param {string} logId
             * @returns {Promise<any>}
             */
            removeGoalProgress(id, logId) {
                return this.commit(() => {
                    const goal = this.state.goals.find((/** @type {any} */ item) => item.id === id);
                    if (!goal) throw new Error('目标不存在');
                    if (goal.tracking) throw new Error('请在角色养成记录中查看原始变更');
                    goal.logs = goal.logs.filter((/** @type {any} */ log) => log.id !== logId);
                    this.recalculateGoal(goal);
                });
            },

            /**
             * @this {Domain}
             * @param {any} goal
             * @returns {any}
             */
            recalculateGoal(goal) {
                goal.current = Math.max(
                    0,
                    goal.baseProgress +
                        goal.logs.reduce(
                            (/** @type {number} */ sum, /** @type {any} */ log) => sum + log.delta,
                            0,
                        ),
                );
                if (goal.status === 'done' && goal.current < goal.target) {
                    goal.status = 'active';
                    delete goal.doneAt;
                }
            },
        }),
    );
}
