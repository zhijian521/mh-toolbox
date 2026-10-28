export interface Skill {
    name: string;
    level: number | string | null;
}
export interface Progress {
    schoolSkills: Skill[];
    auxiliarySkills: Skill[];
    training: Record<string, number | string | null>;
    petTraining: Record<string, number | string | null>;
    qianyuanPills: number | string | null;
    potentialFruits: number | string | null;
    note: string;
}
export interface GrowthChange {
    group: string;
    label: string;
    from: number | string | null;
    to: number | string | null;
    unit: string;
    kind: string;
}
export interface GrowthEntry {
    id: string;
    date: string;
    createdAt: number;
    source: string;
    sourceName: string;
    note: string;
    changes: GrowthChange[];
    characterId?: string;
    characterName?: string;
}
export interface Character {
    id: string;
    name: string;
    level: number | string | null;
    school: string;
    server: string;
    progress: Progress;
    growthHistory: GrowthEntry[];
    [key: string]: unknown;
}
/**
 * 尚未迁移模块（收益、装备、在线）的记录形状。
 *
 * 这些页面还没搬过来，字段名在领域层已稳定但界面尚未消费，因此只声明渲染层
 * 实际用到的外键，其余键留给 `unknown`——比整块 `any` 安全：读错字段名会报错，
 * 迁移对应模块时再逐字段收紧。
 */
export interface RecordEntry {
    id: string;
    characterId?: string;
    [key: string]: unknown;
}
/** 时间范围筛选的状态：预设键与它算出的起止日（手改日期后变成 `custom`）。 */
export interface DateRangeValue {
    preset: string;
    from: string;
    to: string;
}
/**
 * 账本记录。账号与收益共用 `state.transactions`，靠 `ledger` 区分：
 * `account` 是人民币 / 梦幻币收支，`earnings` 是游戏内日常收益与物品。
 * 物品与在线相关字段只有收益用得上，这里先声明成可选，迁移收益页时再收紧。
 */
export interface Transaction {
    id: string;
    characterId: string;
    ledger: 'account' | 'earnings';
    recordType: 'money' | 'item';
    kind: 'income' | 'expense';
    currency: 'rmb' | 'cash' | 'reserve';
    category: string;
    channel: string;
    date: string;
    amount: number;
    fee: number;
    note: string;
    createdAt: number;
    minutes?: number;
    status?: string;
    equipmentId?: string;
    gearAction?: string;
    itemName?: string;
    quantity?: number;
    unitPrice?: number;
    saleQuantity?: number;
    itemRecordId?: string;
    sessionId?: string;
    saleId?: string;
    /** 速记来源：`quick` 表示从物品网格一键记录，`timer` 由在线计时器结算。 */
    source?: string;
    /** 速记物品在 `game-data/quick-items` 里的 id。 */
    itemId?: number;
}
/**
 * 账本汇总。收入已扣手续费、支出已加手续费，`count` 是参与汇总的笔数。
 * `cash` 会把旧的储备金记录一起算进来，与领域 `accountStats` 一致。
 */
export interface AccountStats {
    income: number;
    expense: number;
    net: number;
    fees: number;
    count: number;
}
/**
 * 收益账本汇总，来自领域 `earningsStats`。
 *
 * 物品记录不计入收支，走两套口径：`itemValue` / `itemQty` 是范围内物品记录的数量 × 单价
 * （记了多少东西，卖出不影响）；`itemEstimate` / `itemCount` 只算持有中的剩余数量，
 * 留给物品库存模块。`hourly` 为 null 表示当前范围没有在线时长，不能倒推出时薪。
 */
export interface EarningsStats {
    income: number;
    expense: number;
    net: number;
    cashNet: number;
    reserveNet: number;
    reserveIncome: number;
    /** 手工记录里填的时长合计；在线计时器的时长算在 `onlineMinutes`。 */
    minutes: number;
    count: number;
    /** 范围内物品记录的标价合计（数量 × 单价），与卖没卖无关。 */
    itemValue: number;
    /** 对应的物品件数。 */
    itemQty: number;
    /** 仓库口径：持有中的剩余估值。 */
    itemEstimate: number;
    itemCount: number;
    onlineMinutes: number;
    cardCost: number;
    hourly: number | null;
}
/** 目标跟随的养成项目；`key` 只在技能与修炼分类下非空。 */
export interface GoalTracking {
    category: string;
    key: string;
}
/** 手动累计目标的一条进度记录。`delta` 正数增加、负数减少。 */
export interface GoalLog {
    id: string;
    date: string;
    delta: number;
    note: string;
    createdAt: number;
}
export type GoalType = 'money' | 'gear' | 'progress';
export interface Goal {
    id: string;
    title: string;
    /** `'all'` 表示全部角色（含后续新增）。 */
    characterId: string;
    type: GoalType;
    target: number;
    unit: string;
    tracking: GoalTracking | null;
    deadline: string;
    note: string;
    current: number;
    baseProgress: number;
    status: 'active' | 'done';
    doneAt?: string;
    logs: GoalLog[];
    sortOrder: number;
    createdAt: number;
}
/** 跟随档案的目标里，单个角色当前进度。`value` 为 null 表示该角色未记录此项。 */
export interface GoalMember {
    id: string;
    name: string;
    value: number | null;
    done: boolean;
    remaining: number | null;
}
/**
 * 目标汇总。手动目标是 `current / target`，跟随档案的目标是「达标人数 / 成员数」，
 * 因此成员相关字段只在后者存在。
 */
