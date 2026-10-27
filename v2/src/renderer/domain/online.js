// @ts-check
// Migrated from the immutable v1 baseline; see migration/baseline.json.

/** @typedef {Partial<Domain> & ThisType<Domain>} OnlineMixin */

/**
 * @param {Domain} D
 * @param {any} U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, U, _gateway, _localStorage) {
    /* 在线记录与关联点卡流水共用一份结算、跨日分摊及保存逻辑。 */
    Object.assign(
        D,
        /** @type {OnlineMixin} */ ({
            /**
             * @this {Domain}
             * @param {any} state
             * @param {any} data
             * @returns {any}
             */
            normalizeOnline(state, data) {
                state.sessions = Array.isArray(data.sessions)
                    ? data.sessions.map(/** @param {any} s */ (s) => Object.assign({}, s))
                    : [];
                state.activeSession =
                    data.activeSession &&
                    state.characters.some(
                        /** @param {any} c */ (c) => c.id === data.activeSession.characterId,
                    )
                        ? Object.assign({}, data.activeSession)
                        : null;
                state.transactions.forEach(function (/** @type {any} */ tx) {
                    if (
                        tx.sessionId ||
                        tx.ledger !== 'earnings' ||
                        tx.source !== 'quick' ||
                        tx.category !== '点卡' ||
                        tx.kind !== 'expense' ||
                        !(tx.minutes > 0)
                    )
                        return;
                    const id = 'legacy-' + tx.id;
                    state.sessions.push({
                        id,
                        characterId: tx.characterId,
                        mode: 'legacy',
                        source: 'legacy',
                        date: tx.date,
                        minutes: tx.minutes,
                        cost: tx.amount,
                        accounts: null,
                        cardPrice: null,
                        note: tx.note || '',
                        createdAt: tx.createdAt || 0,
                    });
                    tx.sessionId = id;
                });
                return state;
            },

            /**
             * @this {Domain}
             * @param {any} session
             * @returns {Array<{ date: string, minutes: number, cost: number }>}
             */
            sessionSlices(session) {
                if (session.mode !== 'range')
                    return [{ date: session.date, minutes: session.minutes, cost: session.cost }];
                /** @type {Array<{ date: string, minutes: number, cost: number }>} */
                const slices = [];
                let cursor = session.startAt,
                    allocated = 0;
                const costUnits = Math.round(session.cost * 100);
                while (cursor < session.endAt) {
                    const day = new Date(cursor);
                    const midnight = new Date(
                        day.getFullYear(),
                        day.getMonth(),
                        day.getDate() + 1,
                    ).getTime();
                    const end = Math.min(midnight, session.endAt);
                    // 按累计比例舍入，保证每日费用之和与整段费用完全一致。
                    const units = Math.round(
                        (costUnits * (end - session.startAt)) / (session.endAt - session.startAt),
                    );
                    slices.push({
                        date: U.fmtDate(day),
                        minutes: (end - cursor) / 60000,
                        cost: (units - allocated) / 100,
                    });
                    allocated = units;
                    cursor = end;
                }
                return slices;
            },

            /**
             * @this {Domain}
             * @param {any} session
             * @param {string} [ignoreActiveId]
             * @returns {string}
             */
            sessionError(session, ignoreActiveId) {
                if (!this.charById(session.characterId)) return '请选择有效的归属角色';
                if (!(Number.isFinite(session.minutes) && session.minutes > 0))
                    return '在线时长需大于 0';
                if (!Number.isFinite(session.cost) || session.cost < 0)
                    return '点卡费用需为有效的非负金额';
                if (
                    session.mode !== 'legacy' &&
                    (!Number.isInteger(session.accounts) ||
                        session.accounts < 1 ||
                        session.accounts > 20 ||
                        !Number.isFinite(session.cardPrice) ||
                        session.cardPrice <= 0)
                )
                    return '角色数需为 1～20 的整数，点卡价格需大于 0';
                if (session.mode !== 'range') {
                    if (
                        !/^\d{4}-\d{2}-\d{2}$/.test(session.date) ||
                        U.fmtDate(U.parseDate(session.date)) !== session.date ||
                        session.date > U.today()
                    )
                        return '请选择有效日期，不能补记未来记录';
                    if (session.mode !== 'legacy' && session.minutes > 1440)
                        return '一天的在线时长不能超过 24 小时，跨天请使用时间段';
                    return '';
                }
                if (
                    !Number.isFinite(session.startAt) ||
                    !Number.isFinite(session.endAt) ||
                    session.endAt <= session.startAt
                )
                    return '结束时间需晚于开始时间';
                if (session.endAt > Date.now()) return '结束时间不能晚于当前时间';
                const active = this.state.activeSession;
                const others = this.state.sessions.concat(
                    active && active.id !== ignoreActiveId
                        ? [Object.assign({}, active, { mode: 'range', endAt: Date.now() })]
                        : [],
                );
                const overlap = others.find(
                    /** @param {any} s */
                    (s) =>
                        s.id !== session.id &&
                        s.characterId === session.characterId &&
                        s.mode === 'range' &&
                        session.startAt < s.endAt &&
                        session.endAt > s.startAt,
                );
                return overlap ? '该角色已有重叠的在线时段，请先编辑原记录或调整时间' : '';
            },

            /**
             * @this {Domain}
             * @param {any} input
             * @returns {any}
             */
            makeSession(input) {
                const session = Object.assign({}, input);
                if (session.mode === 'range') {
                    session.minutes = (session.endAt - session.startAt) / 60000;
                    session.date = U.fmtDate(new Date(session.startAt));
                }
                if (session.mode !== 'legacy') {
                    session.cost =
                        Math.round(
                            ((session.minutes / 60) * 6 * session.accounts * session.cardPrice) /
                                100,
                        ) / 100;
                }
                return session;
            },

            /**
             * 保存在线变更及流水，失败时恢复内存，允许用户重试。
             * @this {Domain}
             * @param {() => any} change
             * @returns {Promise<any>}
             */
            async commitOnline(change) {
                return this.commit(change);
            },

            /**
             * @this {Domain}
             * @param {any} session
             */
            syncSession(session) {
                const previous = this.state.transactions.filter(
                    /** @param {any} t */ (t) => t.sessionId === session.id,
                );
                const transactions = this.state.transactions.filter(
                    /** @param {any} t */ (t) => t.sessionId !== session.id,
                );
                this.sessionSlices(session).forEach(function (/** @type {any} */ slice) {
                    const old = previous.find(/** @param {any} t */ (t) => t.date === slice.date);
                    transactions.push({
                        id: old ? old.id : 'online-' + session.id + '-' + slice.date,
                        ledger: 'earnings',
                        recordType: 'money',
                        characterId: session.characterId,
                        date: slice.date,
                        kind: 'expense',
                        currency: 'cash',
                        category: '点卡',
                        amount: slice.cost,
                        minutes: 0,
                        fee: 0,
                        source: 'online',
                        sessionId: session.id,
                        createdAt: session.createdAt,
                        note:
                            '在线 ' +
                            (slice.minutes / 60).toFixed(2) +
                            ' 小时' +
                            (session.accounts ? ' × ' + session.accounts + ' 角色' : '') +
                            (session.note ? ' · ' + session.note : ''),
                    });
                });
                this.state.transactions = transactions;
            },

            /**
             * @this {Domain}
             * @param {any} input
             * @param {string} [finishActiveId]
             * @returns {Promise<any>}
             */
            async saveSession(input, finishActiveId) {
                const old =
                    input.id &&
                    this.state.sessions.find(/** @param {any} s */ (s) => s.id === input.id);
                const session = this.makeSession(
                    Object.assign(
                        { id: U.uid(), createdAt: Date.now(), source: 'manual' },
                        old,
                        input,
                    ),
                );
                const error = this.sessionError(session, finishActiveId);
                if (error) throw new Error(error);
                if (
                    finishActiveId &&
                    (!this.state.activeSession || this.state.activeSession.id !== finishActiveId)
                )
                    throw new Error('该次计时已结束，请刷新后查看');
                return this.commitOnline(() => {
                    const error = this.sessionError(session, finishActiveId);
                    if (error) throw new Error(error);
                    if (
                        finishActiveId &&
                        (!this.state.activeSession ||
                            this.state.activeSession.id !== finishActiveId)
                    )
                        throw new Error('该次计时已结束');
                    this.state.sessions = this.state.sessions
                        .filter(/** @param {any} s */ (s) => s.id !== session.id)
                        .concat(session);
                    this.syncSession(session);
                    if (finishActiveId) this.state.activeSession = null;
                    return session;
                });
            },

            /**
             * @this {Domain}
             * @param {string} id
             */
            removeSession(id) {
                this.state.sessions = this.state.sessions.filter(
                    /** @param {any} s */ (s) => s.id !== id,
                );
                this.state.transactions = this.state.transactions.filter(
                    /** @param {any} t */ (t) => t.sessionId !== id,
                );
            },

            /**
             * @this {Domain}
             * @param {string} characterId
             * @returns {Promise<any>}
             */
            async startSession(characterId) {
                if (this.state.activeSession) throw new Error('已有未结束的在线记录，请先处理');
                if (!this.charById(characterId)) throw new Error('请先选择归属角色');
                const active = Object.assign(
                    { id: U.uid(), characterId, startAt: Date.now(), createdAt: Date.now() },
                    this.state.quickSettings,
                );
                return this.commitOnline(() => {
                    if (this.state.activeSession) throw new Error('已有未结束的在线记录，请先处理');
                    this.state.activeSession = active;
                    return active;
                });
            },

            /**
             * @this {Domain}
             * @param {number} startAt
             * @returns {Promise<any>}
             */
            async adjustSessionStart(startAt) {
                const active = this.state.activeSession;
                if (!active) throw new Error('没有正在计时的记录');
                const candidate = this.makeSession(
                    Object.assign({}, active, { mode: 'range', startAt, endAt: Date.now() }),
                );
                const error = this.sessionError(candidate, active.id);
                if (error) throw new Error(error);
                return this.commitOnline(() => {
                    if (!this.state.activeSession || this.state.activeSession.id !== active.id)
                        throw new Error('该次计时已结束');
                    const current = this.makeSession(
                        Object.assign({}, this.state.activeSession, {
                            mode: 'range',
                            startAt,
                            endAt: Date.now(),
                        }),
                    );
                    const error = this.sessionError(current, active.id);
                    if (error) throw new Error(error);
                    this.state.activeSession.startAt = startAt;
                });
            },

            /**
             * @this {Domain}
             * @param {string} charId
             * @param {string} from
             * @param {string} to
             * @param {boolean} [includeActive]
             */
            onlineStats(charId, from, to, includeActive) {
                const result = { minutes: 0, cost: 0, liveCost: 0, count: 0 };
                const active = this.state.activeSession;
                const sessions = this.state.sessions.concat(
                    includeActive && active
                        ? [
                              this.makeSession(
                                  Object.assign({}, active, {
                                      mode: 'range',
                                      endAt: Date.now(),
                                  }),
                              ),
                          ]
                        : [],
                );
                sessions.forEach(
                    /** @param {any} session */
                    (session) => {
                        if (charId && charId !== 'all' && session.characterId !== charId) return;
                        const slices = this.sessionSlices(session).filter(
                            (s) => (!from || s.date >= from) && (!to || s.date <= to),
                        );
                        if (!slices.length) return;
                        result.count++;
                        slices.forEach((slice) => {
                            result.minutes += slice.minutes;
                            result.cost += slice.cost;
                            if (active && session.id === active.id) result.liveCost += slice.cost;
                        });
                    },
                );
                result.cost = Math.round(result.cost * 100) / 100;
                return result;
            },

            /**
             * @this {Domain}
             * @param {string} charId
             * @param {string} from
             * @param {string} to
             * @param {boolean} [includeActive]
             * @returns {any}
             */
            earningsStats(charId, from, to, includeActive) {
                const stats = this.stats(this.txIn(charId, from, to));
                const online = this.onlineStats(charId, from, to);
                stats.net = stats.income - stats.expense;
                stats.onlineMinutes = online.minutes;
                stats.cardCost = online.cost;
                stats.hourly = online.minutes > 0 ? stats.net / (online.minutes / 60) : null;
                return includeActive ? this.includeActiveEarnings(stats, charId, from, to) : stats;
            },

            /* 每秒仅计算当前时段；历史汇总由页面在数据或筛选变化时刷新。 */
            /**
             * @this {Domain}
             * @param {any} settled
             * @param {string} charId
             * @param {string} from
             * @param {string} to
             * @returns {any}
             */
            includeActiveEarnings(settled, charId, from, to) {
                const stats = Object.assign({}, settled);
                const active = this.state.activeSession;
                if (!active || (charId && charId !== 'all' && active.characterId !== charId))
                    return stats;
                const session = this.makeSession(
                    Object.assign({}, active, { mode: 'range', endAt: Date.now() }),
                );
                this.sessionSlices(session).forEach((slice) => {
                    if ((from && slice.date < from) || (to && slice.date > to)) return;
                    stats.onlineMinutes += slice.minutes;
                    stats.cardCost += slice.cost;
                    stats.expense += slice.cost;
                });
                stats.net = stats.income - stats.expense;
                stats.hourly =
                    stats.onlineMinutes > 0 ? stats.net / (stats.onlineMinutes / 60) : null;
                return stats;
            },
        }),
    );
}
