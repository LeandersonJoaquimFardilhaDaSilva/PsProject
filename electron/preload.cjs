const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('is-window-maximized'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onMaximizedChange: (callback) => {
    const subscription = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window-maximized-change', subscription);
    return () => {
      ipcRenderer.removeListener('window-maximized-change', subscription);
    };
  },
});
