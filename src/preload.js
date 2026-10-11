const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hideApp', {
  getState: () => ipcRenderer.invoke('get-state'),
  getViewState: () => ipcRenderer.invoke('get-view-state'),
  getLanguage: () => ipcRenderer.invoke('get-language'),
  setLanguage: language => ipcRenderer.invoke('set-language', language),
  setEnabled: enabled => ipcRenderer.invoke('enable', enabled),
  restore: id => ipcRenderer.invoke('restore', id),
  restoreAll: () => ipcRenderer.invoke('restore-all'),
  windowControl: action => ipcRenderer.send('window-control', action),
  onState: callback => ipcRenderer.on('state', (_event, state) => callback(state)),
  onMaximized: callback => ipcRenderer.on('maximized', (_event, maximized) => callback(maximized)),
});
