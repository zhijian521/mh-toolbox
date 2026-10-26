const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mhV2', {
    loadData: () => ipcRenderer.invoke('mhv2:loadData'),
    saveData: (data, options) => ipcRenderer.invoke('mhv2:saveData', data, options),
    info: () => ipcRenderer.invoke('mhv2:info'),
    importData: () => ipcRenderer.invoke('mhv2:importData'),
    exportData: (data) => ipcRenderer.invoke('mhv2:exportData', data),
    window: (action) => ipcRenderer.invoke('mhv2:window', action),
    getWindowState: () => ipcRenderer.invoke('mhv2:windowState'),
    onWindowStateChanged: (listener) => {
        const handler = (_event, state) => listener(state);
        ipcRenderer.on('mhv2:windowStateChanged', handler);
        return () => ipcRenderer.removeListener('mhv2:windowStateChanged', handler);
    },
});
