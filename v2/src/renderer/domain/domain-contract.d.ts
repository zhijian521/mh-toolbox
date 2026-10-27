/**
 * 领域对象 D 的成员契约，供开启 `@ts-check` 的领域模块引用。
 *
 * 为什么需要这个文件：13 个领域模块用 `Object.assign(D, {...})` 把一百多个方法平铺
 * 到同一个对象上，方法之间大量通过 `this.xxx()` 互相调用。TypeScript 无法从这种
 * 混入推断出 `this` 的类型，于是任何模块一开 `@ts-check` 就会得到成片的
 * 「Property does not exist on type」。这里把契约显式写出来：既是逐文件开启类型检查
 * 的前提，也是将来拆成命名空间模块时的现成清单。
 *
 * 本文件不含 import/export，因此是全局脚本声明文件，`Domain` 与 `DomainState`
 * 对所有源文件可见，JSDoc 里直接写 `@type {Domain}` 即可。
 *
 * 维护约定：
 * - 新增领域方法后必须在这里补一行；漏补时调用方会报「Property does not exist」，
 *   这正是我们要的强制同步。
 * - 成员按来源模块分组，顺序与 create-domain.js 的安装顺序一致。
 * - 参数与返回值先用 any 兜底，某模块真正转成 TS 时再把对应分组换成精确类型。
 *   不要在这里追求完整类型，先保证契约齐全。
 * - 下划线开头的私有字段也要列出，因为跨模块会直接读写它们。
 */

interface DomainState {
    schemaVersion: number;
    characters: any[];
    transactions: any[];
    sessions: any[];
    activeSession: any;
    goals: any[];
    equipment: any[];
    gearLogs: any[];
    /** 物品参考单价，键为物品名，值以原始梦幻币计价（不是万）。 */
    itemPrices?: Record<string, number>;
    quickSettings?: Record<string, any>;
}

/** 系统偏好读写通道，渲染进程传 localStorage，测试传内存桩。 */
interface Preferences {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
}

/** 养成指标定义，由 growth.js 提供，供角色与目标模块共用。 */
interface GrowthMetric {
    v: string;
    t: string;
    group: string;
    kind: 'skills' | 'training' | 'level' | 'quantity';
    unit: string;
    label?: string;
    fields?: Array<{ key: string; label: string }>;
}

/** 技能条目：等级为 null 表示未记录，0 表示明确填写为零。 */
interface SkillEntry {
    name: string;
    level: number | null;
}

/** 角色养成数据，所有数值项都以 null 表示未记录。 */
interface CharacterProgress {
    schoolSkills: SkillEntry[];
    auxiliarySkills: SkillEntry[];
    training: Record<string, number | null>;
    petTraining: Record<string, number | null>;
    qianyuanPills: number | null;
    potentialFruits: number | null;
    note: string;
}

/** 装备词条。value 为显示值，boost 为强化加成，未填为 null。 */
interface EquipmentRow {
    key: string;
    value: number;
    boost: number | null;
}

/** 宝石：type 为宝石名，level 为等级。 */
interface EquipmentGem {
    type: string;
    level: number | null;
}

/** 玉魄专属字段。 */
interface EquipmentJade {
    dust: number | null;
    assault: string;
    chance: number | null;
    holes: number;
    enchantments: string[];
}

/** 装备结构化属性（version 1）。旧文本数据读取时被解析成这个形状。 */
interface EquipmentDetail {
    version: number;
    base: EquipmentRow[];
    extra: EquipmentRow[];
    bonus: EquipmentRow[];
    melt: EquipmentRow[];
    technique: string;
    effects: string[];
    forge: number | null;
    gems: EquipmentGem[];
    clock: { name: string; level: number | null };
    suit: string;
    element: string;
    durability: number | null;
    repair: number | null;
    maker: string;
    runes: string;
    jade: EquipmentJade;
    legacy: string;
    /** 文本字段按 key 动态访问，因此放开索引。 */
    [field: string]: any;
}

/** 部位规则：由 equipmentRule 按部位派生。 */
interface EquipmentRule {
    kind: string;
    base: string[];
    extra: string[];
    gems: string[];
    effects: string[];
    /** 词条分组按部位动态访问（base/extra/bonus/melt），因此放开索引。 */
    [group: string]: any;
}

/** 装备变更记录里的属性快照，jade 仅玉魄有。 */
interface EquipmentSnapshot {
    attributes: string;
    special: string;
    gems: string;
    jade?: Record<string, any>;
}

