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
export interface AppData {
    schemaVersion: number;
    characters: Character[];
    transactions: any[];
    equipment: any[];
    goals: any[];
    sessions: any[];
    gearLogs: any[];
    activeSession: any;
    [key: string]: unknown;
}
export interface Result {
    ok: boolean;
    error?: string;
    canceled?: boolean;
    data?: AppData | null;
}
export interface AppInfo {
    version: string;
    dataFile: string;
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
}
export interface Domain {
    state: AppData;
    schemaVersion: number;
    normalize(data: unknown): AppData;
    orderedCharacters(characters?: Character[]): Character[];
    normalizeCharacterProgress(progress?: unknown): Progress;
    characterGrowthHistory(id?: string, range?: { from?: string; to?: string }): GrowthEntry[];
    [key: string]: any;
}
declare global {
    interface Window {
        mhV2?: DesktopGateway;
    }
}
