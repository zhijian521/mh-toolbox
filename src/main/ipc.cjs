const { ipcMain, dialog, shell, clipboard } = require('electron');
const fs = require('node:fs/promises');
const { assertExportPath } = require('./export-path.cjs');
const { createEquipmentOcr } = require('./equipment-ocr.cjs');

/**
 * IPC 白名单。渲染进程只能调到这里注册过的通道，且调用者必须是主窗口主 frame。
 *
 * 与「急救通道」相关的几个通道（readRaw / quarantine / listBackups / ...）存在的理由：
 * 数据文件一旦无法解析，正常路径全都在设置页之后，而设置页在主界面失败时根本不可达。
 * 这些通道让启动错误屏能自救，不再只有一条必然失败的「重试」。
 */
function registerIpc({ app, store, logger, theme, getWindow }) {
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
    /*
     * 主题：主进程持有偏好，切换时同时改 nativeTheme.themeSource（渲染层的
     * prefers-color-scheme 随之变）与窗口底色，两处必须一起动——只改一个会
     * 出现「界面已经变暗、缩放窗口时闪一下浅底」。
     */
    handle('getTheme', () => theme.snapshot());
    handle('setTheme', (value) => {
        const state = theme.set(value);
        const win = getWindow();
        if (win && !win.isDestroyed()) win.setBackgroundColor(state.background);
        logger.info('主题切换为 ' + state.theme + '（当前' + (state.dark ? '深色' : '浅色') + '）');
        return state;
    });
    /*
     * 外链：主窗口把 window.open 全拒、will-navigate 也拦着（见 main.cjs），
     * 点 `<a href>` 不会有任何反应，必须由主进程交给系统浏览器。
     * 只放行白名单里的 https 域名——将来某处若把字符串拼进 URL，也递不进任意地址。
     */
    const externalHosts = new Set(['github.com', 'polyformproject.org']);
    handle('openExternal', async (value) => {
        let target;
        try {
            target = new URL(String(value));
        } catch {
            throw new Error('链接格式不正确');
        }
        if (target.protocol !== 'https:' || !externalHosts.has(target.hostname)) {
            logger.warn('拒绝了白名单之外的外链：' + target.href);
            throw new Error('只能打开项目相关的官方链接');
        }
        await shell.openExternal(target.href);
        logger.info('在系统浏览器打开 ' + target.href);
        return { ok: true };
    });
    /**
     * 装备截图识别。
     *
     * 图片从渲染进程以 dataURL 传进来，只在内存里过一遍；进度用事件回推给同一个
     * 窗口。`recognize` 内部把失败都收敛成 `{ok:false,error}`，因此这里不再抛异常，
     * 用户看到的是「裁剪一下再试」这种能照着做的提示。
     */
    const equipmentOcr = createEquipmentOcr({ logger });
    guarded('recognizeEquipment', (image, id) =>
        equipmentOcr.recognize(getWindow().webContents, image, id),
    );
    handle('cancelEquipmentOcr', (id) => {
        const win = getWindow();
        if (win) equipmentOcr.cancel(win.webContents, id);
    });
    handle('equipmentClipboard', () => {
        // 读剪贴板图片而不是让渲染层调 navigator.clipboard：后者在沙箱里拿不到位图。
        const image = clipboard.readImage();
        if (image.isEmpty()) return '';
        const size = image.getSize();
        if (size.width * size.height > 16 * 1024 * 1024)
            throw new Error('图片尺寸过大，请截取单件装备属性');
        return image.toDataURL();
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

    /**
     * 通用文本导出（CSV、单价表）。
     *
     * 内容由渲染层生成，主进程只管挑路径与落盘。照样套 `assertExportPath`：
     * 用户把文件名填成 data.json 并选到数据目录时，仍然不能覆盖正在用的档案。
     *
     * @param {string} content 已经带好换行与 BOM
     * @param {{ title?: string, defaultName?: string, filterName?: string, ext?: string }} [options]
     */
    guarded('saveTextFile', async (content, options) => {
        const opt = options && typeof options === 'object' ? options : {};
        const ext = String(opt.ext || 'txt').replace(/^\./, '');
        const defaultName = String(opt.defaultName || '导出.' + ext);
        const result = await dialog.showSaveDialog(getWindow(), {
            title: String(opt.title || '导出文件'),
            defaultPath: defaultName,
            filters: [
                { name: String(opt.filterName || ext.toUpperCase() + ' 文件'), extensions: [ext] },
            ],
        });
        if (result.canceled) return { ok: false, canceled: true };
        try {
            assertExportPath(result.filePath, app.getPath('appData'), store.file);
            const text = String(content == null ? '' : content);
            await fs.writeFile(result.filePath, text, 'utf8');
            logger.info('已导出 ' + defaultName + '：' + result.filePath);
            return { ok: true, filePath: result.filePath, bytes: Buffer.byteLength(text, 'utf8') };
        } catch (error) {
            logger.error('导出文本文件失败', error);
            return { ok: false, error: '导出失败：' + error.message };
        }
    });
    /**
     * 通用文本导入（单价表）。与 `importData` 的区别：那个专读整份 JSON 备份，
     * 标题和过滤器都写死了，拿来读单价表会让用户以为要覆盖全部数据。
     */
    guarded('openTextFile', async (options) => {
        const opt = options && typeof options === 'object' ? options : {};
        const ext = String(opt.ext || 'csv').replace(/^\./, '');
        const result = await dialog.showOpenDialog(getWindow(), {
            title: String(opt.title || '选择文件'),
            properties: ['openFile'],
            filters: [
                { name: String(opt.filterName || ext.toUpperCase() + ' 文件'), extensions: [ext] },
            ],
        });
        if (result.canceled) return { ok: false, canceled: true };
        try {
            const text = await fs.readFile(result.filePaths[0], 'utf8');
            // 与备份导入同一条体积保护：畸形大文件会把渲染进程卡死。
            if (text.length > 8 * 1024 * 1024)
                return { ok: false, error: '文件超过 8 MB，已停止导入' };
            return { ok: true, text, filePath: result.filePaths[0] };
        } catch (error) {
            logger.error('读取文本文件失败', error);
            return { ok: false, error: '读取失败：' + error.message };
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
    handle('logError', (text) => {
        // 渲染进程主动上报的异常：限长，避免异常风暴把日志刷爆。
        logger.error(String(text).slice(0, 8000));
        return { ok: true };
    });
    return { store };
}
module.exports = { registerIpc };
