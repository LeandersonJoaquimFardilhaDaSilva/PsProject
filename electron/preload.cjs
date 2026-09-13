const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  fetchDirectHtml: (url) => ipcRenderer.invoke('fetch-direct-html', url),
  onMaximizedChange: (callback) => {
    const subscription = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized-change', subscription);
    return () => {
      ipcRenderer.removeListener('window-maximized-change', subscription);
    };
  },
  // APIs de Sincronização Local
  getSyncInfo: () => ipcRenderer.invoke('get-sync-info'),
  regenerateSyncToken: () => ipcRenderer.invoke('regenerate-sync-token'),
  onSyncIncoming: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('sync-incoming', subscription);
    return () => {
      ipcRenderer.removeListener('sync-incoming', subscription);
    };
  },
  sendSyncResponse: (syncId, data) => ipcRenderer.invoke(`sync-response-${syncId}`, data),
  onSyncClientConnected: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('sync-client-connected', subscription);
    return () => {
      ipcRenderer.removeListener('sync-client-connected', subscription);
    };
  },
});
