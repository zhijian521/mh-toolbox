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

// Plain domain state stays outside Vue proxies. A gateway is mandatory for persistence.
/** @param {{ gateway?: any, preferences?: any }} [options] */
export function createDomain({
    gateway,
    preferences = { getItem: () => null, setItem() {} },
} = {}) {
    const D = createData(preferences);
    for (const install of [
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
    ])
        install(D, U, gateway, preferences);
    return D;
}
