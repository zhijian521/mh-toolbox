const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { configureProfile } = require('./profile.cjs');
const { createDataStore } = require('./data-store.cjs');
const { registerIpc } = require('./ipc.cjs');

configureProfile(app); // Before ready or creating any Chromium session.
app.disableHardwareAcceleration();
if (process.platform === 'win32') app.setAppUserModelId('com.zhijian.mhtool.v2');
let window;
async function createWindow() {
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
        console.log('[V2] 桌面窗口已显示。');
    });
    window.removeMenu();
    const publishWindowState = () => {
        window.webContents.send('mhv2:windowStateChanged', { maximized: window.isMaximized() });
    };
    window.on('maximize', publishWindowState);
    window.on('unmaximize', publishWindowState);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    const development = !app.isPackaged && process.argv.includes('--dev');
    if (development) await window.loadURL('http://127.0.0.1:5174');
    else await window.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
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
            registerIpc({ app, store, getWindow: () => window });
            await createWindow();
        })
        .catch((error) => {
            console.error(error);
            app.exit(1);
        });
    app.on('window-all-closed', () => app.quit());
}
