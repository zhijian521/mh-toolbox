const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const { configureProfile } = require('./profile.cjs');
const { createDataStore } = require('./data-store.cjs');
const { createLogger } = require('./logger.cjs');
const { registerIpc } = require('./ipc.cjs');

const profile = configureProfile(app); // Before ready or creating any Chromium session.
const logger = createLogger(path.join(profile, 'logs'));

// 打包后的 GUI 应用没有控制台，未捕获异常必须落盘，否则事后无从排查。
process.on('uncaughtException', (error) => {
    logger.error('主进程未捕获异常', error);
});
process.on('unhandledRejection', (reason) => {
    logger.error('主进程未处理的 Promise 拒绝', reason);
});

app.disableHardwareAcceleration();
if (process.platform === 'win32') app.setAppUserModelId('com.zhijian.mhtool.v2');
let window;

function createWindow() {
    window = new BrowserWindow({
        width: 1280,
        height: 840,
        minWidth: 1024,
        minHeight: 680,
        title: '梦幻养老助手 V2',
        backgroundColor: '#f2ecdd',
        frame: false,
        show: false,
        icon: path.join(__dirname, '../../build/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
        },
    });
    window.once('ready-to-show', () => {
        window.show();
        window.focus();
        logger.info('桌面窗口已显示。');
    });
    window.removeMenu();
    const publishWindowState = () => {
        if (!window || window.isDestroyed()) return;
        window.webContents.send('mhv2:windowStateChanged', { maximized: window.isMaximized() });
    };
    window.on('maximize', publishWindowState);
    window.on('unmaximize', publishWindowState);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    // 渲染进程崩溃时留下记录；主窗口监听同目录日志便于事后定位。
    window.webContents.on('render-process-gone', (_event, details) => {
        logger.error(
            '渲染进程异常退出：' + details.reason + '（exitCode ' + details.exitCode + '）',
        );
    });
    window.webContents.on('console-message', (...args) => {
        // Electron 36 起该事件把参数合并到事件对象上；两种签名都兼容。
        const first = args[0];
        const level = typeof args[1] === 'number' ? args[1] : first && first.level;
        const message = typeof args[2] === 'string' ? args[2] : first && first.message;
        const source = typeof args[4] === 'string' ? args[4] : first && first.sourceId;
        const line = typeof args[3] === 'number' ? args[3] : first && first.lineNumber;
        if (level === 2 || level === 'error' || level === 3)
            logger.warn('渲染进程控制台：' + message + ' @ ' + source + ':' + line);
    });
    const development = !app.isPackaged && process.argv.includes('--dev');
    return development
        ? window.loadURL('http://127.0.0.1:5174')
        : window.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
    app.on('second-instance', () => {
        if (window) {
            if (window.isMinimized()) window.restore();
            window.show();
            window.focus();
        }
    });
    app.whenReady()
        .then(async () => {
            const store = createDataStore(app.getPath('userData'));
            // 上次异常退出可能留下半写文件，启动时先清掉，避免它被误当成有效数据。
            store.clearTemporary();
            logger.info('应用启动，版本 ' + app.getVersion() + '，数据文件 ' + store.file);
            registerIpc({ app, store, logger, getWindow: () => window });
            await createWindow();
        })
        .catch((error) => {
            logger.error('应用启动失败', error);
            // 窗口都建不起来时至少给用户一个可读的说明和日志位置。
            dialog.showErrorBox(
                '梦幻养老助手 V2 启动失败',
                '应用无法启动。\n\n' +
                    error.message +
                    '\n\n日志目录：\n' +
                    logger.directory +
                    '\n\n可以把这个目录里的 main.log 提供给开发者。',
            );
            app.exit(1);
        });
    app.on('window-all-closed', () => app.quit());
}
