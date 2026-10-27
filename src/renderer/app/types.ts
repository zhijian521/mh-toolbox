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
 * 尚未迁移模块（收益、账号、目标、装备、在线）的记录形状。
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
export interface AppData {
    schemaVersion: number;
    characters: Character[];
    transactions: RecordEntry[];
    equipment: RecordEntry[];
    goals: RecordEntry[];
    sessions: RecordEntry[];
    gearLogs: RecordEntry[];
    activeSession: RecordEntry | null;
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
    // 资料与列表
    schools: string[];
    schoolSkillNames: Record<string, string[]>;
    auxiliarySkillNames: string[];
    characterTraining: TrainingField[];
    petTraining: TrainingField[];
    // 角色档案与养成
    charById(id: string): Character | undefined;
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
}
declare global {
    interface Window {
        mhV2?: DesktopGateway;
    }
}
