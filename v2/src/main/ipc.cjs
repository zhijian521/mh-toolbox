const { ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const { assertExportPath } = require('./export-path.cjs');

function registerIpc({ app, store, getWindow }) {
    const handle = (channel, fn) =>
        ipcMain.handle('mhv2:' + channel, (event, ...args) => {
            const win = getWindow();
            if (
                !win ||
                event.sender !== win.webContents ||
                event.senderFrame !== win.webContents.mainFrame
            )
                throw new Error('无效的窗口请求');
            return fn(...args);
        });
    handle('loadData', () => store.load());
    handle('saveData', (data, options) => store.save(data, options));
    handle('info', () => ({
        version: app.getVersion(),
        dataFile: store.file,
        platform: process.platform,
        profile: 'mh-tool-v2',
    }));
    handle('window', (action) => {
        const win = getWindow();
        if (action === 'minimize') win.minimize();
        else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
        else if (action === 'close') win.close();
    });
    handle('windowState', () => ({ maximized: getWindow().isMaximized() }));
    handle('importData', async () => {
        const result = await dialog.showOpenDialog(getWindow(), {
            title: '选择备份副本导入 V2',
            properties: ['openFile'],
            filters: [{ name: 'JSON 备份', extensions: ['json'] }],
        });
        if (result.canceled) return { ok: false, canceled: true };
        try {
            return {
                ok: true,
                data: JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')),
            };
        } catch (error) {
            return { ok: false, error: '读取备份失败：' + error.message };
        }
    });
    handle('exportData', async (data) => {
        const result = await dialog.showSaveDialog(getWindow(), {
            title: '导出 V2 备份',
            defaultPath: '梦幻养老助手-V2-备份.json',
            filters: [{ name: 'JSON 备份', extensions: ['json'] }],
        });
        if (result.canceled) return { ok: false, canceled: true };
        try {
            assertExportPath(result.filePath, app.getPath('appData'), store.file);
            await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8');
            return { ok: true };
        } catch (error) {
            return { ok: false, error: '导出失败：' + error.message };
        }
    });
}
module.exports = { registerIpc };
