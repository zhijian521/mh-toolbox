const { contextBridge, ipcRenderer } = require('electron');

// 渲染进程唯一的数据通道。急救通道（原始导出 / 隔离坏文件 / 备份列表 / 诊断）
// 与常规通道一样走白名单，主进程会校验调用者是否为当前主窗口主 frame。
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
    // ---- 急救通道 ----
    exportRaw: () => ipcRenderer.invoke('mhv2:exportRaw'),
    quarantineData: () => ipcRenderer.invoke('mhv2:quarantine'),
    listBackups: () => ipcRenderer.invoke('mhv2:listBackups'),
    readBackup: (name) => ipcRenderer.invoke('mhv2:readBackup', name),
    diagnostics: () => ipcRenderer.invoke('mhv2:diagnostics'),
    openPath: (target) => ipcRenderer.invoke('mhv2:openPath', target),
    openDataFile: () => ipcRenderer.invoke('mhv2:openDataFile'),
    // 渲染层未捕获异常转交主进程落盘，只写日志，不参与业务。
    logError: (text) => ipcRenderer.invoke('mhv2:logError', text),
});