export interface GoalSummary {
    members?: GoalMember[];
    achieved?: number;
    unknown?: number;
    current: number;
    target: number;
    status: 'active' | 'done';
    pct: number;
}
/** 目标列表的一行：领域快照 + 汇总，供筛选与排序共用。 */
export interface GoalEntry {
    goal: Goal;
    summary: GoalSummary;
}
/** 一条价格记录。`price` 存原始游戏币，15000 表示 1.5 万。 */
export interface PriceLog {
    id: string;
    date: string;
    price: number;
    note: string;
    createdAt: number;
}
/**
 * 物价卡片。
 *
 * 只有 `logs` 是价格真值，当前价由最新一条历史派生（领域 `priceCurrent`）——
 * 卡片上再存一份 `price` 就会出现「显示价与历史最后一条不一致」。
 */
export interface PriceItem {
    id: string;
    name: string;
    category: string;
    unit: string;
    note: string;
    logs: PriceLog[];
    createdAt: number;
    updatedAt: number;
}
/** 与上一次不同日期的记录比出的涨跌；`pct` 为 null 表示基准价为 0。 */
export interface PriceChange {
    delta: number;
    pct: number | null;
    from: number;
    to: number;
    since: string;
}
/** 物品表单草稿：新建时 `price` / `date` 作为初始价，编辑时被忽略。 */
export interface PriceItemInput {
    name: string;
    category: string;
    note: string;
    price?: number | string | null;
    date?: string;
}
/** 价格记录表单草稿。 */
export interface PriceLogInput {
    date: string;
    price: number | string;
    note: string;
}
/** 进行中的在线会话：`startAt` 是本地毫秒时间戳，其余字段来自速记参数。 */
export interface ActiveSession extends RecordEntry {
    startAt?: number;
    accounts?: number;
    cardPrice?: number;
}
export interface AppData {
    schemaVersion: number;
    characters: Character[];
    transactions: Transaction[];
    equipment: RecordEntry[];
    goals: Goal[];
    sessions: RecordEntry[];
    gearLogs: RecordEntry[];
    /** 物价卡片，独立集合，与账本、角色、装备都没有外键。 */
    prices: PriceItem[];
    activeSession: ActiveSession | null;
    /** 速记参数：同时在线角色数与每点单价（游戏币）。 */
    quickSettings: { accounts: number; cardPrice: number };
    /** 速记物品的参考单价（游戏币），键是 `game-data/quick-items` 里的 id。 */
    itemPrices: Record<string, number>;
    [key: string]: unknown;
}
/** 角色删除预览：领域层 `characterRemovalSummary` 的返回值。 */
export interface RemovalSummary {
    transactions: number;
    sessions: number;
    goals: number;
    equipment: number;
    gearLogs: number;
    activeSession: number;
    total: number;
}
/** 养成资料项（门派列表、修炼项目等），来自 `game-data/`。 */
export interface TrainingField {
    key: string;
    label: string;
}
/**
 * 养成分类定义。`kind` 决定目标能填什么：`skills` / `training` 需要再选具体项目，
 * `level` / `quantity` 只有单项数值。
 */
export interface GrowthCategory {
    v: string;
    t: string;
    group: string;
    kind: string;
    unit: string;
    fields?: TrainingField[];
}
/** 领域方法读取到的单指标口径。 */
export interface ProgressMetric {
    group: string;
    label: string;
    unit: string;
    value: number | string | null;
}
/** 保存角色时随附的变更日期与说明。 */
export interface GrowthRecord {
    date: string;
    note: string;
}
export interface Result {
    ok: boolean;
    error?: string;
    canceled?: boolean;
    data?: AppData | null;
    filePath?: string;
}

export interface BackupEntry {
    name: string;
    path: string;
    size: number;
    time: number;
    rolling: boolean;
}

