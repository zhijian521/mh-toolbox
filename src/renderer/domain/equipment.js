// @ts-check
// Migrated from the immutable v1 baseline; see docs/SYNC.md.

/** @typedef {Partial<Domain> & ThisType<Domain>} EquipmentMixin */

/**
 * @param {Domain} D
 * @param {any} U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, U, _gateway, _localStorage) {
    /* 装备资产与穿戴方案分开保存：方案只引用装备 ID，不复制档案和成本。 */
    Object.assign(
        D,
        /** @type {EquipmentMixin} */ ({
            equipmentGroups: {
                gear: {
                    name: '常规装备',
                    slots: ['头盔', '项链', '武器', '衣服', '腰带', '鞋子'],
                },
                accessory: { name: '灵饰', slots: ['戒指', '耳饰', '手镯', '佩饰'] },
                jade: { name: '玉魄', slots: ['玉魄·阳', '玉魄·阴'] },
            },
            equipmentStatuses: {
                active: '当前穿戴',
                standby: '其他方案备用',
                stored: '未配置',
                sold: '已出售',
            },
            equipmentSetNames: ['方案一', '方案二', '方案三'],
            soulAttributes: ['抵抗封印命中率', '气血回复效果', '抗物理暴击率', '抗法术暴击率'],

            /** @this {Domain} @param {string} slot @returns {boolean} */
            isJade(slot) {
                return this.equipmentGroups.jade.slots.includes(slot);
            },

            /**
             * 首次访问时补齐全套方案结构；旧档缺少的字段在此一次收敛。
             *
             * @this {Domain}
             * @param {string} characterId
             * @returns {any}
             */
            equipmentProfile(characterId) {
                const character = this.charById(characterId);
                if (!character) throw new Error('角色不存在');
                if (!character.equipmentSets) {
                    character.equipmentSets = this.equipmentSetNames.map(
                        (/** @type {string} */ name) => ({ name, slots: {} }),
                    );
                    character.viewedEquipmentSet = 0;
                    character.pendingEquipmentSlots = [];
                    character.soulJade = {
                        unlocked: false,
                        attribute: this.soulAttributes[0],
                        level: 0,
                    };
                }
                return character;
            },

            /**
             * @this {Domain}
             * @param {any} state
             * @param {any} original
             * @returns {any}
             */
            normalizeEquipment(state, original) {
                const wearable = Object.values(this.equipmentGroups).flatMap(
                    (/** @type {any} */ group) => group.slots,
                );
                const equipmentById = new Map(
                    state.equipment.map((/** @type {any} */ eq) => [eq.id, eq]),
                );
                state.equipment.forEach((/** @type {any} */ eq) => {
                    // 读取路径不能抛错：旧版本写入的任一非法值都会让整份 data.json 打不开。
                    // 这里按无损修复收敛属性，无法表示的内容逐行留在 legacy 原文里；
                    // 交互保存路径（saveEquipment / importEquipment）仍走严格校验。
                    if (eq.details)
                        eq.details = this.repairEquipmentDetails(eq.slot, eq.level, eq.details);
                    if (!eq.jade || typeof eq.jade !== 'object') return;
                    const jade = eq.jade;
                    eq.jade = {
                        base: String(jade.base || ''),
                        extra1: String(jade.extra1 || ''),
                        extra2: String(jade.extra2 || ''),
                        dustLevel: Math.max(
                            0,
                            Math.min(17, Math.trunc(Number(jade.dustLevel) || 0)),
                        ),
                        holes: Math.max(0, Math.min(3, Math.trunc(Number(jade.holes) || 0))),
                        enchantments: Array.isArray(jade.enchantments)
                            ? jade.enchantments.map(String).slice(0, 3)
                            : [],
                        durability:
                            Number.isInteger(jade.durability) &&
                            jade.durability >= 0 &&
                            jade.durability <= 300
                                ? jade.durability
                                : '',
                    };
                });
                state.characters.forEach((/** @type {any} */ character) => {
                    const previous = Array.isArray(character.equipmentSets)
                        ? character.equipmentSets
                        : [];
                    character.equipmentSets = this.equipmentSetNames.map(
                        (/** @type {string} */ name, /** @type {number} */ index) => {
                            const set = previous[index] || {};
                            /** @type {Record<string, string>} */
                            const slots = {};
                            wearable.forEach((/** @type {string} */ slot) => {
                                const eq = equipmentById.get(set.slots && set.slots[slot]);
                                if (
                                    eq &&
                                    eq.characterId === character.id &&
                                    eq.slot === slot &&
                                    eq.status !== 'sold'
                                )
                                    slots[slot] = eq.id;
                            });
                            return { name: String(set.name || name).slice(0, 20), slots };
                        },
                    );
                    /*
                     * 「在看哪套」就是「在穿哪套」：一个号身上只有一套衣服，另外两套是摆在
                     * 衣柜里的搭配草案。以前把它们拆成 active / viewed 两个字段，界面上就要
                     * 多出「使用中」「使用此套」两个开关，而玩家从来没为此纠结过——切到哪套
                     * 看，那套就是身上这套。旧档里的 active 直接丢弃，按 viewed 归一。
                     */
                    character.viewedEquipmentSet = [0, 1, 2].includes(character.viewedEquipmentSet)
                        ? character.viewedEquipmentSet
                        : 0;
                    delete character.activeEquipmentSet;
                    character.pendingEquipmentSlots = Array.isArray(character.pendingEquipmentSlots)
                        ? character.pendingEquipmentSlots.filter((/** @type {string} */ slot) =>
                              wearable.includes(slot),
                          )
                        : [];
                    const soul = character.soulJade || {};
                    character.soulJade = {
                        unlocked: !!soul.unlocked,
                        attribute: this.soulAttributes.includes(soul.attribute)
                            ? soul.attribute
                            : this.soulAttributes[0],
                        level: Math.max(0, Math.min(15, Math.trunc(Number(soul.level) || 0))),
                    };
                    // 旧版“在用”不保证部位唯一：冲突留待用户选择，不能猜测覆盖。
                    if (
                        !previous.length &&
                        (!original.schemaVersion || original.schemaVersion < 4)
                    ) {
                        wearable.forEach((/** @type {string} */ slot) => {
                            const candidates = state.equipment.filter(
                                (/** @type {any} */ eq) =>
                                    eq.characterId === character.id &&
                                    eq.slot === slot &&
                                    eq.status === 'active',
                            );
                            if (candidates.length === 1)
                                character.equipmentSets[0].slots[slot] = candidates[0].id;
                            if (candidates.length > 1) character.pendingEquipmentSlots.push(slot);
                        });
                    }
                    if (
                        character.equipmentSets.some((/** @type {any} */ set) =>
                            this.equipmentGroups.jade.slots.some(
                                (/** @type {string} */ slot) => set.slots[slot],
                            ),
                        )
                    ) {
                        character.soulJade.unlocked = true;
                    }
                });
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @returns {any[]}
             */
            equipmentReferences(id) {
                const eq = this.equipmentById(id);
                if (!eq || !this.charById(eq.characterId)) return [];
                return this.equipmentReferenceIndex(eq.characterId).get(id) || [];
            },

            /**
             * @this {Domain}
             * @param {string} characterId
             * @returns {Map<string, any[]>}
             */
            equipmentReferenceIndex(characterId) {
                const profile = this.equipmentProfile(characterId);
                /** @type {Map<string, any[]>} */
                const index = new Map();
                profile.equipmentSets.forEach(
                    (/** @type {any} */ set, /** @type {number} */ number) => {
                        Object.values(set.slots).forEach((/** @type {any} */ id) => {
                            if (!index.has(id)) index.set(id, []);
                            const bucket = /** @type {any[]} */ (index.get(id));
                            bucket.push({
                                characterId,
                                index: number,
                                name: set.name,
                                active: profile.viewedEquipmentSet === number,
                            });
                        });
                    },
                );
                return index;
            },

            /**
             * 由持有数量与状态派生出「在装 / 备用 / 已售」等展示口径。
             *
             * 默认参数里不能写 this.equipmentReferences：默认参数表达式在函数体外先求值，
             * 拿不到 this 的类型标注，因此在这里判空后再回取。
             *
             * @this {Domain}
             * @param {any} eq
             * @param {any[]} [references]
             * @returns {string}
             */
            equipmentStatus(eq, references) {
                if (eq.status === 'sold') return 'sold';
                const list =
                    references === undefined ? this.equipmentReferences(eq.id) : references;
                if (list.some((/** @type {any} */ reference) => reference.active)) return 'active';
                return list.length ? 'standby' : 'stored';
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @returns {any}
             */
            equipmentById(id) {
                const list = this.state.equipment;
                if (this._equipmentList !== list || this._equipmentSize !== list.length) {
                    this._equipmentList = list;
                    this._equipmentSize = list.length;
                    this._equipmentIndex = new Map(
                        list.map((/** @type {any} */ item) => [item.id, item]),
                    );
                }
                return this._equipmentIndex?.get(id);
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @returns {void}
             */
            clearEquipmentReferences(id) {
                this.state.characters.forEach((/** @type {any} */ character) => {
                    this.equipmentProfile(character.id).equipmentSets.forEach(
                        (/** @type {any} */ set) => {
                            Object.keys(set.slots).forEach((/** @type {string} */ slot) => {
                                if (set.slots[slot] === id) delete set.slots[slot];
                            });
                        },
                    );
                });
            },

            /**
             * @this {Domain}
             * @param {string} characterId
             * @param {number} index
             * @param {string} slot
             * @param {string} id
             * @returns {void}
             */
            assignEquipment(characterId, index, slot, id) {
                const character = this.equipmentProfile(characterId);
                const set = character.equipmentSets[index];
                if (!set || !this.slots.includes(slot) || slot === '其他')
                    throw new Error('无效的装备方案或部位');
                if (id) {
                    const eq = this.state.equipment.find(
                        (/** @type {any} */ item) => item.id === id,
                    );
                    if (
                        !eq ||
                        eq.characterId !== characterId ||
                        eq.slot !== slot ||
                        eq.status === 'sold'
                    ) {
                        throw new Error('请选择当前角色对应部位的持有装备');
                    }
                    if (this.isJade(slot) && !character.soulJade.unlocked)
                        throw new Error('请先设置命魂之玉为已解锁');
                    set.slots[slot] = id;
                } else {
                    delete set.slots[slot];
                }
                if (index === 0)
                    character.pendingEquipmentSlots = character.pendingEquipmentSlots.filter(
                        (/** @type {string} */ item) => item !== slot,
                    );
            },

            /**
             * @this {Domain}
             * @param {string} characterId
             * @param {number} from
             * @param {number} to
             * @returns {void}
             */
            copyEquipmentSet(characterId, from, to) {
                const character = this.equipmentProfile(characterId);
                if (![0, 1, 2].includes(from) || ![0, 1, 2].includes(to) || from === to)
                    throw new Error('请选择另一套方案');
                character.equipmentSets[to].slots = Object.assign(
                    {},
                    character.equipmentSets[from].slots,
                );
                if (to === 0) character.pendingEquipmentSlots = [];
            },

            /**
             * 三套方案改名。
             *
             * 名称只是标签，不参与搭配与账本；但会出现在选装弹窗标题、仓库的「已在本套」
             * 提示和详情页里，空名或重名会让这些地方出现空白标题、或分不清指的是哪一套，
             * 所以三条一起校验完再写。
             *
             * @this {Domain}
             * @param {string} characterId
             * @param {string[]} names 三条名称，顺序与方案一致
             * @returns {void}
             */
            renameEquipmentSet(characterId, names) {
                const character = this.equipmentProfile(characterId);
                const total = character.equipmentSets.length;
                if (!Array.isArray(names) || names.length !== total)
                    throw new Error('请填写 ' + total + ' 套方案的名称');
                const trimmed = names.map((name) => String(name == null ? '' : name).trim());
                if (trimmed.some((name) => !name)) throw new Error('方案名称不能为空');
                if (trimmed.some((name) => name.length > 20))
                    throw new Error('方案名称最多 20 个字');
                if (new Set(trimmed).size !== trimmed.length) throw new Error('方案名称不能重复');
                character.equipmentSets.forEach(
                    (/** @type {any} */ set, /** @type {number} */ index) => {
                        set.name = trimmed[index];
                    },
                );
            },

            /**
             * @this {Domain}
             * @param {any} data
             * @param {string} [id]
             * @returns {any}
             */
            saveEquipment(data, id) {
                const previous =
                    id && this.state.equipment.find((/** @type {any} */ eq) => eq.id === id);
                if (id && !previous) throw new Error('装备档案不存在');
                if (
                    !this.charById(data.characterId) ||
                    !this.slots.includes(data.slot) ||
                    !String(data.name || '').trim()
                ) {
                    throw new Error('请填写有效角色、部位和装备名称');
                }
                if (
                    previous &&
                    previous.characterId !== data.characterId &&
                    this.state.transactions.some((/** @type {any} */ tx) => tx.equipmentId === id)
                ) {
                    throw new Error('该装备已关联账号流水，请先解除流水关联再更改角色');
                }
                if (data.details) {
                    this.validateEquipmentDetails(data.slot, data.level, data.details);
                    const details = JSON.parse(JSON.stringify(data.details));
                    data = Object.assign(
                        {},
                        data,
                        this.equipmentDetailsSnapshot(data.slot, details),
                        { details },
                    );
                } else if (this.isJade(data.slot)) {
                    const jade = data.jade;
                    if (
                        !jade ||
                        ![jade.base, jade.extra1, jade.extra2].every(
                            (/** @type {any} */ attribute) => String(attribute || '').trim(),
                        )
                    ) {
                        throw new Error('请填写玉魄的一条基础属性和两条附加属性');
                    }
                    if (
                        !Number.isInteger(jade.dustLevel) ||
                        jade.dustLevel < 0 ||
                        jade.dustLevel > 17 ||
                        !Number.isInteger(jade.holes) ||
                        jade.holes < 1 ||
                        jade.holes > 3
                    ) {
                        throw new Error('灵尘等级需为 0～17 的整数，开光孔需为 1～3 个');
                    }
                    if (!Array.isArray(jade.enchantments)) throw new Error('请填写有效的开光信息');
                    if (
                        jade.durability !== '' &&
                        (!Number.isInteger(jade.durability) ||
                            jade.durability < 0 ||
                            jade.durability > 300)
                    ) {
                        throw new Error('耐久需为 0～300 的整数');
                    }
                }
                const eq = Object.assign(
                    {},
                    previous || { id: U.uid(), createdAt: Date.now() },
                    data,
                    { name: data.name.trim() },
                );
                // `standby` 由 equipmentStatus() 派生而不是用户填写，但表单会把这个派生值
                // 原样回传，因此必须允许它写回。
                if (!Object.keys(this.equipmentStatuses).includes(eq.status))
                    throw new Error('无效的装备持有状态');
                if (
                    previous &&
                    (previous.slot !== eq.slot ||
                        previous.characterId !== eq.characterId ||
                        eq.status === 'sold')
                ) {
                    this.clearEquipmentReferences(id);
                }
                if (!this.isJade(eq.slot)) delete eq.jade;
                if (previous) Object.assign(previous, eq);
                else this.state.equipment.push(eq);
                if (previous && !this.isJade(eq.slot)) delete previous.jade;
                this.state.gearLogs
                    .filter((/** @type {any} */ log) => log.equipmentId === eq.id)
                    .forEach((/** @type {any} */ log) => {
                        log.characterId = eq.characterId;
                    });
                return previous || eq;
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @returns {void}
             */
            removeEquipment(id) {
                this.clearEquipmentReferences(id);
                this.state.equipment = this.state.equipment.filter(
                    (/** @type {any} */ eq) => eq.id !== id,
                );
                this.state.gearLogs = this.state.gearLogs.filter(
                    (/** @type {any} */ log) => log.equipmentId !== id,
                );
                this.state.transactions.forEach((/** @type {any} */ tx) => {
                    if (tx.equipmentId === id) {
                        delete tx.equipmentId;
                        delete tx.gearAction;
                    }
                });
            },

            /**
             * @this {Domain}
             * @param {string} id
             * @param {any} data
             * @returns {Promise<any>}
             */
            recordEquipmentChange(id, data) {
                return this.commitEquipment(() => {
                    const eq = this.equipmentById(id);
                    if (!eq) throw new Error('装备档案已删除');
                    const action = this.gearAction(data.action);
                    if (data.sync && action.dir !== 0) {
                        const tx = {
                            id: U.uid(),
                            ledger: 'account',
                            recordType: 'money',
                            characterId: eq.characterId,
                            date: data.date,
                            kind: action.dir > 0 ? 'income' : 'expense',
                            currency: data.currency,
                            category: ['craft', 'gem', 'dust', 'consecrate'].includes(data.action)
                                ? '养成投入'
                                : '装备交易',
                            amount: data.amount || 0,
                            fee: 0,
                            minutes: 0,
                            channel: data.channel,
                            equipmentId: id,
                            gearAction: data.action,
                            note: data.note || '装备「' + eq.name + '」' + action.t,
                            createdAt: Date.now(),
                        };
                        this.state.transactions.push(tx);
                        this.syncAccountEquipment(tx);
                    } else {
                        this.state.gearLogs.push({
                            id: U.uid(),
                            equipmentId: id,
                            characterId: eq.characterId,
                            date: data.date,
                            action: data.action,
                            amount: data.amount || 0,
                            currency: data.currency,
                            note: data.note || '',
                            synced: false,
                            createdAt: Date.now(),
                        });
                        this.syncEquipmentStatus(id);
                    }
                });
            },

            /**
             * 装备操作写入失败时恢复内存，防止重复提交留下半套方案或重复流水。
             *
             * @this {Domain}
             * @param {() => any} change
             * @returns {Promise<any>}
             */
            async commitEquipment(change) {
                return this.commit(change);
            },
        }),
    );
}