interface Domain {
    // ---- data.js：状态、常量与通用卡片操作 ----
    state: DomainState;
    schemaVersion: number;
    charFilter: string;
    incomeCats: string[];
    expenseCats: string[];
    accountCats: string[];
    channels: string[];
    itemStatuses: Record<string, string>;
    slots: string[];
    schools: string[];
    auxiliarySkillNames: string[];
    goalTypes: Array<{ v: string; t: string }>;
    gearActions: Array<{ v: string; t: string; dir: number }>;
    characterTraining: Array<{ key: string; label: string }>;
    petTraining: Array<{ key: string; label: string }>;
    orderedCards: (items: any[]) => any[];
    moveCard: (items: any[], id: string, changes: any) => void;
    setCharFilter: (v: string) => void;
    chars: () => any[];
    charById: (id: string) => any;
    charName: (id: string) => string;
    scope: (list: any[]) => any[];
    earnings: (list: any[]) => any[];
    accounts: (list: any[]) => any[];
    itemValue: (t: any, quantity?: number) => number;
    txIn: (charId: string, from: string, to: string, ledger?: string) => any[];
    goalTypeText: (v: string) => string;
    gearAction: (v: string) => { v: string; t: string; dir: number };
    itemPrice: (id: string) => number;
    setItemPrice: (id: string, price: number) => void;
    gearLogsOf: (eqId: string) => any[];

    // ---- storage.js：串行提交、持久化与整体替换 ----
    init: () => Promise<void>;
    persist: (options?: any) => Promise<any>;
    commit: (change: () => any, options?: any) => Promise<any>;
    replaceState: (data: any, reason?: string) => Promise<any>;
    _commitQueue?: Promise<any>;

    // ---- growth.js：养成指标定义与取值 ----
    growthMetrics: GrowthMetric[];
    goalMetrics: Array<{ v: string; t: string; unit: string }>;
    growthCategory: (category: string) => GrowthMetric | undefined;
    growthMetric: (category: string, key?: string) => GrowthMetric & { key: string; label: string };
    growthMetricOptions: (category: string, characters?: any[]) => Array<{ v: string; t: string }>;
    growthValue: (
        character: any,
        category: string,
        key: string,
        options?: { requireSkill?: boolean },
    ) => number | null;
    characterValueChanges: (
        character: any,
        category: string,
        key: string,
        input: any,
        options?: { allowMissingSkill?: boolean },
    ) => any;

    // ---- characters.js：角色档案、技能与养成历史 ----
    characterNumber: (value: any) => number | null;
    /** 不传参数时返回一份全空的养成骨架，供校验逻辑取字段清单。 */
    normalizeCharacterProgress: (value?: any) => CharacterProgress;
    normalizeCharacterHistory: (value: any) => any[];
    characterGrowthChanges: (previous: any, saved: any) => any[];
    characterGrowthEntry: (previous: any, saved: any, record?: any) => any;
    characterGrowthHistory: (characterId?: string, range?: any) => any[];
    orderedCharacters: (characters?: any[]) => any[];
    saveCharacterOrder: (id: string, changes: any) => Promise<any>;
    saveCharacter: (data: any, id?: string, record?: any) => Promise<any>;
    applyCharacter: (data: any, id?: string, record?: any) => any;
    saveCharacterProgress: (id: string, changes: any, record?: any) => Promise<any>;
    characterProgressMetric: (
        character: any,
        category: string,
        key: string,
    ) => { group: string; label: string; unit: string; value: number | null };
    saveCharacterValue: (
        id: string,
        category: string,
        key: string,
        input: any,
        record?: any,
    ) => Promise<any>;
    validateCharacterProgress: (changes: any) => void;
    removeCharacter: (id: string) => Promise<any>;

    // ---- schools.js：门派技能模板 ----
    schoolSkillNames: Record<string, string[]>;
    fillSchoolSkills: (school: string, skills: any[]) => any[];

    // ---- statistics.js：收益统计 ----
    stats: (txs: any[]) => any;
    accountStats: (txs: any[], currency: string) => any;

    // ---- ledger.js：流水、物品与装备联动 ----
    itemSales: (item: any, list?: any[]) => any[];
    itemRemaining: (item: any) => number;
    itemSoldQuantity: (item: any) => number;
    itemHoldingValue: (item: any) => number;
    syncItem: (id: string) => void;
    syncEquipmentStatus: (id: string) => void;
    syncAccountEquipment: (tx: any) => void;
    removeTransaction: (id: string) => Promise<any>;
    settleItem: (item: any, data: any) => Promise<any>;
    saveTransaction: (input: any, id?: string) => Promise<any>;

    // ---- export.js：CSV 导出 ----
    recordsCsv: (records: any[]) => string;

