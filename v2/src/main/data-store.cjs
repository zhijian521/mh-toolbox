const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function createDataStore(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'data.json');
    return {
        file,
        load() {
            try {
                return {
                    ok: true,
                    data: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
                };
            } catch (error) {
                return { ok: false, error: error.message };
            }
        },
        save(data, options = {}) {
            const temporary = file + '.tmp';
            try {
                if (
                    !data ||
                    !Array.isArray(data.characters) ||
                    !Number.isInteger(data.schemaVersion)
                )
                    throw new Error('数据格式不正确');
                if (fs.existsSync(file)) {
                    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
                    if (previous.schemaVersion > data.schemaVersion)
                        throw new Error('拒绝使用较低版本覆盖已有数据');
                    if (options.backupReason || previous.schemaVersion !== data.schemaVersion) {
                        const reason = ['import', 'wipe', 'demo'].includes(options.backupReason)
                            ? options.backupReason
                            : 'migration';
                        fs.copyFileSync(
                            file,
                            file +
                                `.before-${reason}-${Date.now()}-${randomUUID().slice(0, 8)}.bak`,
                            fs.constants.COPYFILE_EXCL,
                        );
                    }
                }
                fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
                fs.renameSync(temporary, file);
                return { ok: true };
            } catch (error) {
                try {
                    fs.unlinkSync(temporary);
                } catch {
                    /* No temporary file to clean up. */
                }
                return { ok: false, error: error.message };
            }
        },
    };
}
module.exports = { createDataStore };
