// Shared by Electron and Android. No account credentials or plaintext schedules
// are sent to the service. Each device retains its own last common ancestor.
const { validateState } = require('./core.cjs');
const EMPTY = { version: 1, days: {} };
const MAX_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function b64(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(text) {
  if (typeof text !== 'string' || !/^[\w-]+$/.test(text)) throw new Error('配对码或加密数据格式不正确');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function endpoint(value, { allowLocal = false } = {}) {
  let url;
  try { url = new URL(value); } catch { throw new Error('请填写完整的 HTTPS 同步服务地址'); }
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('同步服务地址必须是 HTTPS 根地址，不包含路径或参数');
  }
  return url.origin;
}
function pairingCode(config) {
  return 'xiangzi-sync:' + b64(encoder.encode(JSON.stringify({ v: 1, url: config.endpoint, id: config.id, key: config.key })));
}
function parsePairing(text, options) {
  try {
    if (typeof text !== 'string' || text.trim().length > 4096 || !text.trim().startsWith('xiangzi-sync:')) throw new Error();
    const data = JSON.parse(decoder.decode(unb64(text.trim().slice(13))));
    if (data.v !== 1 || !/^[a-f0-9-]{36}$/.test(data.id) || unb64(data.key).length !== 32) throw new Error();
    return { endpoint: endpoint(data.url, options), id: data.id, key: data.key };
  } catch { throw new Error('配对码无效，请从已连接的设备完整复制'); }
}
async function keys(config) {
  const material = await crypto.subtle.importKey('raw', unb64(config.key), 'HKDF', false, ['deriveKey', 'deriveBits']);
  const params = info => ({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(config.id), info: encoder.encode(info) });
  return {
    cipher: await crypto.subtle.deriveKey(params('xiangzi-encryption-v1'), material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    token: b64(new Uint8Array(await crypto.subtle.deriveBits(params('xiangzi-authentication-v1'), material, 256)))
  };
}
async function encrypt(state, config) {
  const bytes = encoder.encode(JSON.stringify(validateState(state)));
  if (bytes.length > MAX_BYTES) throw new Error('日程库超过 1 MB 同步上限，已保存在本机。请先导出备份并精简旧日程。');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { cipher } = await keys(config);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(config.id) }, cipher, bytes);
  return { v: 1, iv: b64(iv), data: b64(new Uint8Array(data)) };
}
async function decrypt(payload, config) {
  try {
    if (!payload || payload.v !== 1 || typeof payload.data !== 'string' || payload.data.length > 1500000) throw new Error();
    const { cipher } = await keys(config);
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv), additionalData: encoder.encode(config.id) }, cipher, unb64(payload.data));
    if (data.byteLength > MAX_BYTES) throw new Error();
    return validateState(JSON.parse(decoder.decode(data)));
  } catch { throw new Error('云端数据无法解密或校验未通过，本机日程未被替换'); }
}
function normalized(input) {
  const state = validateState(input);
  const ids = new Set();
  const days = {};
  for (const date of Object.keys(state.days).sort()) {
    const day = state.days[date];
    const items = day.items.map(item => {
      if (ids.has(item.id)) throw new Error('不同日期中存在相同日程编号，请先在电脑端导入修正后的备份');
      ids.add(item.id);
      // Notification delivery is local to a device, never synchronised.
      return { ...item, notifiedAt: null };
    }).sort((a, b) => a.id.localeCompare(b.id));
    if (day.theme || items.length) days[date] = { theme: day.theme, items };
  }
  return { version: 1, days };
}
function indexItems(state) {
  return new Map(Object.entries(state.days).flatMap(([date, day]) => day.items.map(item => [item.id, { ...item, date }])));
}
async function conflictId(id, left, right) {
  const versions = [JSON.stringify(left), JSON.stringify(right)].sort();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(id + '\n' + versions.join('\n')));
  return 'conflict-' + b64(new Uint8Array(digest)).slice(0, 40);
}
async function mergeStates(baseInput, localInput, remoteInput) {
  const base = normalized(baseInput), local = normalized(localInput), remote = normalized(remoteInput);
  const result = { version: 1, days: {} };
  const conflicts = [];
  const dayFor = date => (result.days[date] ||= { theme: '', items: [] });
  for (const date of [...new Set([...Object.keys(base.days), ...Object.keys(local.days), ...Object.keys(remote.days)])].sort()) {
    const b = base.days[date]?.theme || '', l = local.days[date]?.theme || '', r = remote.days[date]?.theme || '';
    const theme = l === b || l === r ? r : r === b ? l : r;
    if (l !== b && r !== b && l !== r) conflicts.push({ kind: 'theme', date, message: `${date} 主题冲突：已采用“${r || '未选主题'}”，另一端为“${l || '未选主题'}”` });
    if (theme) dayFor(date).theme = theme;
  }
  const bm = indexItems(base), lm = indexItems(local), rm = indexItems(remote);
  const output = new Map();
  for (const id of [...new Set([...bm.keys(), ...lm.keys(), ...rm.keys()])].sort()) {
    const b = bm.get(id), l = lm.get(id), r = rm.get(id);
    let merged;
    if (equal(l, r) || equal(l, b)) merged = r;
    else if (equal(r, b)) merged = l;
    else if (!l || !r) {
      merged = l || r;
      conflicts.push({ kind: 'delete-update', date: merged.date, message: `“${merged.title}”在一端删除、另一端修改，已保留修改后的日程` });
    } else {
      merged = { id };
      let collision = false;
      for (const field of new Set([...Object.keys(l), ...Object.keys(r)])) {
        if (field === 'id') continue;
        const bv = b?.[field], lv = l[field], rv = r[field];
        const value = equal(lv, bv) || equal(lv, rv) ? rv : equal(rv, bv) ? lv : rv;
        if (value !== undefined) merged[field] = value;
        if (!equal(lv, bv) && !equal(rv, bv) && !equal(lv, rv)) collision = true;
      }
      // Concurrent start/end changes can produce an invalid time interval.
      if (merged.endTime <= merged.startTime) { merged.startTime = r.startTime; merged.endTime = r.endTime; collision = true; }
      if (collision) {
        const copyId = await conflictId(id, l, r);
        const copy = { ...l, id: copyId, title: l.title.slice(0, 110) + '（冲突副本）', notifiedAt: null };
        delete copy.seriesId;
        // The id is deterministic so CAS retries cannot multiply copies.
        if (!lm.has(copyId) && !rm.has(copyId)) output.set(copyId, copy);
        conflicts.push({ kind: 'item', date: l.date, message: `“${l.title}”同时修改，已保留“冲突副本”，请核对后删除多余版本` });
      }
    }
    if (merged) output.set(id, merged);
  }
  for (const record of output.values()) {
    const { date, ...item } = record;
    dayFor(date).items.push(item);
  }
  return { state: normalized(result), conflicts };
}
function restoreNotifications(merged, local) {
  const previous = indexItems(validateState(local));
  const result = structuredClone(merged);
  for (const [date, day] of Object.entries(result.days)) for (const item of day.items) {
    const old = previous.get(item.id);
    if (old?.date === date && old.startTime === item.startTime && old.reminderMinutes === item.reminderMinutes) item.notifiedAt = old.notifiedAt;
  }
  return result;
}

