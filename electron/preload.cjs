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
  // Gerenciamento de Arquivos Locais e Streaming (v0.3.0)
  getDocumentsFolder: () => ipcRenderer.invoke('get-documents-folder'),
  saveFileToDocuments: (data) => ipcRenderer.invoke('save-file-to-documents', data),
  openFileLocation: (filePath) => ipcRenderer.invoke('open-file-location', filePath),
  openFileExternal: (filePath) => ipcRenderer.invoke('open-file-external', filePath),
  broadcastSyncPush: (data) => ipcRenderer.invoke('broadcast-sync-push', data),
  registerOriginalFile: (data) => ipcRenderer.invoke('register-original-file', data),
  requestFileDownloadFromMobile: (data) => ipcRenderer.invoke('request-file-download-from-mobile', data),
  onFileReceivedFromMobile: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('file-received-from-mobile', subscription);
    return () => {
      ipcRenderer.removeListener('file-received-from-mobile', subscription);
    };
  },
  onFileProgress: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on('file-transfer-progress', subscription);
    return () => {
      ipcRenderer.removeListener('file-transfer-progress', subscription);
    };
  },
});
