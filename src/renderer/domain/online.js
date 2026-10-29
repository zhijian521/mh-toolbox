// @ts-check
// Migrated from the immutable v1 baseline; see docs/SYNC.md.

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
                /* 计时中的会话：新形状是数组（每个角色一段），老形状是单个对象。
                   老段若带多成员 roster，就地拆成单角色段——运行时永远只有单角色计时，
                   结束某一段不必再写拆分逻辑；拆出的段人数恒为 1，成本之和与
                   「一段 × 人数」完全相等，账不会变。 */
                const raw = Array.isArray(data.activeSessions)
                    ? data.activeSessions
                    : data.activeSession &&
                        typeof data.activeSession === 'object' &&
                        !Array.isArray(data.activeSession)
                      ? [data.activeSession]
                      : [];
                state.activeSessions = [];
                raw.forEach(
                    /** @param {any} session */ (session) => {
                        if (!session || typeof session !== 'object' || Array.isArray(session))
                            return;
                        /* 成员取 roster 与 characterId 的并集，顺序稳定，指向已删除角色的丢弃。 */
                        const members = Array.from(
                            new Set(
                                (Array.isArray(session.roster) ? session.roster : [])
                                    .concat(session.characterId || [])
                                    .filter(
                                        /** @param {any} id */ (id) =>
                                            typeof id === 'string' &&
                                            state.characters.some(
                                                /** @param {any} c */ (c) => c.id === id,
                                            ),
                                    ),
                            ),
                        );
                        if (!members.length) return;
                        members.forEach(
                            /** @param {string} id */ (id) => {
                                const segment = Object.assign({}, session, {
                                    /* 拆出来的段沿用原 id 前缀，重复归一不会再变一次。 */
                                    id:
                                        members.length > 1
                                            ? String(session.id) + '-' + id
                                            : session.id,
                                    characterId: id,
                                    /* 单角色段的人数恒为 1：多开的总成本由多段相加，不再相乘。 */
                                    accounts: 1,
                                });
                                delete segment.roster;
                                state.activeSessions.push(segment);
                            },
                        );
                    },
                );
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
             * 正在计时的会话清单。
             *
             * 每个在线角色各自一段：先开一个号、中途再加两个号、最后分两次退出，
             * 都是互不影响的三段独立计时。老档里的多成员段在 `normalizeOnline`
             * 已经拆成单角色段，所以这里不处理 roster 多于一人以外的形状。
             *
             * @this {Domain}
             * @returns {any[]}
             */
            runningSessions() {
                const list = Array.isArray(this.state.activeSessions)
                    ? this.state.activeSessions
                    : [];
                return list.filter(
                    /** @param {any} s */ (s) =>
                        s !== null && typeof s === 'object' && !Array.isArray(s),
                );
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
                /** @type {Set<string>} */
                const ids = new Set();
                this.runningSessions().forEach(
                    /** @param {any} session */ (session) => {
                        this.rosterOf(session).forEach(
                            /** @param {string} id */ (id) => ids.add(id),
                        );
                    },
                );
                return Array.from(ids);
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
                /* 计时中的每一段都要参与重叠判断：错峰开始多个号时，活跃段是复数。 */
                const running = this.runningSessions().filter(
                    /** @param {any} s */ (s) => s.id !== ignoreActiveId,
                );
                const others = this.state.sessions.concat(
                    running.map(
                        /** @param {any} s */ (s) =>
                            Object.assign({}, s, { mode: 'range', endAt: Date.now() }),
                    ),
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
             * 把一段正在计时的会话结算成历史记录：写会话、同步点卡流水、从活跃清单摘掉。
             *
             * 只改内存，调用方必须已经在外层 `commitOnline` 里——批量结束要「全有或全无」，
             * 逐段各自提交会让「退了一半」的中间态留在磁盘上。
             *
             * @this {Domain}
             * @param {string} sessionId
             * @param {any} [patch] 覆盖字段；`endAt` 缺省取此刻
             * @returns {any} 结算后的会话；时长为 0 时返回 null（这段直接被撤掉）
             */
            settleRunning(sessionId, patch) {
                const running = this.runningSessions().find(
                    /** @param {any} s */ (s) => s.id === sessionId,
                );
                if (!running) throw new Error('该次计时已结束，请刷新后查看');
                const merged = Object.assign({}, running, patch, { mode: 'range' });
                if (!Number.isFinite(merged.endAt)) merged.endAt = Date.now();
                if (!merged.source) merged.source = 'timer';
                const session = this.makeSession(merged);
                /* 时长恰好为 0（同一毫秒内点了开始又点结束）：还没扣点卡，直接撤掉这段，
                   不写一条 0 元的空账。这也不能当成错误——「全部结束」时若有一个号刚上线，
                   不能让整批回滚。有秒数但不足 1 分钟的仍照常记，与改造前的边界一致。 */
                if (!(session.minutes > 0)) {
                    this.state.activeSessions = this.runningSessions().filter(
                        /** @param {any} s */ (s) => s.id !== sessionId,
                    );
                    return null;
                }
                const error = this.sessionError(session, sessionId);
                if (error) throw new Error(error);
                this.state.sessions = this.state.sessions
                    .filter(/** @param {any} s */ (s) => s.id !== session.id)
                    .concat(session);
                this.syncSession(session);
                /* 只摘掉被结束的这一段：错峰退出时其余角色继续各自计时。 */
                this.state.activeSessions = this.runningSessions().filter(
                    /** @param {any} s */ (s) => s.id !== sessionId,
                );
                return session;
            },

            /**
             * 结束一段或多段计时（单号退出、全部结束走同一个入口）。
             *
             * 一次 commit 结算全部：要么都落盘，要么整体回滚，不会出现「退了两个、
             * 第三个失败」之后账上只剩一半的中间态。
             *
             * @this {Domain}
             * @param {string[]} sessionIds
             * @returns {Promise<any[]>}
             */
            async stopSessions(sessionIds) {
                const ids = Array.from(
                    new Set(
                        (Array.isArray(sessionIds) ? sessionIds : []).filter(
                            /** @param {any} id */ (id) => typeof id === 'string' && id,
                        ),
                    ),
                );
                if (!ids.length) throw new Error('请选择要结束的计时');
                /* 一段都不在跑，说明别处已经结算过；这个判断放在 commit 之外，
                   避免抛错触发回滚把已经摘掉的段又装回来。 */
                if (
                    !ids.some(
                        /** @param {string} id */ (id) =>
                            this.runningSessions().some(/** @param {any} s */ (s) => s.id === id),
                    )
                )
                    throw new Error('该次计时已结束，请刷新后查看');
                return this.commitOnline(() => {
                    /* 已经不存在的段直接跳过：连点两次不会把第二段算成错误。
                       时长为 0 的段由 `settleRunning` 撤掉并返回 null，这里过滤掉。 */
                    return ids
                        .filter(
                            /** @param {string} id */ (id) =>
                                this.runningSessions().some(
                                    /** @param {any} s */ (s) => s.id === id,
                                ),
                        )
                        .map(/** @param {string} id */ (id) => this.settleRunning(id))
                        .filter(/** @param {any} session */ (session) => session !== null);
                });
            },

            /**
             * 保存一段在线记录。
             *
             * `finishActiveId` 是「结束计时」这一种保存，转交给 `settleRunning`；
             * 除此之外的保存（补记、编辑历史会话）不会碰到活跃清单。
             *
             * @this {Domain}
             * @param {any} input
             * @param {string} [finishActiveId]
             * @returns {Promise<any>}
             */
            async saveSession(input, finishActiveId) {
                if (finishActiveId)
                    return this.commitOnline(() => this.settleRunning(finishActiveId, input));
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
                const error = this.sessionError(session);
                if (error) throw new Error(error);
                return this.commitOnline(() => {
                    const problem = this.sessionError(session);
                    if (problem) throw new Error(problem);
                    this.state.sessions = this.state.sessions
                        .filter(/** @param {any} s */ (s) => s.id !== session.id)
                        .concat(session);
                    this.syncSession(session);
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
             * 速记参数：点卡单价（单位：游戏币）。
             *
             * 只影响之后的计时与补记，不改已经结算过的会话。
             *
             * 这里以前还存「同时在线角色数」，但它是个派生量：人数由实际开着的计时段
             * 表达（一段一号），参数表里再存一个数字，改成错峰计时后就必然与真实成本
             * 对不上。所以参数表只剩单价。
             *
             * @this {Domain}
             * @param {{ cardPrice?: number }} input
             */
            setQuickSettings(input) {
                const cardPrice = Number(input.cardPrice);
                if (!Number.isFinite(cardPrice) || cardPrice <= 0)
                    throw new Error('请填写有效的点卡单价');
                this.state.quickSettings = { cardPrice };
            },

            /**
             * 开始计时：为每个还没在线的角色各开一段。
             *
             * 已经在线上的角色会被跳过，所以这个入口既用来「起第一排号」，也用来
             * 「中途再加几个号」——不会有同一角色两段重叠计时。每段的人数恒为 1，
             * 多开的总成本由多段相加，与改造前的「一段 × 人数」完全等价。
             *
             * @this {Domain}
             * @param {string[]} characterIds
             * @returns {Promise<any[]>} 这次新建的会话段
             */
            async startSessions(characterIds) {
                const members = Array.from(
                    new Set(
                        (Array.isArray(characterIds) ? characterIds : []).filter(
                            /** @param {any} id */ (id) => this.charById(id),
                        ),
                    ),
                );
                if (!members.length) throw new Error('请先选择角色');
                const settings = this.state.quickSettings || {};
                const spawn = () => {
                    const online = new Set(this.onlineRoster());
                    const now = Date.now();
                    return members
                        .filter((/** @type {string} */ id) => !online.has(id))
                        .map((/** @type {string} */ id) => ({
                            id: U.uid(),
                            characterId: id,
                            startAt: now,
                            createdAt: now,
                            /* 单角色段：人数在这里恒为 1，多开靠段数表达。 */
                            accounts: 1,
                            cardPrice: Number(settings.cardPrice) || 0,
                        }));
                };
                if (!spawn().length) throw new Error('所选角色都已在计时中');
                return this.commitOnline(() => {
                    /* 落盘前再算一次：连点两次时第二批可能已经在线了。 */
                    const list = spawn();
                    if (!list.length) throw new Error('所选角色都已在计时中');
                    this.state.activeSessions = this.runningSessions().concat(list);
                    return list;
                });
            },

            /**
             * 把某一段正在计时的起点改到真实上线时间。
             *
             * `sessionId` 缺省取第一段，保持单段调用可用；错峰计时时页面会带具体那一段。
             *
             * @this {Domain}
             * @param {number} startAt
             * @param {string} [sessionId]
             * @returns {Promise<any>}
             */
            async adjustSessionStart(startAt, sessionId) {
                const running = this.runningSessions();
                const active = sessionId
                    ? running.find(/** @param {any} s */ (s) => s.id === sessionId)
                    : running[0];
                if (!active) throw new Error('没有正在计时的记录');
                const candidate = this.makeSession(
                    Object.assign({}, active, { mode: 'range', startAt, endAt: Date.now() }),
                );
                const error = this.sessionError(candidate, active.id);
                if (error) throw new Error(error);
                return this.commitOnline(() => {
                    const current = this.runningSessions().find(
                        /** @param {any} s */ (s) => s.id === active.id,
                    );
                    if (!current) throw new Error('该次计时已结束');
                    const next = this.makeSession(
                        Object.assign({}, current, {
                            mode: 'range',
                            startAt,
                            endAt: Date.now(),
                        }),
                    );
                    const problem = this.sessionError(next, active.id);
                    if (problem) throw new Error(problem);
                    current.startAt = startAt;
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
                const running = includeActive ? this.runningSessions() : [];
                const liveIds = new Set(running.map(/** @param {any} s */ (s) => s.id));
                const sessions = this.state.sessions.concat(
                    running.map(
                        /** @param {any} s */ (s) =>
                            this.makeSession(
                                Object.assign({}, s, { mode: 'range', endAt: Date.now() }),
                            ),
                    ),
                );
                sessions.forEach(
                    /** @param {any} session */
                    (session) => {
                        const roster = this.rosterOf(session);
                        const single = !!charId && charId !== 'all';
                        if (single && !roster.includes(charId)) return;
                        /*
                         * 单角色视角只看自己那一份点卡；「全部角色」看整段，不能按人头翻倍。
                         *
                         * 分摊必须与 `syncSession` 写流水时用同一个函数：那里是
                         * `U.splitAmount`（尾差给前几位，合计永远等于总价），早先这里用
                         * `cost / 人数` 再整体四舍五入，0.03 这类小额会出现「统计扣 0.02、
                         * 流水只有 0.01」的对不上的情况。
                         */
                        const shareIndex = single ? Math.max(0, roster.indexOf(charId)) : -1;
                        const slices = this.sessionSlices(session).filter(
                            (s) => (!from || s.date >= from) && (!to || s.date <= to),
                        );
                        if (!slices.length) return;
                        result.count++;
                        slices.forEach((slice) => {
                            const share =
                                shareIndex < 0
                                    ? slice.cost
                                    : U.splitAmount(slice.cost, roster.length)[shareIndex];
                            result.minutes += slice.minutes;
                            result.cost += share;
                            if (liveIds.has(session.id)) result.liveCost += share;
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
                const single = !!charId && charId !== 'all';
                const running = this.runningSessions();
                if (!running.length) return stats;
                running.forEach(
                    /** @param {any} active */ (active) => {
                        const roster = this.rosterOf(active);
                        if (single && !roster.includes(charId)) return;
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
                    },
                );
                stats.net = stats.income - stats.expense;
                stats.hourly =
                    stats.onlineMinutes > 0 ? stats.net / (stats.onlineMinutes / 60) : null;
                return stats;
            },
        }),
    );
}