class SyncClient {
  constructor({ getBundle, saveBundle, request = fetch, onStatus = () => {}, allowLocal = false }) {
    Object.assign(this, { getBundle, saveBundle, request, onStatus, allowLocal });
    this.running = false;
    this.error = '';
  }
  status() {
    const sync = this.getBundle().sync;
    return { connected: !!sync?.config, running: this.running, error: this.error, endpoint: sync?.config?.endpoint || '', lastSync: sync?.lastSync || null, conflicts: sync?.conflicts || [] };
  }
  notify() { this.onStatus(this.status()); }
  async api(config, method, data, setup) {
    const { token } = await keys(config);
    let response;
    try {
      response = await this.request(`${config.endpoint}/v1/vaults/${config.id}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(setup ? { 'X-Setup-Token': setup } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000), redirect: 'error'
      });
    } catch { throw new Error('暂时无法连接同步服务，修改已保存在本机，联网后会重试'); }
    if (response.status === 409) return { conflict: true };
    if (!response.ok) {
      const messages = { 401: '配对凭据或建库口令不正确', 404: '云端日程库不存在，请核对配对码', 413: '日程库超过云端容量上限，本机数据已保留', 429: '同步请求过于频繁，请稍后重试' };
      throw new Error(messages[response.status] || '同步服务返回错误，本机数据已保留');
    }
    const body = await response.json();
    if (body.protocol !== 1 || !Number.isSafeInteger(body.revision) || body.revision < 1) throw new Error('同步协议不兼容，请更新应用');
    return body;
  }
  async exclusive(work) {
    if (this.running) throw new Error('正在同步，请稍候');
    this.running = true; this.error = ''; this.notify();
    try { return await work(); }
    catch (error) { this.error = error.message; throw error; }
    finally { this.running = false; this.notify(); }
  }
  async create(url, setup) {
    return this.exclusive(async () => {
      if (this.getBundle().sync?.config) throw new Error('请先断开现有配对');
      const config = { endpoint: endpoint(url, this), id: crypto.randomUUID(), key: b64(crypto.getRandomValues(new Uint8Array(32))) };
      const state = normalized(this.getBundle().state);
      const response = await this.api(config, 'POST', { payload: await encrypt(state, config) }, setup);
      if (response.conflict) throw new Error('日程库编号冲突，请重试');
      await this.saveBundle({ ...this.getBundle(), sync: { config, base: state, lastSync: Date.now(), conflicts: [] } });
      return this.status();
    });
  }
  async join(code) {
    return this.exclusive(async () => {
      if (this.getBundle().sync?.config) throw new Error('请先断开现有配对');
      return this.exchange({ config: parsePairing(code, this), base: EMPTY, conflicts: [] });
    });
  }
  async syncNow() {
    return this.exclusive(async () => {
      const sync = this.getBundle().sync;
      if (!sync?.config) throw new Error('请先创建日程库或输入另一台设备的配对码');
      return this.exchange(sync);
    });
  }
  async exchange(sync) {
    const { config } = sync;
    for (let attempt = 0; attempt < 5; attempt++) {
      const cloud = await this.api(config, 'GET');
      const remote = await decrypt(cloud.payload, config);
      const captured = structuredClone(this.getBundle().state);
      const merged = await mergeStates(sync.base || EMPTY, captured, remote);
      if (!equal(merged.state, normalized(remote))) {
        const update = await this.api(config, 'PUT', { revision: cloud.revision, payload: await encrypt(merged.state, config) });
        if (update.conflict) continue;
      }
      // Local edits made while the request was in flight are rebased, not lost.
      const current = this.getBundle();
      const rebased = await mergeStates(captured, current.state, merged.state);
      const conflicts = [...(sync.conflicts || []), ...merged.conflicts, ...rebased.conflicts].slice(-100);
      // saveBundle commits both state and ancestor together on Android; desktop
      // uses a replay journal to recover a crash between the two files.
      const saved = await this.saveBundle({ state: restoreNotifications(rebased.state, current.state), sync: { config, base: merged.state, lastSync: Date.now(), conflicts } }, current.state);
      if (saved === false) continue;
      return this.status();
    }
    throw new Error('另一台设备正在连续修改，日程已保存在本机，稍后将重试');
  }
  async disconnect() {
    return this.exclusive(async () => {
      await this.saveBundle({ ...this.getBundle(), sync: {} });
      return this.status();
    });
  }
  async clearConflicts() {
    return this.exclusive(async () => {
      const bundle = this.getBundle();
      await this.saveBundle({ ...bundle, sync: { ...bundle.sync, conflicts: [] } });
    });
  }
  pairing() {
    const config = this.getBundle().sync?.config;
    if (!config) throw new Error('尚未连接日程库');
    return pairingCode(config);
  }
}
module.exports = { SyncClient, mergeStates, normalized, encrypt, decrypt, keys, pairingCode, parsePairing, endpoint, EMPTY };
