// @ts-check
// Migrated from the immutable v1 baseline; see migration/baseline.json.

/** @typedef {Partial<Domain> & ThisType<Domain>} EquipmentImportMixin */

/** 截图解析出来的草稿：字段按解析结果动态写入，因此放开索引。 */
/** @typedef {Record<string, any>} EquipmentDraft */

/**
 * @param {Domain} D
 * @param {any} _U
 * @param {unknown} _gateway
 * @param {unknown} _localStorage
 */
export default function install(D, _U, _gateway, _localStorage) {
    /* 截图文字解析与批量建档：保留原文，不推算属性或成交成本。 */
    Object.assign(
        D,
        /** @type {EquipmentImportMixin} */ ({
            equipmentImportLimits: {
                count: 30,
                bytes: 16 * 1024 * 1024,
                pixels: 16 * 1024 * 1024,
            },

            /**
             * @this {Domain}
             * @param {string} text
             * @returns {EquipmentDraft}
             */
            parseEquipmentText(text) {
                const raw = String(text).slice(0, 20000);
                const lines = raw
                    .normalize('NFKC')
                    .replace(/[：﹕]/g, ':')
                    .replace(/[﹢＋]/g, '+')
                    .replace(/(?<=[\u4e00-\u9fff])[ \t\u3000]+(?=[\u4e00-\u9fff])/g, '')
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter(Boolean);
                /** @type {EquipmentDraft} */
                const draft = {
                    name: '',
                    slot: '',
                    level: '',
                    attributes: '',
                    special: '',
                    gems: '',
                    note: '',
                    jadeBase: '',
                    jadeExtra1: '',
                    jadeExtra2: '',
                    dustLevel: '',
                    holes: '',
                    durability: '',
                    hole1: '',
                    hole2: '',
                    hole3: '',
                    ocrText: raw,
                };
                /** @type {string[]} */
                const attributes = [],
                    /** @type {string[]} */
                    special = [],
                    /** @type {string[]} */
                    notes = [];
                let section = '';
                for (const line of lines) {
                    if (/^(?:装备)?名称\s*:/.test(line)) {
                        draft.name = line.replace(/^(?:装备)?名称\s*:\s*/, '');
                        continue;
                    }
                    const slot = line.match(
                        /^(?:【|\[)?(?:装备部位|部位|装备类型|灵饰类型|类型)(?:】|\])?\s*:?\s*(.+)$/,
                    );
                    if (slot) {
                        /** @type {Record<string, string>} */
                        const aliases = {
                            帽子: '头盔',
                            头饰: '头盔',
                            铠甲: '衣服',
                            鞋: '鞋子',
                            腰饰: '腰带',
                            剑: '武器',
                            刀: '武器',
                            枪: '武器',
                            扇: '武器',
                            弓: '武器',
                            双剑: '武器',
                            飘带: '武器',
                        };
                        const value = slot[1].trim();
                        draft.slot = this.slots.includes(value)
                            ? value
                            : value === '配饰'
                              ? '佩饰'
                              : aliases[value] || '';
                        if (draft.slot) continue;
                    }
                    const level =
                        line
                            .replace(/[【】[\]]/g, '')
                            .match(
                                /^(?:装备条件\s*)?(?:装备等级|使用等级|佩戴等级|等级限制|等级)\s*:?\s*(\d{1,3})(?!\d)/,
                            ) || line.match(/^(\d{1,3})\s*级(?:装备|灵饰)?$/);
                    if (level) {
                        draft.level = Number(level[1]);
                        continue;
                    }
                    const dust = line.match(/灵尘(?:总)?等级\s*:?\s*(\d{1,2})(?!\d)/);
                    if (dust) {
                        draft.dustLevel = Number(dust[1]);
                        continue;
                    }
                    const holes = line.match(
                        /(?:已解锁)?开光(?:孔数|孔|数量)?\s*:?\s*([1-3])(?:\D|$)/,
                    );
                    if (holes) {
                        draft.holes = Number(holes[1]);
                        continue;
                    }
                    const durability = line.match(
                        /(?:当前)?耐久(?:度)?\s*:?\s*(\d+)(?:\s*\/\s*\d+)?/,
                    );
                    if (durability) {
                        draft.durability = Number(durability[1]);
                        continue;
                    }
                    const hole = line.match(
                        /^(?:孔([一二三123])|([一二三123])号孔)\s*[:·]?\s*(.+)$/,
                    );
                    if (hole) {
                        const position = '一二三'.indexOf(hole[1] || hole[2]);
                        draft[
                            'hole' + (position >= 0 ? position + 1 : Number(hole[1] || hole[2]))
                        ] = hole[3];
                        continue;
                    }
                    if (/^(?:特技|特效|玉魄特效)/.test(line)) {
                        special.push(line);
                        continue;
                    }
                    if (
                        /^(?:镶嵌宝石|宝石)/.test(line) ||
                        /(?:太阳石|红玛瑙|黑宝石|月亮石|舍利子|光芒石|神秘石|翡翠石|星辉石)/.test(
                            line,
                        )
                    ) {
                        draft.gems +=
                            (draft.gems ? '\n' : '') +
                            line.replace(/^(?:镶嵌宝石|宝石)\s*:?\s*/, '');
                        continue;
                    }
                    if (/^(?:锻炼|镶嵌|精炼)等级/.test(line)) {
                        draft.gems += (draft.gems ? '\n' : '') + line;
                        continue;
                    }
                    const jadeLabel = line.match(
                        /^(?:玉魄)?(基础属性|附加属性[一二12]?|附加[一二12])\s*:?\s*(.*)$/,
                    );
                    if (jadeLabel) {
                        section = jadeLabel[1].startsWith('基础')
                            ? 'jadeBase'
                            : /[二2]$/.test(jadeLabel[1]) || draft.jadeExtra1
                              ? 'jadeExtra2'
                              : 'jadeExtra1';
                        if (jadeLabel[2]) {
                            draft[section] = jadeLabel[2];
                            section = '';
                        }
                        continue;
                    }
                    const numeric =
                        /[+-]\s*\d|(?:伤害|命中|防御|气血|魔法|灵力|敏捷|体质|力量|耐力|魔力|速度|等级)\s*:?\s*\d/.test(
                            line,
                        );
                    if (section && numeric) {
                        draft[section] = line;
                        section = section === 'jadeExtra1' ? 'jadeExtra2' : '';
                        continue;
                    }
                    if (numeric) {
                        attributes.push(
                            line.replace(/^装备属性\s*:?\s*/, '').replace(/([+-])\s+(?=\d)/g, '$1'),
                        );
                        continue;
                    }
                    if (
                        !draft.name &&
                        /^[\u4e00-\u9fff][\u4e00-\u9fff·()（）-]{1,19}$/.test(line) &&
                        !/^(?:装备|属性|基础|附加|绑定|制造|制作者|装备条件|使用条件|不可|专用)/.test(
                            line,
                        )
                    ) {
                        draft.name = line;
                        continue;
                    }
                    if (/^(?:制造者|制作者|熔炼|符石|套装|修理|失败|备注|说明|装备特效)/.test(line))
                        notes.push(line);
                }
                const joined = lines.join('\n');
                // 该生僻字不在通用模型字表中，仅在部位和等级吻合时纠正已知装备名。
                if (
                    draft.slot === '耳饰' &&
                    draft.level === 80 &&
                    /^明月[档裆当]$/.test(draft.name)
                )
                    draft.name = '明月珰';
                if (!draft.slot) {
                    if (/玉魄/.test(draft.name) && /[阳陰阴]/.test(draft.name))
                        draft.slot = /阳/.test(draft.name) ? '玉魄·阳' : '玉魄·阴';
                    else
                        draft.slot =
                            ['戒指', '耳饰', '手镯', '佩饰', '项链', '腰带', '头盔', '鞋子'].find(
                                (/** @type {string} */ slot) => draft.name.includes(slot),
                            ) || '';
                    if (!draft.slot && draft.name === '疾风之铃') draft.slot = '项链';
                    if (!draft.slot && draft.name === '飞龙在天') draft.slot = '武器';
                    if (!draft.slot && /(?:帽|冠|盔|钗|簪)$/.test(draft.name)) draft.slot = '头盔';
                    if (!draft.slot && /(?:靴|履|鞋)$/.test(draft.name)) draft.slot = '鞋子';
                    if (!draft.slot && /(?:剑|刀|枪|戟|斧|钺|锤|鞭|爪|扇|弓|杖)$/.test(draft.name))
                        draft.slot = '武器';
                    if (
                        !draft.slot &&
                        /伤害\s*[:+]?\s*\d/.test(joined) &&
                        /命中\s*[:+]?\s*\d/.test(joined)
                    )
                        draft.slot = '武器';
                    if (!draft.slot && /^(?:蝉翼金丝甲)$/.test(draft.name)) draft.slot = '衣服';
                    if (
                        !draft.slot &&
                        /(?:装备角色|装备条件)[\s\S]*(?:防御)[\s\S]*魔法/.test(joined)
                    )
                        draft.slot = '头盔';
                }
                if (this.isJade(draft.slot) && !draft.jadeBase && attributes.length) {
                    const rows = attributes.filter(
                        (/** @type {string} */ line) => !/^奇袭/.test(line),
                    );
                    draft.jadeBase = rows[0] || '';
                    draft.jadeExtra1 = rows[1] || '';
                    draft.jadeExtra2 = rows[2] || '';
                    if (draft.holes === '') {
                        const empty = [
                            ...joined.matchAll(/奇袭(?:特技|道具)\s*[:：]?\s*\[?空\]?/g),
                        ];
                        if (empty.length) draft.holes = 1;
                    }
                }
                draft.attributes = attributes.join('\n');
                if (!this.isJade(draft.slot)) {
                    draft.attributes = [
                        draft.jadeBase,
                        draft.jadeExtra1,
                        draft.jadeExtra2,
                        draft.attributes,
                    ]
                        .filter(Boolean)
                        .join('\n');
                }
                draft.special = special.join('\n');
                draft.note = notes.join('\n');
                if (draft.slot && !this.isJade(draft.slot) && draft.durability !== '') {
                    draft.note += (draft.note ? '\n' : '') + '耐久 ' + draft.durability;
                }
                return draft;
            },

            /**
             * @this {Domain}
             * @param {EquipmentDraft} draft
             * @param {string} characterId
             * @returns {any}
             */
            equipmentImportRecord(draft, characterId) {
                /** @type {any} */
                const record = {
                    characterId,
                    slot: draft.slot,
                    name: draft.name.trim(),
                    level: draft.level,
                    attributes: draft.attributes.trim(),
                    special: draft.special.trim(),
                    gems: draft.gems.trim(),
                    note: draft.note.trim(),
                    status: 'stored',
                    ocrText: draft.ocrText,
                };
                if (this.isJade(record.slot)) {
                    record.level = '';
                    record.attributes = '';
                    record.gems = '';
                    record.jade = {
                        base: draft.jadeBase.trim(),
                        extra1: draft.jadeExtra1.trim(),
                        extra2: draft.jadeExtra2.trim(),
                        dustLevel: draft.dustLevel,
                        holes: Number(draft.holes),
                        durability: draft.durability,
                        enchantments: [draft.hole1, draft.hole2, draft.hole3].slice(
                            0,
                            Number(draft.holes),
                        ),
                    };
                }
                if (draft.details) {
                    record.details = JSON.parse(JSON.stringify(draft.details));
                    Object.assign(
                        record,
                        this.equipmentDetailsSnapshot(record.slot, record.details),
                    );
                } else {
                    record.details = this.equipmentDetails(record);
                }
                return record;
            },

            /**
             * @this {Domain}
             * @param {EquipmentDraft} draft
             * @param {string} characterId
             * @returns {string}
             */
            equipmentImportError(draft, characterId) {
                if (!draft.name.trim()) return '请补充装备名称';
                if (!this.slots.includes(draft.slot) || draft.slot === '其他')
                    return '请选择装备部位';
                if (!this.charById(characterId)) return '请选择角色';
                if (
                    !this.isJade(draft.slot) &&
                    draft.level !== '' &&
                    (!Number.isInteger(draft.level) || draft.level < 0 || draft.level > 999)
                )
                    return '装备等级需为 0～999 的整数';
                if (
                    draft.details ||
                    (this.isJade(draft.slot) &&
                        draft.jadeBase &&
                        draft.jadeExtra1 &&
                        draft.jadeExtra2)
                ) {
                    try {
                        this.validateEquipmentDetails(
                            draft.slot,
                            draft.level,
                            draft.details || this.equipmentImportRecord(draft, characterId).details,
                        );
                    } catch (error) {
                        return /** @type {Error} */ (error).message;
                    }
                } else if (this.isJade(draft.slot)) {
                    if (
                        ![draft.jadeBase, draft.jadeExtra1, draft.jadeExtra2].every(
                            (/** @type {string} */ value) => value.trim(),
                        )
                    )
                        return '请补充玉魄基础和两条附加属性';
                    if (
                        !Number.isInteger(draft.dustLevel) ||
                        draft.dustLevel < 0 ||
                        draft.dustLevel > 17
                    )
                        return '请补充灵尘等级（0～17）';
                    if (![1, 2, 3].includes(Number(draft.holes))) return '请选择开光孔数';
                    if (
                        draft.durability !== '' &&
                        (!Number.isInteger(draft.durability) ||
                            draft.durability < 0 ||
                            draft.durability > 300)
                    )
                        return '耐久需为 0～300 的整数';
                }
                return '';
            },

            /**
             * 同批建档与穿戴一次提交，已有格子保留，失败时整体回滚。
             *
             * @this {Domain}
             * @param {EquipmentDraft[]} drafts
             * @param {{ characterId: string, index: number | null }} options
             * @returns {Promise<any>}
             */
            async importEquipment(drafts, { characterId, index }) {
                return this.commitEquipment(() => {
                    if (!drafts.length || drafts.length > this.equipmentImportLimits.count)
                        throw new Error('请选择 1～30 件装备');
                    const profile = this.equipmentProfile(characterId);
                    if (index !== null && ![0, 1, 2].includes(index))
                        throw new Error('请选择有效的装备方案');
                    const result = { created: 0, reused: 0, equipped: 0, stored: 0 };
                    const fields = ['slot', 'name', 'level', 'note'];
                    /** @param {any} record @returns {string} */
                    const fingerprint = (record) =>
                        JSON.stringify([
                            ...fields.map((key) => (record[key] == null ? '' : record[key])),
                            this.equipmentDetails(record),
                        ]);
                    drafts.forEach(
                        (/** @type {EquipmentDraft} */ draft, /** @type {number} */ position) => {
                            const error = this.equipmentImportError(draft, characterId);
                            if (error) throw new Error('第 ' + (position + 1) + ' 件：' + error);
                            const record = this.equipmentImportRecord(draft, characterId);
                            const match = this.state.equipment.find(
                                (/** @type {any} */ eq) =>
                                    eq.characterId === characterId &&
                                    eq.status !== 'sold' &&
                                    fingerprint(eq) === fingerprint(record),
                            );
                            const saved = match || this.saveEquipment(record);
                            result[match ? 'reused' : 'created']++;
                            if (
                                index !== null &&
                                !profile.equipmentSets[index].slots[saved.slot] &&
                                (!this.isJade(saved.slot) || profile.soulJade.unlocked)
                            ) {
                                this.assignEquipment(characterId, index, saved.slot, saved.id);
                                result.equipped++;
                            } else if (
                                index === null ||
                                profile.equipmentSets[index].slots[saved.slot] !== saved.id
                            )
                                result.stored++;
                        },
                    );
                    return result;
                });
            },
        }),
    );
}
