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
  onStateChanged: callback => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('state-changed', listener);
    return () => ipcRenderer.removeListener('state-changed', listener);
  }
});