export interface Diagnostics {
    ok: boolean;
    dataFile: string;
    dataDirectory: string;
    logsDirectory: string;
    dataExists: boolean;
    dataBytes: number;
    backups: number;
    rollingBackups: number;
    logTail: string;
}

export interface AppInfo {
    version: string;
    dataFile: string;
    dataDirectory: string;
    logsDirectory: string;
    platform: string;
    profile: string;
}

export interface WindowState {
    maximized: boolean;
}

export interface DesktopGateway {
    loadData(): Promise<Result>;
    saveData(data: AppData, options?: { backupReason?: string }): Promise<Result>;
    info(): Promise<AppInfo>;
    importData(): Promise<Result>;
    exportData(data: AppData): Promise<Result>;
    window(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
    getWindowState(): Promise<WindowState>;
    onWindowStateChanged(listener: (state: WindowState) => void): () => void;
    // 急救通道：数据文件打不开时使用，不依赖领域实例。
    exportRaw(): Promise<Result>;
    quarantineData(): Promise<Result>;
    listBackups(): Promise<{ ok: boolean; backups: BackupEntry[] }>;
    readBackup(name: string): Promise<Result>;
    diagnostics(): Promise<Diagnostics>;
    openPath(target: string): Promise<{ ok: boolean; error?: string }>;
    openDataFile(): Promise<{ ok: boolean; error?: string }>;
    logError(text: string): Promise<{ ok: boolean }>;
}
/**
 * 渲染层实际调用的领域方法。
 *
 * 完整的领域契约在 `src/renderer/domain/domain-contract.d.ts`（约 140 个成员，供
 * JSDoc 与 `@ts-check` 使用）。这里只列界面用到的那部分：页面里的 `domain.xxx()`
 * 因此有真正的签名，而不是靠一个 `any` 索引把拼错的成员名放过去。
 * 新增领域调用时在这里补一行，漏补会直接报「属性不存在」。
 */
export interface Domain {
    state: AppData;
    schemaVersion: number;
    init(): Promise<void>;
    normalize(data: unknown): AppData;
    persist(options?: { backupReason?: string }): Promise<unknown>;
    replaceState(data: unknown, reason?: string): Promise<unknown>;
    validateBackup(data: unknown): void;
    /**
     * 串行事务：修改后整份快照落盘，失败回滚。
     *
     * 大多数领域方法自己包了 commit，界面直接调用即可；少数同步方法只改内存
     * （`removeTransaction` 就是），必须由调用方用 commit 包一层，否则改完不落盘。
     */
    commit(change: () => unknown, options?: unknown): Promise<unknown>;
    // 资料与列表
    schools: string[];
    schoolSkillNames: Record<string, string[]>;
    auxiliarySkillNames: string[];
    characterTraining: TrainingField[];
    petTraining: TrainingField[];
    // 角色档案与养成
    charById(id: string): Character | undefined;
    charName(id: string): string;
    characterNumber(value: unknown): number | null;
    characterProgressMetric(
        character: Character | undefined,
        category: string,
        key: string,
    ): ProgressMetric;
    characterRemovalSummary(id: string): RemovalSummary;
    characterGrowthHistory(id?: string, range?: { from?: string; to?: string }): GrowthEntry[];
    normalizeCharacterProgress(progress?: unknown): Progress;
    fillSchoolSkills(school: string, skills: Skill[]): Skill[];
    saveCharacter(data: unknown, id?: string, record?: GrowthRecord): Promise<Character>;
    saveCharacterValue(
        id: string,
        category: string,
        key: string,
        value: unknown,
        record?: GrowthRecord,
    ): Promise<unknown>;
    saveCharacterOrder(
        id: string,
        changes: { targetId: string; position: 'before' | 'after' },
    ): Promise<unknown>;
    removeCharacter(id: string): Promise<unknown>;
    // 目标与目标养成
    goalTypes: Array<{ v: string; t: string }>;
    goalMetrics: Array<{ v: string; t: string; unit: string }>;
    goalTypeText(value: string): string;
    growthCategory(category: string): GrowthCategory | undefined;
    orderedGoals(goals?: Goal[]): Goal[];
    goalsFor(characterId?: string): Goal[];
    goalCharacters(goal: Goal): Character[];
    goalSummary(goal: Goal): GoalSummary;
    goalDefaultTitle(goal: {
        characterId: string;
        type: string;
        target: number;
        unit?: string;
        tracking?: GoalTracking | null;
    }): string;
    goalMetricLabel(tracking: GoalTracking): string;
    goalMetricOptions(category: string, characterId?: string): Array<{ v: string; t: string }>;
    goalGrowthHistory(
        goal: Goal,
        range?: { from?: string; to?: string },
    ): Array<GrowthEntry & { change: GrowthChange }>;
    saveGoal(input: unknown, id?: string): Promise<Goal>;
    saveGoalGrowth(
        id: string,
        values: Record<string, number | string | null>,
        record?: GrowthRecord,
    ): Promise<number>;
    saveGoalProgress(
        id: string,
        input: { date: string; delta: number; note?: string },
        logId?: string,
    ): Promise<GoalLog>;
    removeGoalProgress(id: string, logId: string): Promise<unknown>;
    setGoalStatus(id: string, status: 'active' | 'done'): Promise<unknown>;
    removeGoal(id: string): Promise<unknown>;
    saveGoalOrder(
        id: string,
        changes: { targetId: string; position: 'before' | 'after' },
    ): Promise<unknown>;
    // 账号与收益账本
    incomeCats: string[];
    expenseCats: string[];
    accountCats: string[];
    channels: string[];
    /** 物品状态文案：`held` / `sold` / `self`。 */
    itemStatuses: Record<string, string>;
    accounts(list?: Transaction[]): Transaction[];
    txIn(characterId: string, from: string, to: string, ledger?: string): Transaction[];
    accountStats(txs: Transaction[], currency: string): AccountStats;
    /** 只按记录算收支，不含在线时长与点卡成本（那两项来自 sessions）。 */
    stats(txs: Transaction[]): Omit<EarningsStats, 'onlineMinutes' | 'cardCost' | 'hourly'>;
    earningsStats(
        characterId: string,
        from: string,
        to: string,
        includeActive?: boolean,
    ): EarningsStats;
    /** 物品剩余数量（获得数量减去已成交数量）。 */
    itemRemaining(tx: Transaction): number;
    /** 剩余数量 × 单价；已售罄的物品为 0。 */
    itemHoldingValue(tx: Transaction): number;
    /** 数量 × 单价（默认用记录自己的数量），保留两位；物品价值的唯一口径。 */
    itemValue(tx: Transaction, quantity?: number): number;
    /** 速记物品的参考单价，单位是游戏币（15000 = 1.5 万）。 */
    itemPrice(id: number | string): number;
    setItemPrice(id: string, price: number): void;
    /** 速记参数：同时在线角色数与每点单价。 */
    setQuickSettings(input: { accounts?: number; cardPrice?: number }): void;
    startSession(characterId: string): Promise<RecordEntry>;
    /** 会话折算：`range` 由起止时间算时长与点卡，`duration` 用给定分钟数。 */
    makeSession(input: RecordEntry): RecordEntry & { minutes: number; cost: number };
    /** 会话校验，空串表示通过；补录与调整起点前先跑一遍领域规则。 */
    sessionError(session: RecordEntry, ignoreActiveId?: string): string;
    /** 把一段会话按自然日切片，跨夜时给出每天的时长与点卡。 */
    sessionSlices(session: {
        id?: string;
        characterId: string;
        startAt: number;
        endAt: number;
        minutes: number;
        cost: number;
        mode?: string;
        [key: string]: unknown;
    }): Array<{ date: string; minutes: number; cost: number }>;
    adjustSessionStart(startAt: number): Promise<unknown>;
    saveSession(input: RecordEntry, finishActiveId?: string): Promise<RecordEntry>;
    /**
     * 删掉一段在线记录与它结算出的全部点卡流水（同步方法，只改内存，
     * 必须自己套 `commit` 才会落盘）。删点卡行时用它，避免时长与成本脱节。
     */
    removeSession(id: string): void;
    saveTransaction(input: unknown, id?: string): Promise<Transaction>;
    removeTransaction(id: string): Promise<unknown>;
    /**
     * 把指定日期的日常产出同步成账号账本里的一条「游戏收益」（一天一条，
     * 后写覆盖先写，金额为 0 时删掉）。自己 commit，可直接放进 `app.execute`。
     */
    syncAccountEarnings(
        dates: string[],
    ): Promise<Array<{ date: string; characterId: string; amount: number }>>;
    // 物价卡片（独立功能，不参与角色筛选与账本统计）
    priceCategories: string[];
    orderedPrices(items?: PriceItem[]): PriceItem[];
    priceLogsSorted(item: PriceItem): PriceLog[];
    priceCurrent(item: PriceItem): PriceLog | null;
    priceChange(item: PriceItem): PriceChange | null;
    priceLabel(value: number | string | null): { value: string; unit: string };
    savePriceItem(input: PriceItemInput, id?: string): Promise<PriceItem>;
    savePriceLog(itemId: string, input: PriceLogInput, logId?: string): Promise<PriceLog>;
    removePriceLog(itemId: string, logId: string): Promise<void>;
    removePriceItem(id: string): Promise<void>;
}
declare global {
    interface Window {
        mhV2?: DesktopGateway;
    }
}
