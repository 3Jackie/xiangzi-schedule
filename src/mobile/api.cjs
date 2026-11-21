const { validateState, cleanItem, createOccurrenceDates, isDateKey, THEMES } = require('../core.cjs');
const { SyncClient } = require('../sync.cjs');
const listeners = new Set();
const pending = new Map();
let bundle = { state: { version: 1, days: {} }, sync: {} };
let startupError = '';
let sequence = Promise.resolve();
let syncTimer;

function native(action, args = {}) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('手机系统暂时未响应，请重试')); }, action === 'import' || action === 'export' ? 300000 : 45000);
    pending.set(id, { resolve, reject, timeout });
    try { window.XiangziNative.postMessage(JSON.stringify({ id, action, args })); }
    catch (error) { clearTimeout(timeout); pending.delete(id); reject(error); }
  });
}
window.XiangziNativeResult = (id, result) => {
  const request = pending.get(id);
  if (!request) return;
  clearTimeout(request.timeout); pending.delete(id);
  if (result.ok) request.resolve(result.value); else request.reject(new Error(result.error || '操作没有完成'));
};
function enqueue(work) {
  const result = sequence.then(work);
  sequence = result.catch(() => {});
  return result;
}
const ready = native('load').then(value => {
  if (value) bundle = { state: validateState(value.state), sync: value.sync || {} };
}).catch(() => { startupError = '手机日程文件无法读取，原文件已保留。请导入有效备份后再继续修改。'; });
function snapshot() { return { state: structuredClone(bundle.state), sync: sync.status(), startupError, edition: 'special', platform: 'android', themeChoices: THEMES, dataPath: '手机应用私有存储' }; }
function emit() { const value = snapshot(); for (const listener of listeners) listener(value); }
function schedule() {
  clearTimeout(syncTimer);
  if (!bundle.sync.config || document.hidden) return;
  syncTimer = setTimeout(() => { if (sync.running) schedule(); else sync.syncNow().catch(() => {}); }, 1500);
}
async function commit(next, allowLocked = false) {
  if (startupError && !allowLocked) throw new Error('请先导入有效备份，再继续修改日程');
  const valid = { ...next, state: validateState(next.state) };
  await native('save', { bundle: valid, backupBeforeRestore: allowLocked });
  bundle = valid;
  startupError = '';
  emit();
  return snapshot();
}
function mutate(work) {
  return enqueue(async () => {
    await ready;
    const next = structuredClone(bundle);
    work(next.state);
    const result = await commit(next);
    schedule();
    return result;
  });
}
function ensureDay(state, date) {
  if (!isDateKey(date)) throw new Error('请选择有效日期');
  return state.days[date] ||= { theme: '', items: [] };
}
function find(state, date, id) {
  const item = state.days[date]?.items.find(item => item.id === id);
  if (!item) throw new Error('这条日程已不存在');
  return item;
}
const sync = new SyncClient({
  getBundle: () => structuredClone(bundle),
  saveBundle: (next, expectedState) => enqueue(async () => {
    if (expectedState && JSON.stringify(bundle.state) !== JSON.stringify(expectedState)) return false;
    await commit({ ...next, state: expectedState ? next.state : bundle.state });
    return true;
  }),
  request: async (url, options) => {
    const response = await native('request', { url, method: options.method, headers: options.headers, body: options.body || '' });
    return { status: response.status, ok: response.status >= 200 && response.status < 300, json: async () => JSON.parse(response.body) };
  },
  onStatus: emit
});

window.xiangzi = {
  getState: async () => { await ready; return snapshot(); },
  onStateChanged: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  setTheme: (date, theme) => mutate(state => {
    if (theme !== '' && !THEMES.includes(theme)) throw new Error('请选择有效主题');
    ensureDay(state, date).theme = theme;
  }),
  addItem: (date, input, repeat) => mutate(state => {
    const dates = repeat?.frequency && repeat.frequency !== 'none' ? createOccurrenceDates(date, repeat.frequency, repeat.until) : [date];
    const item = cleanItem(input);
    const seriesId = dates.length > 1 ? crypto.randomUUID() : null;
    dates.forEach((key, index) => ensureDay(state, key).items.push({ ...item, ...(index ? { id: crypto.randomUUID() } : {}), ...(seriesId ? { seriesId } : {}) }));
  }),
  updateItem: (oldDate, newDate, input) => mutate(state => {
    const old = find(state, oldDate, input.id);
    const item = cleanItem({ ...input, ...(old.seriesId ? { seriesId: old.seriesId } : {}), notifiedAt: oldDate === newDate && old.startTime === input.startTime && old.reminderMinutes === input.reminderMinutes ? old.notifiedAt : null });
    state.days[oldDate].items = state.days[oldDate].items.filter(value => value.id !== old.id);
    ensureDay(state, newDate).items.push(item);
  }),
  deleteItem: async (date, id) => {
    await ready;
    const item = find(bundle.state, date, id);
    if (!confirm(`确定删除“${item.title}”吗？`)) return null;
    return mutate(state => { find(state, date, id); state.days[date].items = state.days[date].items.filter(item => item.id !== id); });
  },
  toggleItem: (date, id) => mutate(state => { const item = find(state, date, id); item.done = !item.done; }),
  exportBackup: async () => { await ready; if (startupError) throw new Error('当前日程无法读取，请保留原文件'); return native('export', { text: JSON.stringify(bundle.state, null, 2) }); },
  importBackup: async () => {
    const text = await native('import');
    if (!text) return null;
    const state = validateState(JSON.parse(text.replace(/^\uFEFF/, '')));
    if (!confirm('用备份替换本机日程？恢复前会在手机保留本机副本；连接的云端将在下次同步时合并这些更改。')) return null;
    return enqueue(async () => {
      const result = await commit({ ...bundle, state }, true);
      schedule();
      return result;
    });
  },
  openDataFolder: () => native('permissions'),
  reminderStatus: () => native('reminderStatus'),
  requestReminders: () => native('permissions'),
  copyText: text => native('clipboard', { text }),
  syncStatus: async () => { await ready; return sync.status(); },
  syncCreate: async (url, setup) => { await ready; return sync.create(url, setup); },
  syncJoin: async code => { await ready; return sync.join(code); },
  syncNow: async () => { await ready; return sync.syncNow(); },
  syncPairing: () => sync.pairing(),
  syncDisconnect: () => sync.disconnect(),
  syncClearConflicts: () => sync.clearConflicts()
};
window.XiangziResume = () => ready.then(() => { if (!sync.running && bundle.sync.config && !startupError) sync.syncNow().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) window.XiangziResume(); });
window.addEventListener('online', () => window.XiangziResume());
setInterval(() => { if (!document.hidden) window.XiangziResume(); }, 30000);
ready.then(() => {
  const button = document.getElementById('data-folder-button');
  if (button) { button.title = '手机通知与提醒'; button.setAttribute('aria-label', '手机通知与提醒'); button.textContent = '提醒'; }
  window.XiangziResume();
});