    // ---- goals.js：目标与目标养成 ----
    orderedGoals: (goals?: any[]) => any[];
    saveGoalOrder: (id: string, changes: any) => Promise<any>;
    goalCharacters: (goal: any) => any[];
    goalsFor: (characterId?: string) => any[];
    goalMetricOptions: (category: string, characterId?: string) => Array<{ v: string; t: string }>;
    goalCharacterValue: (character: any, tracking: any) => any;
    goalMetricLabel: (tracking: any) => string;
    goalDefaultTitle: (goal: any) => string;
    goalSummary: (goal: any) => any;
    goalGrowthHistory: (goal: any, range?: any) => any[];
    recalculateGoal: (goal: any) => any;
    saveGoal: (input: any, id?: string) => Promise<any>;
    saveGoalGrowth: (id: string, values: any, record?: any) => Promise<any>;
    saveGoalProgress: (id: string, input: any, logId?: string) => Promise<any>;
    removeGoalProgress: (id: string, logId: string) => Promise<any>;
    setGoalStatus: (id: string, status: string) => Promise<any>;
    removeGoal: (id: string) => Promise<any>;

    // ---- migration.js：旧数据归一与备份校验 ----
    normalize: (data: any) => any;
    normalizeCardOrder: (items: any[]) => any[];
    validateBackup: (data: any) => void;

    // ---- equipment.js：装备与三套方案 ----
    equipmentGroups: Record<string, any>;
    equipmentStatuses: Record<string, string>;
    equipmentSetNames: string[];
    soulAttributes: string[];
    isJade: (slot: string) => boolean;
    /** 由持有数量与状态派生出「在装 / 备用 / 已售」等展示口径。 */
    equipmentStatus: (eq: any, references?: any[]) => string;
    equipmentProfile: (characterId: string) => any;
    equipmentReferenceIndex: (characterId: string) => Map<string, any[]>;
    equipmentReferences: (id: string) => any[];
    equipmentById: (id: string) => any;
    clearEquipmentReferences: (id: string) => void;
    assignEquipment: (characterId: string, index: number, slot: string, id: string) => void;
    copyEquipmentSet: (characterId: string, from: number, to: number) => void;
    /** 同步落盘：调用方已经在 commitEquipment 事务内，因此不经 Promise。 */
    saveEquipment: (data: any, id?: string) => any;
    commitEquipment: (change: () => any) => Promise<any>;
    removeEquipment: (id: string) => void;
    recordEquipmentChange: (id: string, data: any) => Promise<any>;
    normalizeEquipment: (state: any, original: any) => any;
    _equipmentList?: any[];
    _equipmentSize?: number;
    _equipmentIndex?: Map<string, any>;

    // ---- equipment-fields.js：装备结构化属性 ----
    equipmentStats: Record<string, string>;
    equipmentTechniques: string[];
    equipmentClockEffects: string[];
    equipmentRule: (slot: string) => EquipmentRule;
    equipmentStatText: (row: EquipmentRow) => string;
    parseEquipmentStats: (text: string) => { rows: EquipmentRow[]; unknown: string[] };
    equipmentDetails: (eq: any) => EquipmentDetail;
    emptyEquipmentDetails: () => EquipmentDetail;
    validateEquipmentDetails: (slot: string, level: any, detail: EquipmentDetail) => void;
    equipmentDetailsSnapshot: (slot: string, detail: EquipmentDetail) => EquipmentSnapshot;
    equipmentSearchText: (eq: any) => string;

    // ---- equipment-import.js：装备粘贴导入 ----
    equipmentImportLimits: Record<string, any>;
    parseEquipmentText: (text: string) => any;
    equipmentImportRecord: (draft: any, characterId: string) => any;
    equipmentImportError: (draft: any, characterId: string) => any;
    importEquipment: (
        drafts: any[],
        options: { characterId: string; index?: number },
    ) => Promise<any>;

    // ---- online.js：在线计时与收益 ----
    makeSession: (input: any) => any;
    sessionSlices: (session: any) => Array<{ date: string; minutes: number; cost: number }>;
    sessionError: (session: any, ignoreActiveId?: string) => any;
    onlineStats: (charId: string, from: string, to: string, includeActive?: boolean) => any;
    includeActiveEarnings: (settled: any, charId: string, from: string, to: string) => any;
    earningsStats: (charId: string, from: string, to: string, includeActive?: boolean) => any;
    syncSession: (session: any) => void;
    normalizeOnline: (state: any, data: any) => any;
    saveSession: (input: any, finishActiveId?: string) => Promise<any>;
    removeSession: (id: string) => Promise<any>;
    startSession: (charId: string) => Promise<any>;
    adjustSessionStart: (startAt: number) => Promise<any>;
    commitOnline: (change: () => any) => Promise<any>;
    _saleList?: any[];
    _saleCount?: number;
    _salesIndex?: Map<string, any>;
}
