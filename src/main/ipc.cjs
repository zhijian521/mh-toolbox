const { ipcMain, dialog, shell } = require('electron');
const fs = require('node:fs/promises');
const nodeFs = require('node:fs');
const { assertExportPath } = require('./export-path.cjs');

/**
 * IPC 白名单。渲染进程只能调到这里注册过的通道，且调用者必须是主窗口主 frame。
 *
 * 与「急救通道」相关的几个通道（readRaw / quarantine / listBackups / ...）存在的理由：
 * 数据文件一旦无法解析，正常路径全都在设置页之后，而设置页在主界面失败时根本不可达。
 * 这些通道让启动错误屏能自救，不再只有一条必然失败的「重试」。
 */
function registerIpc({ app, store, logger, getWindow }) {
    const handle = (channel, fn) =>
        ipcMain.handle('mhv2:' + channel, (event, ...args) => {
            const win = getWindow();
            if (
                !win ||
                event.sender !== win.webContents ||
                event.senderFrame !== win.webContents.mainFrame
            ) {
                logger.warn('拒绝了来源不明的 IPC 调用：' + channel);
                throw new Error('无效的窗口请求');
            }
            return fn(...args);
        });

    /** 统一记录失败，避免静默丢弃（以前失败只弹 toast，事后无从查证）。 */
    const guarded = (channel, fn) =>
        handle(channel, async (...args) => {
            try {
                const result = await fn(...args);
                if (result && result.ok === false && result.error)
                    logger.warn('IPC ' + channel + ' 返回失败：' + result.error);
                return result;
            } catch (error) {
                logger.error('IPC ' + channel + ' 抛出异常', error);
                throw error;
            }
        });

    guarded('loadData', () => store.load());
    guarded('saveData', (data, options) => {
        const result = store.save(data, options);
        if (result.ok === false) logger.error('保存数据失败：' + result.error);
        return result;
    });
    handle('info', () => ({
        version: app.getVersion(),
        dataFile: store.file,
        dataDirectory: store.directory,
        logsDirectory: logger.directory,
        platform: process.platform,
        profile: 'mh-tool-v2',
    }));
    handle('window', (action) => {
        const win = getWindow();
        if (!win) return;
        if (action === 'minimize') win.minimize();
        else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
        else if (action === 'close') win.close();
    });
    handle('windowState', () => {
        const win = getWindow();
        return { maximized: win ? win.isMaximized() : false };
    });
    guarded('importData', async () => {
        const result = await dialog.showOpenDialog(getWindow(), {
            title: '选择备份副本导入 V2',
            properties: ['openFile'],
            filters: [{ name: 'JSON 备份', extensions: ['json'] }],
        });
        if (result.canceled) return { ok: false, canceled: true };
        try {
            const text = await fs.readFile(result.filePaths[0], 'utf8');
            // 体积保护：畸形大文件会让 JSON.parse 直接卡死渲染进程。
            if (text.length > 64 * 1024 * 1024)
                return { ok: false, error: '备份文件超过 64 MB，已停止导入' };
            return { ok: true, data: JSON.parse(text) };
        } catch (error) {
            logger.error('读取备份失败', error);
            return { ok: false, error: '读取备份失败：' + error.message };
        }
    });
    guarded('exportData', async (data) => {
        const result = await dialog.showSaveDialog(getWindow(), {
            title: '导出 V2 备份',
            defaultPath: '梦幻养老助手-V2-备份.json',
            filters: [{ name: 'JSON 备份', extensions: ['json'] }],
        });
        if (result.canceled) return { ok: false, canceled: true };
        try {
            assertExportPath(result.filePath, app.getPath('appData'), store.file);
            await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
            // 返回真实路径：桌面环境下用户需要知道文件去哪了。
            return { ok: true, filePath: result.filePath };
        } catch (error) {
            logger.error('导出备份失败', error);
            return { ok: false, error: '导出失败：' + error.message };
        }
    });

    // ---- 急救通道：数据打不开时使用，不依赖领域实例是否就绪 ----

    /** 把内存里的数据文件原样另存，即使无法解析也能抢救出来。 */
    guarded('exportRaw', async () => {
        const raw = store.readRaw();
        if (!raw.ok && !raw.text) return { ok: false, error: raw.error || '没有可导出的数据文件' };
        const stamp = new Date().toISOString().slice(0, 10);
        const result = await dialog.showSaveDialog(getWindow(), {
            title: '另存原始数据文件',
            defaultPath: 'data-原始副本-' + stamp + '.json',
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (result.canceled) return { ok: false, canceled: true };
        try {
            await fs.writeFile(result.filePath, raw.text, 'utf8');
            logger.info('已另存原始数据文件：' + result.filePath);
            return { ok: true, filePath: result.filePath };
        } catch (error) {
            logger.error('另存原始数据文件失败', error);
            return { ok: false, error: '另存失败：' + error.message };
        }
    });
    /** 把打不开的数据文件改名隔离，保留在磁盘上，随后可以用空数据启动。 */
    guarded('quarantine', () => {
        const result = store.quarantine();
        if (result.ok) logger.warn('数据文件已隔离：' + result.path);
        else logger.error('隔离数据文件失败：' + result.error);
        return result;
    });
    guarded('listBackups', () => ({ ok: true, backups: store.listBackups() }));
    guarded('readBackup', (name) => store.readBackup(name));
    /** 诊断信息：把数据文件、备份、日志的实际位置交给界面，方便用户自行取证。 */
    guarded('diagnostics', () => {
        const backups = store.listBackups();
        const raw = store.readRaw();
        return {
            ok: true,
            dataFile: store.file,
            dataDirectory: store.directory,
            logsDirectory: logger.directory,
            dataExists: raw.ok || !!raw.text,
            dataBytes: raw.text ? raw.text.length : 0,
            backups: backups.length,
            rollingBackups: backups.filter((entry) => entry.rolling).length,
            logTail: logger.read().split('\n').slice(-40).join('\n'),
        };
    });
    handle('openPath', async (target) => {
        const allowed = new Set([store.directory, logger.directory]);
        if (!allowed.has(target)) throw new Error('不允许打开该路径');
        const error = await shell.openPath(target);
        return error ? { ok: false, error } : { ok: true };
    });
    handle('openDataFile', async () => {
        // 打开所在目录并选中文件，data.json 可能不存在（首次启动）时退化为打开目录。
        if (!nodeFs.existsSync(store.file)) {
            const error = await shell.openPath(store.directory);
            return error ? { ok: false, error } : { ok: true };
        }
        shell.showItemInFolder(store.file);
        return { ok: true };
    });
    handle('logError', (text) => {
        // 渲染进程主动上报的异常：限长，避免异常风暴把日志刷爆。
        logger.error(String(text).slice(0, 8000));
        return { ok: true };
    });
    return { store };
}
module.exports = { registerIpc };
