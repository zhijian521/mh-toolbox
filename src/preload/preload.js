'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mh', {
  loadData: () => ipcRenderer.invoke('mh:loadData'),
  saveData: (data) => ipcRenderer.invoke('mh:saveData', data),
  exportData: (data) => ipcRenderer.invoke('mh:exportData', data),
  exportJson: (data, defaultName) => ipcRenderer.invoke('mh:exportJson', data, defaultName),
  importData: () => ipcRenderer.invoke('mh:importData'),
  info: () => ipcRenderer.invoke('mh:info'),
  winMin: () => ipcRenderer.invoke('mh:winMin'),
  winMax: () => ipcRenderer.invoke('mh:winMax'),
  winClose: () => ipcRenderer.invoke('mh:winClose'),
  isMaximized: () => ipcRenderer.invoke('mh:winIsMax'),
  onWinState: (cb) => ipcRenderer.on('mh:winState', (_e, v) => cb(v))
});
