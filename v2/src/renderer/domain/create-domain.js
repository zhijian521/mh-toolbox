// @ts-check
import { U } from './util.js';
import { createData } from './data.js';
import storage from './storage.js';
import growth from './growth.js';
import characters from './characters.js';
import schools from './schools.js';
import statistics from './statistics.js';
import ledger from './ledger.js';
import exports from './export.js';
import goals from './goals.js';
import migration from './migration.js';
import equipment from './equipment.js';
import equipmentFields from './equipment-fields.js';
import equipmentImport from './equipment-import.js';
import online from './online.js';

/**
 * 安装顺序有实际意义：后者会覆盖或复用前者混入的成员，
 * 例如 characters 依赖 growth 的指标定义，equipment 依赖 data 的查找方法。
 * @type {Array<(D: Domain, U: any, gateway: any, preferences: Preferences) => void>}
 */
const installations = [
    storage,
    growth,
    characters,
    schools,
    statistics,
    ledger,
    exports,
    goals,
    migration,
    equipment,
    equipmentFields,
    equipmentImport,
    online,
];

// Plain domain state stays outside Vue proxies. A gateway is mandatory for persistence.
/**
 * @param {{ gateway?: any, preferences?: Preferences }} [options]
 * @returns {Domain}
 */
export function createDomain({
    gateway,
    preferences = { getItem: () => null, setItem() {} },
} = {}) {
    const D = createData(preferences);
    for (const install of installations) install(D, U, gateway, preferences);
    return D;
}
