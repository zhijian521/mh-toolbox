'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mh', {
  loadData: () => ipcRenderer.invoke('mh:loadData'),
  saveData: (data, options) => ipcRenderer.invoke('mh:saveData', data, options),
  exportCsv: (text, defaultName) => ipcRenderer.invoke('mh:exportCsv', text, defaultName),
  exportData: (data) => ipcRenderer.invoke('mh:exportData', data),
  exportJson: (data, defaultName) => ipcRenderer.invoke('mh:exportJson', data, defaultName),
  importData: () => ipcRenderer.invoke('mh:importData'),
  recognizeEquipment: (image, id) => ipcRenderer.invoke('mh:recognizeEquipment', image, id),
  cancelEquipmentOcr: (id) => ipcRenderer.invoke('mh:cancelEquipmentOcr', id),
  equipmentClipboard: () => ipcRenderer.invoke('mh:equipmentClipboard'),
  onEquipmentOcrProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('mh:equipmentOcrProgress', listener);
    return () => ipcRenderer.removeListener('mh:equipmentOcrProgress', listener);
  },
  info: () => ipcRenderer.invoke('mh:info'),
  winMin: () => ipcRenderer.invoke('mh:winMin'),
  winMax: () => ipcRenderer.invoke('mh:winMax'),
  winClose: () => ipcRenderer.invoke('mh:winClose'),
  isMaximized: () => ipcRenderer.invoke('mh:winIsMax'),
  onWinState: (cb) => ipcRenderer.on('mh:winState', (_e, v) => cb(v)),
  onDevReload: (cb) => ipcRenderer.on('mh:dev-reload', () => cb()),
  onDevCss: (cb) => ipcRenderer.on('mh:dev-css', () => cb())
});
