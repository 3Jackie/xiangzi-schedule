const { app, BrowserWindow, ipcMain, dialog, Notification, shell, Tray, Menu, nativeImage, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { translate } = require('./locales.js');
const { THEMES, DEFAULT_CATEGORIES, cleanCategories, isDateKey, createOccurrenceDates, dueReminders, cleanItem, validateState } = require('./core.cjs');
const { SyncClient } = require('./sync.cjs');
const { createSyncStore } = require('./sync-store.cjs');

const edition = global.XIANGZI_EDITION || process.env.XIANGZI_EDITION || 'special';
const isGeneral = edition === 'general';
const APP_ID = isGeneral ? 'app.xiangzi.schedule.general' : 'app.xiangzi.schedule.special';
if (isGeneral) app.setPath('userData', path.join(app.getPath('appData'), 'xiangzi-schedule-general'));
const dataDir = path.join(app.getPath('userData'), 'schedule-data');
const dataFile = path.join(dataDir, 'plans.json');
fs.mkdirSync(dataDir, { recursive: true });

let state = { version: 1, days: {}, ...(isGeneral ? { categories: [...DEFAULT_CATEGORIES], language: 'zh-CN' } : {}) };
let startupError = '';
let dataLocked = false;
let mainWindow;
let tray;
let quitting = false;
let syncClient;
let syncStore;
let syncData = {};
let syncStartupError = '';
let syncTimer;
app.setAppUserModelId(APP_ID);

function t(text, values) { return translate(isGeneral ? state.language : 'zh-CN', text, values); }

function validateAppState(value) {
  return validateState(value, { edition: isGeneral ? 'general' : 'special' });
}

try {
  if (fs.existsSync(dataFile)) state = validateAppState(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
} catch (error) {
  startupError = error.message;
  dataLocked = true;
  try {
    fs.copyFileSync(dataFile, path.join(dataDir, `plans-recovery-${Date.now()}.json`));
  } catch (copyError) {
    console.error('Could not preserve the unreadable data file:', copyError.message);
  }
}

function persist(next, allowLocked = false, fromSync = false) {
  if (dataLocked && !allowLocked) throw new Error('计划文件无法读取。请先导入有效备份，再继续修改日程。');
  const valid = validateAppState(next);
  if (!fromSync) syncStore?.checkpointLocalState(valid);
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(valid, null, 2), 'utf8');
  if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, `${dataFile}.bak`);
  fs.renameSync(tempFile, dataFile);
  state = valid;
  startupError = '';
  dataLocked = false;
  mainWindow?.webContents.send('state-changed', getSnapshot());
  if (!fromSync) scheduleSync();
  return getSnapshot();
}

function getSnapshot() {
  return { state, startupError, dataPath: dataFile, edition, themeChoices: isGeneral ? state.categories : THEMES,
    ...(!isGeneral ? { sync: syncClient?.status() || { connected: false, error: syncStartupError } } : {}) };
}

function scheduleSync() {
  clearTimeout(syncTimer);
  if (isGeneral || !syncData.config || !syncClient) return;
  syncTimer = setTimeout(() => {
    if (syncClient.running) { scheduleSync(); return; }
    if (!dataLocked) syncClient.syncNow().catch(() => {});
  }, 1500);
  syncTimer.unref();
}

function initializeSync() {
  if (isGeneral) return;
  const store = syncStore = createSyncStore(dataDir, safeStorage);
  try {
    const pending = store.recover();
    if (pending) store.commit(pending, value => persist(value, true, true));
    syncData = store.load();
  } catch {
    syncStartupError = '无法读取同步凭据，离线日程仍可使用。请重新配对。';
  }
  syncClient = new SyncClient({
    getBundle: () => ({ state, sync: syncData }),
    saveBundle: (bundle, expectedState) => {
      if (dataLocked) throw new Error('请先恢复本机日程，再进行同步');
      if (expectedState && JSON.stringify(state) !== JSON.stringify(expectedState)) return false;
      store.commit(bundle, value => persist(value, false, true));
      syncData = bundle.sync;
      return true;
    },
    onStatus: () => mainWindow?.webContents.send('state-changed', getSnapshot())
  });
  if (syncStartupError) syncClient.error = syncStartupError;
  setInterval(() => {
    if (syncData.config && !syncClient.running && !dataLocked) syncClient.syncNow().catch(() => {});
  }, 30000).unref();
  scheduleSync();
}

