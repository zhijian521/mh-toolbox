'use strict';
/* IPC 层：数据读写 / 备份导入导出 / 窗口控制（渲染进程经 preload 白名单调用） */
const { app, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let getWindow = null;

function dataFilePath() {
  return path.join(app.getPath('userData'), 'data.json');
}

function atomicWriteJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function registerIpc(opts) {
  getWindow = opts.getWindow;

  /* ---- 窗口控制 ---- */
  ipcMain.handle('mh:winMin', () => { const w = getWindow && getWindow(); if (w) w.minimize(); });
  ipcMain.handle('mh:winMax', () => {
    const w = getWindow && getWindow();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.handle('mh:winClose', () => { const w = getWindow && getWindow(); if (w) w.close(); });
  ipcMain.handle('mh:winIsMax', () => { const w = getWindow && getWindow(); return !!w && w.isMaximized(); });

  /* ---- 数据存取 ---- */
  ipcMain.handle('mh:loadData', () => {
    const file = dataFilePath();
    if (!fs.existsSync(file)) return { ok: true, data: null };
    try {
      return { ok: true, data: readJson(file) };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('mh:saveData', (_e, data) => {
    try {
      const file = dataFilePath();
      if (fs.existsSync(file) && readJson(file).schemaVersion !== 2 && data.schemaVersion === 2) {
        fs.copyFileSync(file, file + '.before-ledgers-' + Date.now() + '.bak');
      }
      atomicWriteJson(file, data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('mh:info', () => ({
    version: app.getVersion(),
    dataFile: dataFilePath(),
    platform: process.platform
  }));

  /* ---- 备份与导出 ---- */
  ipcMain.handle('mh:exportData', async (_e, data) => {
    const w = getWindow && getWindow();
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(w, {
      title: '导出备份数据',
      defaultPath: `梦幻养老助手备份-${stamp}.json`,
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      atomicWriteJson(r.filePath, data);
      return { ok: true, path: r.filePath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('mh:exportJson', async (_e, data, defaultName) => {
    const w = getWindow && getWindow();
    const r = await dialog.showSaveDialog(w, {
      title: '导出数据',
      defaultPath: defaultName || 'data.json',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    try {
      atomicWriteJson(r.filePath, data);
      return { ok: true, path: r.filePath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('mh:importData', async () => {
    const w = getWindow && getWindow();
    const r = await dialog.showOpenDialog(w, {
      title: '导入备份数据',
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    try {
      return { ok: true, data: readJson(r.filePaths[0]) };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
}

module.exports = { registerIpc };
