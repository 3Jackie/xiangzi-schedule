const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { SyncClient } = require('../src/sync.cjs');

(async () => {
  const setup = 'local-runtime-test-only-setup-token';
  const options = { modules: true, scriptPath: path.join(__dirname, '../cloud/worker.mjs'), compatibilityDate: '2026-11-01', d1Databases: ['DB'], bindings: { SETUP_TOKEN: setup }, host: '127.0.0.1' };
  const runtime = new Miniflare(typeof convertV4MiniflareOptions === 'function' ? convertV4MiniflareOptions(options) : options);
  try {
    const db = await runtime.getD1Database('DB');
    await db.exec(fs.readFileSync(path.join(__dirname, '../cloud/migrations/0001_vaults.sql'), 'utf8').replace(/\n/g, ' '));
    const request = (url, options) => runtime.dispatchFetch(url, options);
    const makeDevice = () => {
      let bundle = { state: { version: 1, days: {} }, sync: {} };
      return { client: new SyncClient({ getBundle: () => structuredClone(bundle), saveBundle: next => { bundle = next; }, request }), get bundle() { return bundle; } };
    };
    const computer = makeDevice(), phone = makeDevice();
    await computer.client.create('https://local-runtime.example', setup);
    await phone.client.join(computer.client.pairing());
    computer.bundle.state.days['2030-01-21'] = { theme: '教学', items: [{ id: 'cloud-runtime-event', title: '虚构云同步测试', startTime: '09:00', endTime: '10:00', note: '', done: false, reminderMinutes: null, notifiedAt: null }] };
    await computer.client.syncNow(); await phone.client.syncNow();
    assert.equal(phone.bundle.state.days['2030-01-21'].items[0].title, '虚构云同步测试');
    phone.bundle.state.days['2030-01-21'].items[0].done = true;
    await phone.client.syncNow(); await computer.client.syncNow();
    assert.equal(computer.bundle.state.days['2030-01-21'].items[0].done, true);
    const row = await db.prepare('SELECT payload FROM vaults').first();
    assert.equal(row.payload.includes('虚构云同步测试'), false);
    assert.equal((await runtime.dispatchFetch('https://local-runtime.example/v1/vaults/' + computer.bundle.sync.config.id)).status, 401);
    console.log('Actual Workers runtime + D1: encrypted two-device roundtrip and authentication passed.');
  } finally { await runtime.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