function ensureDay(days, date) {
  if (!isDateKey(date)) throw new Error('请选择有效日期');
  if (!days[date]) days[date] = { theme: '', items: [] };
  return days[date];
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1060,
    minHeight: 720,
    title: '巷子日程',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#f5f3ee',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  updateTrayLanguage();
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

function updateTrayLanguage() {
  if (!tray) return;
  tray.setToolTip(t('巷子日程 · 日程提醒'));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t('打开巷子日程'), click: showMainWindow },
    { type: 'separator' },
    { label: t('退出巷子日程'), click: () => { quitting = true; app.quit(); } }
  ]));
}

function registerHandler(name, handler) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) throw new Error('请求来源无效');
    try { return await handler(...args); }
    catch (error) { throw new Error(t(error.message)); }
  });
}

function registerHandlers() {
  registerHandler('get-state', () => getSnapshot());
  const specialSync = () => {
    if (isGeneral || !syncClient) throw new Error('云同步仅在特殊版中启用');
    if (dataLocked) throw new Error('请先恢复本机日程，再进行同步');
    return syncClient;
  };
  registerHandler('sync-status', () => specialSync().status());
  registerHandler('sync-create', (url, setup) => specialSync().create(url, setup));
  registerHandler('sync-join', code => specialSync().join(code));
  registerHandler('sync-now', () => specialSync().syncNow());
  registerHandler('sync-pairing', () => specialSync().pairing());
  registerHandler('sync-disconnect', () => specialSync().disconnect());
  registerHandler('sync-clear-conflicts', () => specialSync().clearConflicts());

  registerHandler('set-language', language => {
    if (!isGeneral) throw new Error('此版本不支持更改语言');
    if (!['zh-CN', 'en-US'].includes(language)) throw new Error('语言设置无效');
    const snapshot = persist({ ...structuredClone(state), language });
    updateTrayLanguage();
    return snapshot;
  });

  registerHandler('set-theme', (date, theme) => {
    const themeChoices = isGeneral ? state.categories : THEMES;
    if (theme !== '' && !themeChoices.includes(theme)) throw new Error('请选择有效主题');
    const next = structuredClone(state);
    ensureDay(next.days, date).theme = theme;
    return persist(next);
  });

  registerHandler('set-categories', (categories, renames = {}) => {
    if (!isGeneral) throw new Error('此版本不支持自定义分类');
    if (!renames || typeof renames !== 'object' || Array.isArray(renames)) throw new Error('分类改名格式无效');
    const next = structuredClone(state);
    next.categories = cleanCategories(categories);
    for (const day of Object.values(next.days)) {
      if (Object.hasOwn(renames, day.theme) && next.categories.includes(renames[day.theme])) day.theme = renames[day.theme];
      else if (day.theme && !next.categories.includes(day.theme)) day.theme = '';
    }
    return persist(next);
  });

  registerHandler('confirm-category-removal', async name => {
    if (!isGeneral || !state.categories.includes(name)) throw new Error('分类不存在');
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [t('取消'), t('移除分类')],
      defaultId: 0,
      cancelId: 0,
      message: t('移除“{name}”？', { name: ['工作', '学习', '生活'].includes(name) ? t(name) : name }),
      detail: t('保存分类后，使用该分类的日期会变为未分类，其中的日程会保留。')
    });
    return result.response === 1;
  });

  registerHandler('add-item', (date, input, repeat) => {
    if (dataLocked) throw new Error('计划文件无法读取。请先导入有效备份，再继续修改日程。');
    const item = cleanItem(input);
    let dates = [date];
    if (repeat?.frequency && repeat.frequency !== 'none') dates = createOccurrenceDates(date, repeat.frequency, repeat.until);
    if (Object.values(state.days).reduce((sum, day) => sum + day.items.length, 0) + dates.length > 20000) {
      throw new Error('日程总数不能超过 20000 项');
    }
    const next = structuredClone(state);
    const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
    dates.forEach((dayDate, index) => {
      const dayItem = index === 0 ? item : { ...item, id: crypto.randomUUID(), notifiedAt: null };
      if (seriesId) dayItem.seriesId = seriesId;
      ensureDay(next.days, dayDate).items.push(dayItem);
    });
    return persist(next);
  });

  registerHandler('update-item', (oldDate, newDate, input) => {
    if (!isDateKey(oldDate) || !isDateKey(newDate)) throw new Error('请选择有效日期');
    const oldDay = state.days[oldDate];
    const oldItem = oldDay?.items.find(item => item.id === input.id);
    if (!oldItem) throw new Error('这条日程已不存在');
    const item = cleanItem({
      ...input,
      ...(oldItem.seriesId ? { seriesId: oldItem.seriesId } : {}),
      notifiedAt: oldItem.startTime === input.startTime && oldItem.reminderMinutes === input.reminderMinutes && oldDate === newDate ? oldItem.notifiedAt : null
    });
    const next = structuredClone(state);
    next.days[oldDate].items = next.days[oldDate].items.filter(existing => existing.id !== oldItem.id);
    ensureDay(next.days, newDate).items.push(item);
    return persist(next);
  });

  registerHandler('delete-item', async (date, id) => {
    const day = state.days[date];
    const item = day?.items.find(item => item.id === id);
    if (!item) throw new Error('这条日程已不存在');
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: [t('取消'), t('删除安排')],
      defaultId: 0,
      cancelId: 0,
      message: t('确定删除“{title}”吗？', { title: item.title })
    });
    if (confirmation.response !== 1) return null;
    const next = structuredClone(state);
    next.days[date].items = next.days[date].items.filter(item => item.id !== id);
    return persist(next);
  });

  registerHandler('toggle-item', (date, id) => {
    const day = state.days[date];
    const item = day?.items.find(existing => existing.id === id);
    if (!item) throw new Error('这条日程已不存在');
    const next = structuredClone(state);
    const updated = next.days[date].items.find(existing => existing.id === id);
    updated.done = !updated.done;
    return persist(next);
  });

  registerHandler('export-backup', async () => {
    if (dataLocked) throw new Error('当前数据无法读取，请先打开数据文件夹保留恢复副本。');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: t('导出巷子日程备份'),
      defaultPath: `巷子日程-${isGeneral ? '通用版' : '教学版'}-备份-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: t('JSON 备份'), extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, JSON.stringify(state, null, 2), 'utf8');
    return result.filePath;
  });

  registerHandler('import-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: t('导入巷子日程备份'),
      properties: ['openFile'],
      filters: [{ name: t('JSON 备份'), extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 20 * 1024 * 1024) throw new Error('备份文件不能超过 20 MB');
    const imported = validateAppState(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: [t('取消'), t('恢复备份并替换当前日程')],
      defaultId: 0,
      cancelId: 0,
      message: t('备份中有 {count} 条日程。', { count: Object.values(imported.days).reduce((sum, day) => sum + day.items.length, 0) }),
      detail: t('恢复前会保留当前数据副本。恢复将替换本机现有日程。')
    });
    if (confirmation.response !== 1) return null;
    if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, path.join(dataDir, `plans-before-import-${Date.now()}.json`));
    const snapshot = persist(imported, true);
    updateTrayLanguage();
    return snapshot;
  });

  registerHandler('open-data-folder', async () => shell.openPath(dataDir));
}

function checkReminders() {
  if (quitting || !Notification.isSupported() || dataLocked) return;
  const now = Date.now();
  const next = structuredClone(state);
  const due = dueReminders(next, now);
  if (due.length) {
    try {
      for (const { item } of due) item.notifiedAt = now;
      persist(next);
      for (const { date, item } of due) {
        const notification = new Notification({
          title: item.title,
          body: `${date}  ${item.startTime}–${item.endTime}`,
          silent: false
        });
        notification.on('click', () => {
          showMainWindow();
        });
        notification.show();
      }
    } catch (error) {
      console.error('Could not save reminder state:', error.message);
    }
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    initializeSync();
    registerHandlers();
    createMainWindow();
    createTray();
    setInterval(checkReminders, 15_000).unref();
    checkReminders();
  });
  app.on('before-quit', () => {
    quitting = true;
    tray?.destroy();
  });
}
