const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/**
 * 数据文件读写。
 *
 * 写盘顺序：临时文件 -> fsync 临时文件 -> rename -> fsync 目录。
 * 只做 write+rename 能扛应用崩溃，但断电窗口里目录项可能还没落盘，
 * 文件会变成 0 字节；补上两次 fsync 才算真正原子。
 *
 * 备份分两类：
 * - 事务性备份（导入/清空/换版）沿用 `<file>.before-<reason>-<时间>-<随机>.bak`；
 * - 滚动备份（每次成功写盘前）写 `<file>.roll-<序号>.bak`，固定保留 3 份。
 * 滚动备份解决的是「一次错误的正常保存」——以前这种情况完全无法恢复。
 */

const ROLLING_COUNT = 3;

function fsyncFile(file) {
    let handle;
    try {
        handle = fs.openSync(file, 'r+');
        fs.fsyncSync(handle);
    } catch {
        /* 部分文件系统/权限不支持 fsync，退化为普通写入。 */
    } finally {
        if (handle !== undefined) {
            try {
                fs.closeSync(handle);
            } catch {
                /* 忽略关闭失败。 */
            }
        }
    }
}

function fsyncDirectory(directory) {
    // Windows 不支持对目录 fsync，open 会直接失败；这是平台限制，不是缺陷。
    if (process.platform === 'win32') return;
    let handle;
    try {
        handle = fs.openSync(directory, 'r');
        fs.fsyncSync(handle);
    } catch {
        /* 忽略：目录 fsync 只是加强保证。 */
    } finally {
        if (handle !== undefined) {
            try {
                fs.closeSync(handle);
            } catch {
                /* 忽略关闭失败。 */
            }
        }
    }
}

/**
 * @param {string} directory 数据目录，通常是 `<userData>`。
 */
function createDataStore(directory) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'data.json');
    const temporary = file + '.tmp';

    /** 滚动备份：写盘前先把当前文件复制成 roll-N，按修改时间保留最新几份。 */
    function rotateBackups() {
        if (!fs.existsSync(file)) return;
        const prefix = path.basename(file) + '.roll-';
        let existing = [];
        try {
            existing = fs
                .readdirSync(directory)
                .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
                .map((name) => path.join(directory, name))
                .map((name) => ({ name, time: fs.statSync(name).mtimeMs }))
                .sort((a, b) => b.time - a.time);
        } catch {
            return;
        }
        // 先清理超出保留数的旧备份，再让出最小序号写新备份。
        existing.slice(ROLLING_COUNT - 1).forEach((entry) => {
            try {
                fs.unlinkSync(entry.name);
            } catch {
                /* 忽略清理失败。 */
            }
        });
        try {
            fs.copyFileSync(file, file + '.roll-' + Date.now() + '.bak');
        } catch {
            /* 备份失败不应阻止保存：宁可没有备份，也不要让用户存不下数据。 */
        }
        // 尺寸统一裁到上限，避免异常情况下堆积。
        try {
            const kept = fs
                .readdirSync(directory)
                .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
                .map((name) => path.join(directory, name))
                .map((name) => ({ name, time: fs.statSync(name).mtimeMs }))
                .sort((a, b) => b.time - a.time);
            kept.slice(ROLLING_COUNT).forEach((entry) => {
                try {
                    fs.unlinkSync(entry.name);
                } catch {
                    /* 忽略清理失败。 */
                }
            });
        } catch {
            /* 忽略。 */
        }
    }

    /** 列出可用于恢复的备份，最新在前。 */
    function listBackups() {
        try {
            return fs
                .readdirSync(directory)
                .filter(
                    (name) => name.startsWith(path.basename(file) + '.') && name.endsWith('.bak'),
                )
                .map((name) => {
                    const full = path.join(directory, name);
                    const stat = fs.statSync(full);
                    return {
                        name,
                        path: full,
                        size: stat.size,
                        time: stat.mtimeMs,
                        rolling: name.includes('.roll-'),
                    };
                })
                .sort((a, b) => b.time - a.time);
        } catch {
            return [];
        }
    }

    return {
        file,
        directory,
        load() {
            try {
                if (!fs.existsSync(file)) return { ok: true, data: null };
                const text = fs.readFileSync(file, 'utf8');
                // 空文件是最常见的损坏形态，单独给出可读原因。
                if (!text.trim())
                    return {
                        ok: false,
                        error: '数据文件为空（0 字节），可能上次写入被中断',
                        empty: true,
                    };
                return { ok: true, data: JSON.parse(text) };
            } catch (error) {
                return { ok: false, error: error.message };
            }
        },
        save(data, options = {}) {
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
                    } else {
                        // 普通保存：留一份滚动备份，覆盖「保存后才发现写错」的场景。
                        rotateBackups();
                    }
                }
                fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
                fsyncFile(temporary);
                fs.renameSync(temporary, file);
                fsyncDirectory(directory);
                return { ok: true };
            } catch (error) {
                try {
                    fs.unlinkSync(temporary);
                } catch {
                    /* 没有临时文件需要清理。 */
                }
                return { ok: false, error: error.message };
            }
        },
        listBackups,
        /** 读取某个备份的原始文本，供「从备份恢复」预览与解析。 */
        readBackup(name) {
            const target = path.join(directory, path.basename(name));
            if (!fs.existsSync(target)) return { ok: false, error: '备份文件不存在' };
            try {
                return { ok: true, data: JSON.parse(fs.readFileSync(target, 'utf8')) };
            } catch (error) {
                return { ok: false, error: error.message };
            }
        },
        /** 原始字节的读取结果，急救通道用：即使 JSON 解析失败也要能拿到文本。 */
        readRaw() {
            try {
                if (!fs.existsSync(file)) return { ok: false, error: '数据文件不存在', text: '' };
                return { ok: true, text: fs.readFileSync(file, 'utf8') };
            } catch (error) {
                return { ok: false, error: error.message, text: '' };
            }
        },
        /**
         * 把当前数据文件改名隔离，随后应用可以用空数据启动。
         * 文件不删除、不截断，始终保留在同目录下，便于事后人工取回。
         */
        quarantine() {
            if (!fs.existsSync(file)) return { ok: false, error: '数据文件不存在，无需隔离' };
            const target =
                file + '.quarantined-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
            try {
                fs.renameSync(file, target);
                return { ok: true, path: target };
            } catch (error) {
                return { ok: false, error: error.message };
            }
        },
        /** 清理残留的临时文件，启动自检时使用。 */
        clearTemporary() {
            try {
                if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            } catch {
                /* 忽略。 */
            }
        },
    };
}

module.exports = { createDataStore };
