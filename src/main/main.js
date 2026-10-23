'use strict';
/* 主进程：窗口生命周期与模块装配（IPC 见 ipc.js，开发辅助见 screenshot.js） */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { registerIpc } = require('./ipc');
const { attachDevFlows } = require('./screenshot');

app.disableHardwareAcceleration();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f2ecdd',
    frame: false,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  mainWindow.removeMenu();
  mainWindow.on('maximize', () => mainWindow.webContents.send('mh:winState', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('mh:winState', false));
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  attachDevFlows(mainWindow);
  if (process.argv.includes('--dev')) {
    require('./dev').setupDevWatch(mainWindow);
  }
  if (process.argv.includes('--demo')) {
    mainWindow.webContents.on('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 600));
        await mainWindow.webContents.executeJavaScript('Views.loadDemoData(true)', true);
        console.log('[demo] 示例数据已写入本地数据文件');
      } catch (e) {
        console.error('[demo] 写入失败:', e);
      }
      mainWindow.close();
    });
  }
}

app.whenReady().then(() => {
  registerIpc({ getWindow: () => mainWindow });
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => app.quit());
