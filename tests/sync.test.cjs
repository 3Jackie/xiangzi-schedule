const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { SyncClient, mergeStates, normalized, encrypt, decrypt, keys, pairingCode, parsePairing, endpoint, EMPTY } = require('../src/sync.cjs');
const date = '2026-11-21';
const makeItem = (id, extra = {}) => ({ id, title: '备课', startTime: '09:00', endTime: '10:00', note: '', done: false, reminderMinutes: 5, notifiedAt: null, ...extra });
const state = (items = [], theme = '教学', key = date) => ({ version: 1, days: { [key]: { theme, items } } });
const cfg = () => ({ endpoint: 'https://sync.example.test', id: crypto.randomUUID(), key: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url') });

test('pairing validates endpoint and key, keeps encryption key out of authentication token', async () => {
  const config = cfg();
  assert.deepEqual(parsePairing(pairingCode(config)), config);
  assert.notEqual((await keys(config)).token, config.key);
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?secret=x', 'file:///abc']) assert.throws(() => endpoint(url));
  assert.throws(() => parsePairing('xiangzi-sync:wrong'));
});
test('ciphertext authenticates data, vault identity and key', async () => {
  const config = cfg(); const original = state([makeItem('a')]);
  const encrypted = await encrypt(original, config);
  assert.equal(JSON.stringify(encrypted).includes('备课'), false);
  assert.deepEqual(await decrypt(encrypted, config), original);
  assert.notDeepEqual(await encrypt(original, config), encrypted);
  await assert.rejects(decrypt(encrypted, cfg()), /无法解密/);
  await assert.rejects(decrypt({ ...encrypted, data: encrypted.data.slice(1) + 'A' }, config), /无法解密/);
});
test('merge combines independent items and independent fields', async () => {
  const base = state([makeItem('a')]);
  const local = state([makeItem('a', { title: '数学备课' }), makeItem('b')]);
  const remote = state([makeItem('a', { done: true }), makeItem('c')]);
  const merged = await mergeStates(base, local, remote);
  assert.equal(merged.conflicts.length, 0);
  assert.equal(merged.state.days[date].items.length, 3);
  assert.equal(merged.state.days[date].items[0].title, '数学备课');
  assert.equal(merged.state.days[date].items[0].done, true);
});
test('conflicting edit retains both versions with deterministic conflict copy', async () => {
  const base = state([makeItem('a')]);
  const l = state([makeItem('a', { title: '本地修改' })]);
  const r = state([makeItem('a', { title: '另一端修改' })]);
  const result = await mergeStates(base, l, r);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.state.days[date].items.length, 2);
  assert.ok(result.state.days[date].items.some(item => item.title === '本地修改（冲突副本）'));
  assert.deepEqual((await mergeStates(base, l, r)).state, result.state);
  assert.equal((await mergeStates(base, l, result.state)).state.days[date].items.length, 2);
});
test('deletion propagates, concurrent delete/edit preserves edited event, moves stay single', async () => {
  const base = state([makeItem('a')]);
  assert.equal((await mergeStates(base, state([]), base)).state.days[date].items.length, 0);
  const conflict = await mergeStates(base, state([]), state([makeItem('a', { note: '新内容' })]));
  assert.equal(conflict.state.days[date].items[0].note, '新内容');
  assert.equal(conflict.conflicts[0].kind, 'delete-update');
  const moved = await mergeStates(base, state([makeItem('a')], '教研', '2026-11-22'), state([makeItem('a', { done: true })]));
  assert.equal(Object.values(moved.state.days).flatMap(day => day.items).length, 1);
  assert.equal(moved.state.days['2026-11-22'].items[0].done, true);
});
test('theme collisions are reported, invalid combined intervals produce valid conflict versions', async () => {
  const base = state([makeItem('a')]);
  const merged = await mergeStates(base, state([makeItem('a', { startTime: '09:45' })], '教研'), state([makeItem('a', { endTime: '09:30' })], '休息'));
  assert.equal(merged.state.days[date].theme, '休息');
  assert.ok(merged.conflicts.some(value => value.kind === 'theme'));
  assert.equal(merged.state.days[date].items.length, 2);
  for (const item of merged.state.days[date].items) assert.ok(item.endTime > item.startTime);
});
test('normalization excludes device-specific delivery and rejects ambiguous duplicate identifiers', () => {
  assert.equal(normalized(state([makeItem('a', { notifiedAt: 123 })])).days[date].items[0].notifiedAt, null);
  assert.throws(() => normalized({ version: 1, days: { [date]: { theme: '', items: [makeItem('a')] }, '2026-11-22': { theme: '', items: [makeItem('a')] } } }), /相同日程编号/);
});

async function service() {
  const worker = (await import('../cloud/worker.mjs')).default;
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(__dirname, '../cloud/migrations/0001_vaults.sql'), 'utf8'));
  const DB = { prepare(query) {
    let args = []; return { bind(...values) { args = values; return this; }, first() { return sql.prepare(query).get(...args); }, run() { const info = sql.prepare(query).run(...args); return { meta: { changes: Number(info.changes) } }; } };
  } };
  const env = { DB, SETUP_TOKEN: 'test-only-bootstrap-token-at-least-24-characters' };
  const request = (url, options = {}) => worker.fetch(new Request(url, options), env);
  function device(initial = EMPTY, intercept) {
    let bundle = { state: structuredClone(initial), sync: {} };
    const client = new SyncClient({
      getBundle: () => structuredClone(bundle),
      saveBundle: (value, expected) => { if (expected && JSON.stringify(expected) !== JSON.stringify(bundle.state)) return false; bundle = structuredClone(value); return true; },
      request: async (url, options) => { await intercept?.(url, options); return request(url, options); }
    });
    return { client, get bundle() { return bundle; }, edit(work) { work(bundle.state); } };
  }
  return { request, env, sql, device };
}
test('real SQLite + worker: pair two devices, offline edits, deletion, restart and encrypted storage', async () => {
  const { device, env, sql } = await service();
  const computer = device(state([makeItem('a', { notifiedAt: 99 })]));
  await computer.client.create('https://sync.example.test', env.SETUP_TOKEN);
  const phone = device();
  await phone.client.join(computer.client.pairing());
  assert.deepEqual(normalized(phone.bundle.state), normalized(computer.bundle.state));
  phone.edit(s => { s.days[date].items[0].done = true; });
  computer.edit(s => { s.days[date].items.push(makeItem('b', { title: '教研会议' })); });
  await phone.client.syncNow(); await computer.client.syncNow(); await phone.client.syncNow();
  assert.deepEqual(normalized(computer.bundle.state), normalized(phone.bundle.state));
  assert.equal(computer.bundle.state.days[date].items.find(item => item.id === 'a').notifiedAt, 99);
  computer.edit(s => { s.days[date].items = s.days[date].items.filter(item => item.id !== 'b'); });
  await computer.client.syncNow(); await phone.client.syncNow();
  assert.equal(phone.bundle.state.days[date].items.length, 1);
  assert.equal(phone.bundle.state.days[date].items[0].done, true);
  const record = sql.prepare('SELECT * FROM vaults').get();
  assert.equal(record.payload.includes('教学'), false);
  assert.equal(record.payload.includes('备课'), false);
  assert.equal(record.auth_hash.includes(computer.bundle.sync.config.key), false);
});
test('edits made during a pending upload survive and are sent next time', async () => {
  const { device, env } = await service();
  let duringUpload;
  const pc = device(state([makeItem('a')]), (_url, options) => { if (options.method === 'PUT' && duringUpload) { const run = duringUpload; duringUpload = null; run(); } });
  await pc.client.create('https://sync.example.test', env.SETUP_TOKEN);
  pc.edit(s => { s.days[date].items[0].title = '第一处修改'; });
  duringUpload = () => pc.edit(s => { s.days[date].items[0].note = '上传期间新增的备注'; });
  await pc.client.syncNow();
  assert.equal(pc.bundle.state.days[date].items[0].note, '上传期间新增的备注');
  await pc.client.syncNow();
  const phone = device(); await phone.client.join(pc.client.pairing());
  assert.equal(phone.bundle.state.days[date].items[0].note, '上传期间新增的备注');
});
test('worker blocks unauthorized creation, wrong keys, stale CAS and malformed or oversized payloads', async () => {
  const { device, request, env } = await service();
  const pc = device();
  await assert.rejects(pc.client.create('https://sync.example.test', 'wrong'), /口令/);
  await pc.client.create('https://sync.example.test', env.SETUP_TOKEN);
  const config = pc.bundle.sync.config;
  const url = `${config.endpoint}/v1/vaults/${config.id}`;
  assert.equal((await request(url)).status, 401);
  const headers = { Authorization: 'Bearer ' + (await keys(config)).token, 'Content-Type': 'application/json' };
  const payload = await encrypt(EMPTY, config);
  assert.equal((await request(url, { method: 'PUT', headers, body: JSON.stringify({ revision: 99, payload }) })).status, 409);
  assert.equal((await request(url, { method: 'PUT', headers, body: '{' })).status, 400);
  assert.equal((await request(url, { method: 'PUT', headers, body: 'x'.repeat(1500001) })).status, 413);
});
test('CAS racing clients retry without losing independent additions', async () => {
  const { device, env } = await service();
  let raced = false, pc;
  const phone = device(EMPTY, async (_url, options) => {
    if (options.method === 'PUT' && !raced) { raced = true; await pc.client.syncNow(); }
  });
  pc = device(state([makeItem('a')])); await pc.client.create('https://sync.example.test', env.SETUP_TOKEN);
  await phone.client.join(pc.client.pairing());
  pc.edit(s => s.days[date].items.push(makeItem('b')));
  phone.edit(s => s.days[date].items.push(makeItem('c')));
  await phone.client.syncNow(); await pc.client.syncNow();
  assert.equal(pc.bundle.state.days[date].items.length, 3);
  assert.equal(phone.bundle.state.days[date].items.length, 3);
});
