'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');

function isolate(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-' + name + '-test-'));
  app.setPath('userData', dir);
  app.disableHardwareAcceleration();
  return dir;
}
async function createWindow(errors) {
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, frame: false,
    webPreferences: { preload: path.join(root, 'src/preload/preload.js'), contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error') errors.push(details.message);
  });
  await win.loadFile(path.join(root, 'src/renderer/index.html'));
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  return win;
}
module.exports = { isolate, createWindow };
