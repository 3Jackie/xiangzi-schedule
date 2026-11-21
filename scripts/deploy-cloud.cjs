// Run after the owner completes `npx wrangler login`.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { SyncClient, keys } = require('../src/sync.cjs');
const root = path.resolve(__dirname, '..');
const production = path.join(root, 'cloud/wrangler.production.json');
const wrangler = path.join(root, 'node_modules/wrangler/bin/wrangler.js');
const privateDir = path.join(os.homedir(), '.config/xiangzi-schedule');
const privateFile = path.join(privateDir, process.platform === 'win32' ? 'cloud-setup.dpapi' : 'cloud-setup.private.json');
function run(args, input) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd: root, encoding: 'utf8', input, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Wrangler did not finish').slice(-5000));
  return result.stdout;
}
function protect(text, decrypt = false) {
  const script = `Add-Type -AssemblyName System.Security; $data=[Console]::In.ReadToEnd(); $scope=[Security.Cryptography.DataProtectionScope]::CurrentUser; ` + (decrypt
    ? '[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($data),$null,$scope)))'
    : '[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($data),$null,$scope)))');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: text, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('无法使用 Windows 凭据保护保存建库口令');
  return result.stdout.trim();
}
function loadSecret() {
  if (fs.existsSync(privateFile)) {
    const data = fs.readFileSync(privateFile);
    return JSON.parse(process.platform === 'win32' ? protect(data.toString('base64'), true) : data.toString('utf8'));
  }
  const value = { setup: crypto.randomBytes(32).toString('base64url') };
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(privateFile, process.platform === 'win32' ? Buffer.from(protect(JSON.stringify(value)), 'base64') : JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  return value;
}
async function verifyLive(endpoint, setup) {
  let computer = { state: { version: 1, days: {} }, sync: {} };
  let phone = { state: { version: 1, days: {} }, sync: {} };
  const pc = new SyncClient({ getBundle: () => computer, saveBundle: value => { computer = value; } });
  const mobile = new SyncClient({ getBundle: () => phone, saveBundle: value => { phone = value; } });
  try {
    await pc.create(endpoint, setup);
    await mobile.join(pc.pairing());
    computer.state.days['2030-01-21'] = { theme: '教学', items: [{ id: crypto.randomUUID(), title: '同步连通性测试（虚构）', startTime: '09:00', endTime: '10:00', reminderMinutes: null, notifiedAt: null, note: '', done: false }] };
    await pc.syncNow(); await mobile.syncNow();
    phone.state.days['2030-01-21'].items[0].done = true;
    await mobile.syncNow(); await pc.syncNow();
    if (!computer.state.days['2030-01-21'].items[0].done) throw new Error('线上双向测试未通过');
  } finally {
    const config = computer.sync?.config;
    if (config) {
      const response = await fetch(`${config.endpoint}/v1/vaults/${config.id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + (await keys(config)).token }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('测试库清理失败，请在 D1 中删除测试库后再建立个人日程库');
    }
  }
}
(async () => {
  console.log('检查 Cloudflare 授权与私人数据库…');
  const databaseName = 'xiangzi-personal-sync';
  let databases;
  try { databases = JSON.parse(run(['d1', 'list', '--json'])); }
  catch (error) { throw new Error('请先完成 npx wrangler login；登录或授权需要由账号本人进行。\n' + error.message); }
  let database = databases.find(value => value.name === databaseName);
  if (!database) {
    run(['d1', 'create', databaseName, '--config', 'cloud/wrangler.jsonc', '--update-config=false']);
    databases = JSON.parse(run(['d1', 'list', '--json']));
    database = databases.find(value => value.name === databaseName);
  }
  if (!database?.uuid) throw new Error('未找到私人 D1 数据库');
  const config = { name: 'xiangzi-personal-sync', main: 'worker.mjs', compatibility_date: '2026-11-01', workers_dev: true, observability: { enabled: false }, d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: database.uuid, migrations_dir: 'migrations' }] };
  fs.writeFileSync(production, JSON.stringify(config, null, 2), { mode: 0o600 });
  console.log('应用同步数据库迁移…');
  run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', production]);
  const secret = loadSecret();
  run(['secret', 'put', 'SETUP_TOKEN', '--config', production], secret.setup + '\n');
  console.log('部署同步接口…');
  const output = run(['deploy', '--config', production]);
  const url = output.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i)?.[0];
  if (!url) throw new Error('部署结果没有返回 workers.dev 地址。请先在自己的 Cloudflare 账号中启用 Workers 子域名。');
  const response = await fetch(url + '/health', { signal: AbortSignal.timeout(20000) });
  if (!response.ok || (await response.json()).protocol !== 1) throw new Error('云端健康验证未通过，暂时不要迁移个人日程');
  console.log('使用虚构日程验证线上双向同步…');
  await verifyLive(url, secret.setup);
  fs.writeFileSync(path.join(root, 'cloud/deployment.private.json'), JSON.stringify({ endpoint: url, verifiedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ endpoint: url, liveRoundTripPassed: true, testVaultRemoved: true, protectedSetupFile: privateFile }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
