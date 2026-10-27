const fs = require('node:fs');
const path = require('node:path');

/**
 * 主进程日志。
 *
 * 打包后的 Windows GUI 应用没有控制台，console.* 的输出用户永远看不到，出问题时
 * 也没有东西可以交回排查。这里把启动失败、保存失败和未捕获异常追加到
 * `%APPDATA%/mh-tool-v2/logs/main.log`，并在设置页提供「打开日志目录」。
 *
 * 落盘失败绝不能让调用方失败：日志是诊断手段，不是业务流程的一环。
 */

const MAX_BYTES = 1024 * 1024;
const KEEP_FILES = 3;

function timestamp() {
    const now = new Date();
    const pad = (value, size = 2) => String(value).padStart(size, '0');
    // 本地时间便于用户与自己的操作时间对照，末尾附带时区偏移。
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return (
        now.getFullYear() +
        '-' +
        pad(now.getMonth() + 1) +
        '-' +
        pad(now.getDate()) +
        ' ' +
        pad(now.getHours()) +
        ':' +
        pad(now.getMinutes()) +
        ':' +
        pad(now.getSeconds()) +
        '.' +
        pad(now.getMilliseconds(), 3) +
        ' ' +
        sign +
        pad(Math.floor(abs / 60)) +
        ':' +
        pad(abs % 60)
    );
}

function describe(error) {
    if (error instanceof Error) return error.stack || error.message;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function rotate(file) {
    if (!fs.existsSync(file)) return;
    let size = 0;
    try {
        size = fs.statSync(file).size;
    } catch {
        return;
    }
    if (size < MAX_BYTES) return;
    // 依次后移：main.log -> main.log.1 -> main.log.2，超出保留数直接丢弃。
    try {
        for (let index = KEEP_FILES - 1; index >= 1; index--) {
            const from = index === 1 ? file : file + '.' + (index - 1);
            const to = file + '.' + index;
            if (fs.existsSync(from)) fs.renameSync(from, to);
        }
    } catch {
        /* 轮转失败不影响本次写入。 */
    }
}

/**
 * @param {string} directory 日志目录，通常是 `<userData>/logs`。
 */
function createLogger(directory) {
    const file = path.join(directory, 'main.log');
    function write(level, message, error) {
        const line =
            '[' +
            timestamp() +
            '] [' +
            level +
            '] ' +
            message +
            (error ? '\n' + describe(error) : '');
        try {
            fs.mkdirSync(directory, { recursive: true });
            rotate(file);
            fs.appendFileSync(file, line + '\n', 'utf8');
        } catch {
            /* 磁盘不可写时静默放弃，日志不能反过来弄崩应用。 */
        }
        // 开发模式仍打到终端，便于热更新时观察。
        if (level === 'error') console.error(line);
        else console.log(line);
    }
    return {
        file,
        directory,
        info: (message) => write('info', message),
        warn: (message, error) => write('warn', message, error),
        error: (message, error) => write('error', message, error),
        /** 读取最近的日志内容，供设置页展示或复制。 */
        read() {
            try {
                return fs.readFileSync(file, 'utf8');
            } catch {
                return '';
            }
        },
    };
}

module.exports = { createLogger };
