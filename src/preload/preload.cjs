const { contextBridge, ipcRenderer } = require('electron');

// 渲染进程唯一的数据通道。急救通道（原始导出 / 隔离坏文件 / 备份列表 / 诊断）
// 与常规通道一样走白名单，主进程会校验调用者是否为当前主窗口主 frame。
contextBridge.exposeInMainWorld('mhV2', {
    loadData: () => ipcRenderer.invoke('mhv2:loadData'),
    saveData: (data, options) => ipcRenderer.invoke('mhv2:saveData', data, options),
    info: () => ipcRenderer.invoke('mhv2:info'),
    importData: () => ipcRenderer.invoke('mhv2:importData'),
    exportData: (data) => ipcRenderer.invoke('mhv2:exportData', data),
    // 通用文本导出/导入：CSV 记录与单价表共用，路径与体积校验都在主进程。
    saveTextFile: (content, options) => ipcRenderer.invoke('mhv2:saveTextFile', content, options),
    openTextFile: (options) => ipcRenderer.invoke('mhv2:openTextFile', options),
    window: (action) => ipcRenderer.invoke('mhv2:window', action),
    getWindowState: () => ipcRenderer.invoke('mhv2:windowState'),
    // 外观：偏好存在主进程，切换要走主进程才能改到 prefers-color-scheme。
    getTheme: () => ipcRenderer.invoke('mhv2:getTheme'),
    setTheme: (theme) => ipcRenderer.invoke('mhv2:setTheme', theme),
    // 外链一律交给系统浏览器：窗口把 window.open 与导航都拦了，`<a>` 点不开。
    openExternal: (url) => ipcRenderer.invoke('mhv2:openExternal', url),
    onWindowStateChanged: (listener) => {
        const handler = (_event, state) => listener(state);
        ipcRenderer.on('mhv2:windowStateChanged', handler);
        return () => ipcRenderer.removeListener('mhv2:windowStateChanged', handler);
    },
    // ---- 装备截图识别（本地 OCR，图片不落盘、不上传）----
    recognizeEquipment: (image, id) => ipcRenderer.invoke('mhv2:recognizeEquipment', image, id),
    cancelEquipmentOcr: (id) => ipcRenderer.invoke('mhv2:cancelEquipmentOcr', id),
    equipmentClipboard: () => ipcRenderer.invoke('mhv2:equipmentClipboard'),
    onEquipmentOcrProgress: (listener) => {
        const handler = (_event, data) => listener(data);
        ipcRenderer.on('mhv2:equipmentOcrProgress', handler);
        return () => ipcRenderer.removeListener('mhv2:equipmentOcrProgress', handler);
    },
    // ---- 急救通道 ----
    exportRaw: () => ipcRenderer.invoke('mhv2:exportRaw'),
    quarantineData: () => ipcRenderer.invoke('mhv2:quarantine'),
    listBackups: () => ipcRenderer.invoke('mhv2:listBackups'),
    readBackup: (name) => ipcRenderer.invoke('mhv2:readBackup', name),
    diagnostics: () => ipcRenderer.invoke('mhv2:diagnostics'),
    openPath: (target) => ipcRenderer.invoke('mhv2:openPath', target),
    // 渲染层未捕获异常转交主进程落盘，只写日志，不参与业务。
    logError: (text) => ipcRenderer.invoke('mhv2:logError', text),
});
