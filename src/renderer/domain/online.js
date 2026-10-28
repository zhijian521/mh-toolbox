// @ts-check
// Migrated from the immutable v1 baseline; see migration/baseline.json.

/** @typedef {Partial<Domain> & ThisType<Domain>} OnlineMixin */

/**
 * 每个角色每小时消耗的点卡点数。
 *
 * 游戏规则，不是用户设置——所以写成常量而不是拆进 `quickSettings`。
 * 页面上的文案也从这里取，避免改了公式却漏掉提示文字。
 */
export const POINTS_PER_HOUR = 6;

/**
 * 会话的在线角色清单规范化。
 *
 * `roster` 是「这段计时同时在线的那几个号」：老数据没有这个字段，只有 `characterId`，
 * 读取时按单角色处理，口径与改造前完全一致。坏数据（不是数组、混入非字符串、
 * 指向已删除的角色）在这里无损降级——读取路径不允许抛错。
 *
 * 只剩一个角色时字段直接删掉，让单角色会话与老数据同形，往返序列化保持幂等。
 *
 * @param {any} session
 * @returns {any}
 */
function normalizeRoster(session) {
    const next = Object.assign({}, session);
    const raw = Array.isArray(next.roster) ? next.roster : [];
    const roster = Array.from(
        new Set(raw.filter((/** @type {any} */ id) => typeof id === 'string' && id)),
    );
    if (roster.length > 1) next.roster = roster;
    else delete next.roster;
    return next;
}

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
                // 会话与进行中记录同样来自磁盘，形状不可信：非普通对象项一律丢弃，
                // 否则下游 Object.assign 与 characterId 访问会抛错，启动直接变成死路。
                state.sessions = (Array.isArray(data.sessions) ? data.sessions : []).filter(
                    /** @param {any} s */
                    (s) => s !== null && typeof s === 'object' && !Array.isArray(s),
                );
                state.sessions = state.sessions.map(
                    /** @param {any} s */ (s) => normalizeRoster(s),
                );
                const active =
                    data.activeSession &&
                    typeof data.activeSession === 'object' &&
                    !Array.isArray(data.activeSession)
                        ? data.activeSession
                        : null;
                state.activeSession =
                    active &&
                    state.characters.some(/** @param {any} c */ (c) => c.id === active.characterId)
                        ? normalizeRoster(active)
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
             * 一段会话覆盖的在线角色。
             *
             * 老数据只有 `characterId`，`roster` 缺省时退化成单元素数组；指向已删除角色的
             * 成员在这里被丢掉，避免已删角色的 id 继续出现在点卡流水和结算里。
             *
             * @this {Domain}
             * @param {any} session
             * @returns {string[]}
             */
            rosterOf(session) {
                if (!session) return [];
                const roster = Array.isArray(session.roster)
                    ? session.roster.filter(
                          /** @param {any} id */ (id) =>
                              typeof id === 'string' && this.charById(id),
                      )
                    : [];
                if (roster.length) return roster;
                return session.characterId && this.charById(session.characterId)
                    ? [String(session.characterId)]
                    : [];
            },

            /**
             * 当前正在计时的角色清单；没有计时返回空数组。
             *
             * 速记按它决定「这笔收益记给谁」：单开时就是那一个号，多开时按人数均分。
             * 页面不再自行猜测归属——归属跑偏会让另一个号只剩点卡。
             *
             * @this {Domain}
             * @returns {string[]}
             */
            onlineRoster() {
                return this.rosterOf(this.state.activeSession);
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
                        /* 这里只校验「是正整数」，不设业务上限：上限归 `setQuickSettings`
                           与界面管。校验路径一旦收紧，历史数据里角色数超范围的会话就永远
                           结算不了，计时会卡在 activeSession 里出不来。 */
                        !Number.isFinite(session.cardPrice) ||
                        session.cardPrice <= 0)
                )
                    return '角色数需为正整数，点卡价格需大于 0';
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
                /* 重叠按「在线角色」判：两个号同时在线时，它们各自的时段本来就会撞在一起，
                   只看主角色的话，第二个号永远加不进同一段计时。 */
                const mine = this.rosterOf(session);
                const overlap = others.find(
                    /** @param {any} s */
                    (s) =>
                        s.id !== session.id &&
                        s.mode === 'range' &&
                        session.startAt < s.endAt &&
                        session.endAt > s.startAt &&
                        this.rosterOf(s).some(/** @param {string} id */ (id) => mine.includes(id)),
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
                /* 勾了几个号在线，点卡就该按几个号乘：`accounts` 直接取清单长度，
                   避免「勾了 3 个角色、参数还停在 5」时费用与分摊人数对不上。 */
                const roster = Array.isArray(session.roster)
                    ? session.roster.filter(/** @param {any} id */ (id) => this.charById(id))
                    : [];
                if (roster.length > 1) {
                    session.roster = roster;
                    if (!roster.includes(session.characterId)) session.characterId = roster[0];
                    session.accounts = roster.length;
                } else delete session.roster;
                if (session.mode === 'range') {
                    session.minutes = (session.endAt - session.startAt) / 60000;
                    session.date = U.fmtDate(new Date(session.startAt));
                }
                if (session.mode !== 'legacy') {
                    session.cost =
                        Math.round(
                            ((session.minutes / 60) *
                                POINTS_PER_HOUR *
                                session.accounts *
                                session.cardPrice) /
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
                const roster = this.rosterOf(session);
                /* 一个角色都没匹配上（角色被删光）时仍按原归属记一条，别让这段成本凭空消失。 */
                const owners = roster.length ? roster : [session.characterId];
                this.sessionSlices(session).forEach(
                    /** @param {any} slice */ (slice) => {
                        /* 多开时点卡按人头平摊：每个在线的号各有一条「点卡」，金额之和仍等于
                           这段会话的总价。全挂在一个号上会让另一个号零成本、结算成纯负数。 */
                        const shares = U.splitAmount(slice.cost, owners.length);
                        owners.forEach(
                            /**
                             * @param {string} characterId
                             * @param {number} index
                             */
                            (characterId, index) => {
                                const old = previous.find(
                                    /** @param {any} t */ (t) =>
                                        t.date === slice.date && t.characterId === characterId,
                                );
                                transactions.push({
                                    /* 单角色沿用旧 id（历史数据里可能来自迁移），多角色按
                                       「日期 + 角色」各自稳定，重复结算不会新增行。 */
                                    id:
                                        old && owners.length === 1
                                            ? old.id
                                            : 'online-' +
                                              session.id +
                                              '-' +
                                              slice.date +
                                              (owners.length > 1 ? '-' + characterId : ''),
                                    ledger: 'earnings',
                                    recordType: 'money',
                                    characterId,
                                    date: slice.date,
                                    kind: 'expense',
                                    currency: 'cash',
                                    category: '点卡',
                                    amount: shares[index],
                                    minutes: 0,
                                    fee: 0,
                                    source: 'online',
                                    sessionId: session.id,
                                    createdAt: session.createdAt,
                                    note:
                                        '在线 ' +
                                        (slice.minutes / 60).toFixed(2) +
                                        ' 小时' +
                                        (session.accounts
                                            ? ' × ' + session.accounts + ' 角色'
                                            : '') +
                                        (owners.length > 1 ? ' · 分摊 1/' + owners.length : '') +
                                        (session.note ? ' · ' + session.note : ''),
                                });
                            },
                        );
                    },
                );
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
             * 速记参数：参与点卡成本的账号数与每点单价（单位：游戏币）。
             *
             * 只影响下一次开始计时与点卡成本的换算，不改已经结算过的会话。
             *
             * @this {Domain}
             * @param {{ accounts?: number, cardPrice?: number }} input
             */
            setQuickSettings(input) {
                const accounts = Math.round(Number(input.accounts));
                const cardPrice = Number(input.cardPrice);
                if (!Number.isSafeInteger(accounts) || accounts < 1 || accounts > 20)
                    throw new Error('同时在线角色数需为 1-20 的整数');
                if (!Number.isFinite(cardPrice) || cardPrice <= 0)
                    throw new Error('请填写有效的点卡单价');
                this.state.quickSettings = { accounts, cardPrice };
            },

            /**
             * 开始计时。`roster` 是这次同时在线的角色清单，缺省时只记 `characterId` 一个，
             * 与改造前完全一致；多开时点卡由 `syncSession` 按清单平摊。
             *
             * @this {Domain}
             * @param {string} characterId
             * @param {string[]} [roster]
             * @returns {Promise<any>}
             */
            async startSession(characterId, roster) {
                if (this.state.activeSession) throw new Error('已有未结束的在线记录，请先处理');
                const members = (Array.isArray(roster) ? roster : []).filter(
                    /** @param {any} id */ (id) => this.charById(id),
                );
                if (!members.length && this.charById(characterId)) members.push(characterId);
                if (!members.length) throw new Error('请先选择归属角色');
                /* 主角色仍取页面手上的那个（筛选/勾选第一项），保证会话的归属显示与旧数据同构。 */
                const primary = members.includes(characterId) ? characterId : members[0];
                const active = Object.assign(
                    {
                        id: U.uid(),
                        characterId: primary,
                        startAt: Date.now(),
                        createdAt: Date.now(),
                    },
                    members.length > 1 ? { roster: members } : {},
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
                        const roster = this.rosterOf(session);
                        const single = !!charId && charId !== 'all';
                        if (single && !roster.includes(charId)) return;
                        /* 单角色视角只看自己那一份点卡；「全部角色」看整段，不能按人头翻倍。 */
                        const share = single ? 1 / Math.max(1, roster.length) : 1;
                        const slices = this.sessionSlices(session).filter(
                            (s) => (!from || s.date >= from) && (!to || s.date <= to),
                        );
                        if (!slices.length) return;
                        result.count++;
                        slices.forEach((slice) => {
                            result.minutes += slice.minutes;
                            result.cost += slice.cost * share;
                            if (active && session.id === active.id)
                                result.liveCost += slice.cost * share;
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
                const roster = this.rosterOf(active);
                const single = !!charId && charId !== 'all';
                if (!active || (single && !roster.includes(charId))) return stats;
                const share = single ? 1 / Math.max(1, roster.length) : 1;
                const session = this.makeSession(
                    Object.assign({}, active, { mode: 'range', endAt: Date.now() }),
                );
                this.sessionSlices(session).forEach((slice) => {
                    if ((from && slice.date < from) || (to && slice.date > to)) return;
                    stats.onlineMinutes += slice.minutes;
                    stats.cardCost += slice.cost * share;
                    stats.expense += slice.cost * share;
                });
                stats.net = stats.income - stats.expense;
                stats.hourly =
                    stats.onlineMinutes > 0 ? stats.net / (stats.onlineMinutes / 60) : null;
                return stats;
            },
        }),
    );
}
