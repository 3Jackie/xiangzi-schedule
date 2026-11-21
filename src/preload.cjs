const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('xiangzi', {
  getState: () => ipcRenderer.invoke('get-state'),
  setTheme: (date, theme) => ipcRenderer.invoke('set-theme', date, theme),
  setCategories: (categories, renames) => ipcRenderer.invoke('set-categories', categories, renames),
  setLanguage: language => ipcRenderer.invoke('set-language', language),
  confirmCategoryRemoval: name => ipcRenderer.invoke('confirm-category-removal', name),
  addItem: (date, item, repeat) => ipcRenderer.invoke('add-item', date, item, repeat),
  updateItem: (oldDate, newDate, item) => ipcRenderer.invoke('update-item', oldDate, newDate, item),
  deleteItem: (date, id) => ipcRenderer.invoke('delete-item', date, id),
  toggleItem: (date, id) => ipcRenderer.invoke('toggle-item', date, id),
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  syncStatus: () => ipcRenderer.invoke('sync-status'),
  syncCreate: (url, setup) => ipcRenderer.invoke('sync-create', url, setup),
  syncJoin: code => ipcRenderer.invoke('sync-join', code),
  syncNow: () => ipcRenderer.invoke('sync-now'),
  syncPairing: () => ipcRenderer.invoke('sync-pairing'),
  syncDisconnect: () => ipcRenderer.invoke('sync-disconnect'),
  syncClearConflicts: () => ipcRenderer.invoke('sync-clear-conflicts'),
  onStateChanged: callback => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('state-changed', listener);
    return () => ipcRenderer.removeListener('state-changed', listener);
  }
});
