const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createSyncStore } = require('../src/sync-store.cjs');

test('desktop journal replays an interrupted state/ancestor commit without exposing credentials', () => {
  const tempDir = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp/opencode') : os.tmpdir();
  fs.mkdirSync(tempDir, { recursive: true });
  const root = fs.mkdtempSync(path.join(tempDir, 'xiangzi-store-test-'));
  const key = crypto.randomBytes(32);
  const protection = {
    isEncryptionAvailable: () => true,
    encryptString(text) {
      const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptString(bytes) {
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    }
  };
  const bundle = { state: { version: 1, days: {} }, sync: { config: { key: 'sensitive-test-key' }, base: { version: 1, days: {} } } };
  const store = createSyncStore(root, protection);
  assert.throws(() => store.commit(bundle, () => { throw new Error('simulated power interruption'); }));
  assert.deepEqual(store.recover(), bundle);
  assert.equal(fs.readFileSync(path.join(root, 'sync-commit.enc')).includes(Buffer.from('sensitive-test-key')), false);
  const newerState = { version: 1, days: { '2030-01-21': { theme: '教研', items: [] } } };
  store.checkpointLocalState(newerState);
  assert.deepEqual(store.recover().state, newerState, 'An interrupted sync cannot replay over later offline work');
  let saved;
  store.commit(store.recover(), value => { saved = value; });
  assert.deepEqual(saved, newerState);
  assert.deepEqual(store.load(), bundle.sync);
  assert.equal(store.recover(), null);
  assert.equal(fs.readFileSync(path.join(root, 'sync.enc')).includes(Buffer.from('sensitive-test-key')), false);
  fs.rmSync(root, { recursive: true });
});
test('desktop refuses to store pairing when operating-system protection is unavailable', () => {
  const store = createSyncStore(os.tmpdir(), { isEncryptionAvailable: () => false });
  let touched = false;
  assert.throws(() => store.commit({ state: {} }, () => { touched = true; }), /凭据保护/);
  assert.equal(touched, false);
});
