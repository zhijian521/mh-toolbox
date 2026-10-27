// @ts-check
// Migrated from the immutable v1 baseline; see migration/baseline.json.

/** @typedef {Partial<Domain> & ThisType<Domain>} CharactersMixin */

/** @typedef {{ from?: string, to?: string }} DateRange */

/**
 * 技能与修炼按运行时的字符串键取值（键来自 growth.js 的指标定义），因此按下标
 * 访问养成数据时需要放宽成字典；静态两侧仍由 CharacterProgress 守着。
 *
 * @param {CharacterProgress} progress
 * @returns {Record<string, any>}
 */
function indexed(progress) {
    return /** @type {Record<string, any>} */ (/** @type {unknown} */ (progress));
}

/**
 * 角色名下的装备 id。删除联动与删除预览都从这里取，避免两处口径漂移。
 *
 * @param {Domain} D
 * @param {string} id
 * @returns {Set<string>}
 */
function ownedEquipmentIds(D, id) {
    return new Set(
        D.state.equipment
            .filter((/** @type {any} */ eq) => eq.characterId === id)
            .map((/** @type {any} */ eq) => eq.id),
    );
}

/**
 * @param {Domain} D
 * @param {any} U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, U, _gateway, _localStorage) {
    /* 角色档案与技能养成。 */
    Object.assign(
        D,
        /** @type {CharactersMixin} */ ({
            /**
             * 未记录值与明确填写的 0 分开保存。
             *
             * @this {Domain}
             * @param {any} value
             * @returns {number | null}
             */
            characterNumber(value) {
                if (value == null || (typeof value === 'string' && !value.trim())) return null;
                if (!['number', 'string'].includes(typeof value)) return null;
                const number = Number(value);
                return Number.isSafeInteger(number) && number >= 0 ? number : null;
            },

            /**
             * @this {Domain}
             * @param {any} value
             * @returns {CharacterProgress}
             */
            normalizeCharacterProgress(value) {
                const data = value && typeof value === 'object' ? value : {};
                /**
                 * @param {any} list
                 * @returns {SkillEntry[]}
                 */
                const skills = (list) =>
                    Array.isArray(list)
                        ? list
                              .filter(
                                  (/** @type {any} */ skill) =>
                                      skill && typeof skill.name === 'string' && skill.name.trim(),
                              )
                              .map((/** @type {any} */ skill) => ({
                                  name: skill.name.trim(),
                                  level: this.characterNumber(skill.level),
                              }))
                        : [];
                /**
                 * @param {string} key
                 * @param {Array<{ key: string, label: string }>} fields
                 * @returns {Record<string, number | null>}
                 */
                const training = (key, fields) =>
                    Object.fromEntries(
                        fields.map((field) => [
                            field.key,
                            this.characterNumber(data[key] && data[key][field.key]),
                        ]),
                    );
                return {
                    schoolSkills: skills(data.schoolSkills),
                    auxiliarySkills: skills(data.auxiliarySkills),
                    training: training('training', this.characterTraining),
                    petTraining: training('petTraining', this.petTraining),
                    qianyuanPills: this.characterNumber(data.qianyuanPills),
                    potentialFruits: this.characterNumber(data.potentialFruits),
                    note: typeof data.note === 'string' ? data.note : '',
                };
            },

            /**
             * @this {Domain}
             * @param {any} value
             * @returns {any[]}
             */
            normalizeCharacterHistory(value) {
                if (!Array.isArray(value)) return [];
                /** @param {any} text @returns {string} */
                const text = (text) => (typeof text === 'string' ? text : '');
                /** @param {any} snapshot @returns {any} */
                const snapshot = (snapshot) =>
                    typeof snapshot === 'string' ? snapshot : this.characterNumber(snapshot);
                return value
                    .filter(
                        (/** @type {any} */ entry) =>
                            entry &&
                            typeof entry.id === 'string' &&
                            typeof entry.date === 'string' &&
                            /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
                            U.fmtDate(U.parseDate(entry.date)) === entry.date &&
                            Array.isArray(entry.changes),
                    )
                    .map((/** @type {any} */ entry) => ({
                        id: entry.id,
                        date: entry.date,
                        createdAt: this.characterNumber(entry.createdAt) ?? 0,
                        source: entry.source === 'copy' ? 'copy' : 'edit',
                        sourceName: text(entry.sourceName),
                        note: text(entry.note),
                        changes: entry.changes
                            .filter(
                                (/** @type {any} */ change) =>
                                    change && typeof change.label === 'string',
                            )
                            .map((/** @type {any} */ change) => ({
                                group: text(change.group),
                                label: change.label,
                                from: snapshot(change.from),
                                to: snapshot(change.to),
                                unit: text(change.unit),
                                kind: [
                                    'added',
                                    'removed',
                                    'recorded',
                                    'cleared',
                                    'increase',
                                    'decrease',
                                    'changed',
                                ].includes(change.kind)
                                    ? change.kind
                                    : 'changed',
                            })),
                    }))
                    .filter((/** @type {any} */ entry) => entry.changes.length);
            },

            /**
             * @this {Domain}
             * @param {any} previous
             * @param {any} saved
             * @returns {any[]}
             */
            characterGrowthChanges(previous, saved) {
                /** @type {any[]} */
                const changes = [];
                /**
                 * @param {string} group
                 * @param {any} label
                 * @param {any} from
                 * @param {any} to
                 * @param {string} [unit]
                 * @param {string} [kind]
                 */
                const add = (group, label, from, to, unit = '', kind) => {
                    if (from === to && !kind) return;
                    kind =
                        kind ||
                        (from == null
                            ? 'recorded'
                            : to == null
                              ? 'cleared'
                              : typeof from === 'number' && typeof to === 'number'
                                ? to > from
                                    ? 'increase'
                                    : 'decrease'
                                : 'changed');
                    changes.push({ group, label, from, to, unit, kind });
                };
                /**
                 * @param {string} category
                 * @param {string} key
                 * @param {any} from
                 * @param {any} to
                 * @param {string} [kind]
                 */
                const addMetric = (category, key, from, to, kind) => {
                    const metric = this.growthMetric(category, key);
                    add(metric.group, metric.label, from, to, metric.unit, kind);
                };
                addMetric('level', '', this.characterNumber(previous.level), saved.level);
                add('基础信息', '门派', previous.school || null, saved.school || null);
                const before = indexed(this.normalizeCharacterProgress(previous.progress)),
                    after = indexed(saved.progress);
                for (const key of ['schoolSkills', 'auxiliarySkills']) {
                    const oldSkills = new Map(
                        before[key].map((/** @type {any} */ skill) => [skill.name, skill.level]),
                    );
                    const newSkills = new Map(
                        after[key].map((/** @type {any} */ skill) => [skill.name, skill.level]),
                    );
                    for (const [name, level] of newSkills) {
                        addMetric(
                            key,
                            name,
                            oldSkills.get(name) ?? null,
                            level,
                            oldSkills.has(name) ? undefined : 'added',
                        );
                    }
                    for (const [name, level] of oldSkills) {
                        if (!newSkills.has(name)) addMetric(key, name, level, null, 'removed');
                    }
                }
                for (const key of ['training', 'petTraining']) {
                    for (const field of this.growthCategory(key)?.fields || [])
                        addMetric(key, field.key, before[key][field.key], after[key][field.key]);
                }
                for (const key of ['qianyuanPills', 'potentialFruits'])
                    addMetric(key, '', before[key], after[key]);
                return changes;
            },

            /**
             * @this {Domain}
             * @param {any} previous
             * @param {any} saved
             * @param {any} [record]
             * @returns {any}
             */
            characterGrowthEntry(previous, saved, record = {}) {
                const changes = this.characterGrowthChanges(previous, saved);
                if (!changes.length) return null;
                const date = record.date === undefined ? U.today() : record.date;
                if (
                    typeof date !== 'string' ||
                    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
                    U.fmtDate(U.parseDate(date)) !== date
                ) {
                    throw new Error('请选择有效的变更日期');
                }
                if (date > U.today()) throw new Error('变更日期不能晚于今天');
                return {
                    id: U.uid(),
                    date,
                    createdAt: Date.now(),
                    source: 'edit',
                    sourceName: '',
                    note: typeof record.note === 'string' ? record.note.trim() : '',
                    changes,
                };
            },

            /**
             * 同毫秒保存时，稳定排序保留后追加的记录在前，不按随机 ID 推断先后。
             *
             * @this {Domain}
             * @param {string} [characterId]
             * @param {DateRange} [range]
             * @returns {any[]}
             */
            characterGrowthHistory(characterId = 'all', range = {}) {
                return this.state.characters
                    .filter(
                        (/** @type {any} */ character) =>
                            characterId === 'all' || character.id === characterId,
                    )
                    .flatMap((/** @type {any} */ character) =>
                        (character.growthHistory || [])
                            .slice()
                            .reverse()
                            .filter(
                                (/** @type {any} */ entry) =>
                                    (!range.from || entry.date >= range.from) &&
                                    (!range.to || entry.date <= range.to),
                            )
                            .map((/** @type {any} */ entry) => ({
                                ...entry,
                                characterId: character.id,
                                characterName: character.name,
                            })),
                    )
                    .sort(
                        (/** @type {any} */ a, /** @type {any} */ b) =>
                            b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
                    );
            },

            /**
             * @this {Domain}
             * @param {any[]} [characters]
             * @returns {any[]}
             */
            orderedCharacters(characters) {
                return this.orderedCards(
                    characters === undefined ? this.state.characters : characters,
                );
            },

            /** @this {Domain} @param {string} id @param {any} changes @returns {Promise<any>} */
            saveCharacterOrder(id, changes) {
                return this.commit(() => this.moveCard(this.state.characters, id, changes));
            },

            /**
             * 新建和编辑角色只在写入成功后确认；失败恢复角色集合，表单可直接重试。
             *
             * @this {Domain}
             * @param {any} data
             * @param {string} [id]
             * @param {any} [record]
             * @returns {Promise<any>}
             */
            saveCharacter(data, id, record = {}) {
                return this.commit(() => this.applyCharacter(data, id, record));
            },

            /**
             * @this {Domain}
             * @param {any} data
             * @param {string} [id]
             * @param {any} [record]
             * @returns {any}
             */
            applyCharacter(data, id, record = {}) {
                const previous = id && this.charById(id);
                if (id && !previous) throw new Error('角色不存在');
                const name = String(
                    data.name == null ? (previous && previous.name) || '' : data.name,
                ).trim();
                if (!name) throw new Error('请填写角色昵称');
                const level = data.level === undefined && previous ? previous.level : data.level;
                if (level != null && level !== '' && this.characterNumber(level) === null)
                    throw new Error('角色等级需填写非负整数');
                if (data.progress !== undefined) this.validateCharacterProgress(data.progress);
                const saved = Object.assign(
                    {},
                    previous || { id: U.uid(), createdAt: Date.now(), sortOrder: 0 },
                    {
                        name,
                        level: this.characterNumber(level),
                        school:
                            data.school === undefined && previous
                                ? previous.school
                                : data.school || '',
                        server:
                            data.server === undefined && previous
                                ? previous.server
                                : String(data.server || '').trim(),
                        progress: this.normalizeCharacterProgress(
                            data.progress === undefined && previous
                                ? previous.progress
                                : data.progress,
                        ),
                        growthHistory: previous ? (previous.growthHistory || []).slice() : [],
                    },
                );
                const entry = previous && this.characterGrowthEntry(previous, saved, record);
                if (entry) saved.growthHistory.push(entry);
                if (previous) {
                    this.state.characters = this.state.characters.map(
                        (/** @type {any} */ character) => (character.id === id ? saved : character),
                    );
                } else {
                    const positions = new Map(
                        this.orderedCharacters().map(
                            (/** @type {any} */ item, /** @type {number} */ index) => [
                                item.id,
                                index + 1,
                            ],
                        ),
                    );
                    this.state.characters = [
                        ...this.state.characters.map((/** @type {any} */ item) =>
                            positions.has(item.id)
                                ? Object.assign({}, item, { sortOrder: positions.get(item.id) })
                                : item,
                        ),
                        saved,
                    ];
                }
                this.equipmentProfile(saved.id);
                return saved;
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @param {any} changes
             * @param {any} [record]
             * @returns {Promise<any>}
             */
            async saveCharacterProgress(id, changes, record = {}) {
                return this.commit(() => {
                    const character = this.charById(id);
                    if (!character) throw new Error('角色不存在');
                    return this.applyCharacter(
                        {
                            progress: Object.assign(
                                {},
                                this.normalizeCharacterProgress(character.progress),
                                changes,
                            ),
                        },
                        id,
                        record,
                    );
                });
            },

            /**
             * @this {Domain}
             * @param {any} character
             * @param {string} category
             * @param {string} key
             * @returns {{ group: string, label: string, unit: string, value: number | null }}
             */
            characterProgressMetric(character, category, key) {
                const { group, label, unit } = this.growthMetric(category, key);
                return {
                    group,
                    label,
                    unit,
                    value: this.growthValue(character, category, key, { requireSkill: true }),
                };
            },

            /**
             * 单项编辑在提交队列内读取最新档案，按技能名称定位，保留其余项目及顺序。
             *
             * @this {Domain}
             * @param {string} id
             * @param {string} category
             * @param {string} key
             * @param {any} input
             * @param {any} [record]
             * @returns {Promise<any>}
             */
            saveCharacterValue(id, category, key, input, record = {}) {
                return this.commit(() => {
                    const character = this.charById(id);
                    return this.applyCharacter(
                        this.characterValueChanges(character, category, key, input),
                        id,
                        record,
                    );
                });
            },

            /**
             * @this {Domain}
             * @param {any} changes
             * @returns {void}
             */
            validateCharacterProgress(changes) {
                if (!changes || typeof changes !== 'object' || Array.isArray(changes))
                    throw new Error('养成记录格式不正确');
                const progress = this.normalizeCharacterProgress();
                /**
                 * @param {any} value
                 * @param {string} label
                 */
                const checkNumber = (value, label) => {
                    if (value != null && value !== '' && this.characterNumber(value) === null)
                        throw new Error(label + '需填写非负整数');
                };
                for (const [key, value] of Object.entries(changes)) {
                    if (!Object.hasOwn(progress, key)) throw new Error('未知的角色养成项目');
                    if (['schoolSkills', 'auxiliarySkills'].includes(key)) {
                        if (!Array.isArray(value)) throw new Error('技能记录格式不正确');
                        /** @type {Set<string>} */
                        const names = new Set();
                        value.forEach((/** @type {any} */ skill) => {
                            if (!skill || typeof skill.name !== 'string' || !skill.name.trim())
                                throw new Error('请填写技能名称');
                            const name = skill.name.trim();
                            if (names.has(name)) throw new Error('技能名称重复：' + name);
                            names.add(name);
                            checkNumber(skill.level, name + '等级');
                        });
                    } else if (key === 'training' || key === 'petTraining') {
                        const fields =
                            key === 'training' ? this.characterTraining : this.petTraining;
                        if (!value || typeof value !== 'object')
                            throw new Error('修炼记录格式不正确');
                        fields.forEach((field) => checkNumber(value[field.key], field.label));
                    } else if (key !== 'note') {
                        checkNumber(value, key === 'qianyuanPills' ? '乾元丹数量' : '潜能果数量');
                    }
                }
            },

            /**
             * 角色删除会连带清掉的关联记录统计，供删除确认展示。
             * 与 removeCharacter 共用 ownedEquipmentIds，口径必须一致：四个按
             * characterId 归属的集合、该角色装备的变更日志（含按装备 id 反查），
             * 以及进行中的在线计时。
             *
             * @this {Domain}
             * @param {string} id
             * @returns {{ transactions: number, sessions: number, goals: number, equipment: number, gearLogs: number, activeSession: number, total: number }}
             */
            characterRemovalSummary(id) {
                const equipmentIds = ownedEquipmentIds(this, id);
                const counts = {
                    transactions: this.state.transactions.filter(
                        (/** @type {any} */ item) => item.characterId === id,
                    ).length,
                    sessions: this.state.sessions.filter(
                        (/** @type {any} */ item) => item.characterId === id,
                    ).length,
                    goals: this.state.goals.filter(
                        (/** @type {any} */ item) => item.characterId === id,
                    ).length,
                    equipment: equipmentIds.size,
                    gearLogs: this.state.gearLogs.filter(
                        (/** @type {any} */ log) =>
                            log.characterId === id || equipmentIds.has(log.equipmentId),
                    ).length,
                    activeSession:
                        this.state.activeSession && this.state.activeSession.characterId === id
                            ? 1
                            : 0,
                };
                return {
                    ...counts,
                    total:
                        counts.transactions +
                        counts.sessions +
                        counts.goals +
                        counts.equipment +
                        counts.gearLogs +
                        counts.activeSession,
                };
            },

            /**
             * 角色删除与全部关联记录一并落盘，失败时整体恢复。
             *
             * @this {Domain}
             * @param {string} id
             * @returns {Promise<any>}
             */
            async removeCharacter(id) {
                return this.commit(() => {
                    if (!this.charById(id)) throw new Error('角色不存在');
                    const equipmentIds = ownedEquipmentIds(this, id);
                    this.state.characters = this.state.characters.filter(
                        (/** @type {any} */ character) => character.id !== id,
                    );
                    /** @type {Array<'transactions' | 'sessions' | 'goals' | 'equipment'>} */
                    const scoped = ['transactions', 'sessions', 'goals', 'equipment'];
                    scoped.forEach((key) => {
                        this.state[key] = this.state[key].filter(
                            (/** @type {any} */ item) => item.characterId !== id,
                        );
                    });
                    this.state.gearLogs = this.state.gearLogs.filter(
                        (/** @type {any} */ log) =>
                            log.characterId !== id && !equipmentIds.has(log.equipmentId),
                    );
                    if (this.state.activeSession && this.state.activeSession.characterId === id)
                        this.state.activeSession = null;
                });
            },
        }),
    );
}
