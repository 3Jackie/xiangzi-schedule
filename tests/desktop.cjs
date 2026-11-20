const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : os.tmpdir();
fs.mkdirSync(tempDir, { recursive: true });
const root = fs.mkdtempSync(path.join(tempDir, 'xiangzi-desktop-'));
const electron = require('electron');

async function run(edition, mode = 'exercise') {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [path.join(__dirname, 'desktop-worker.cjs'), root, edition, mode], {
      env,
      stdio: 'inherit',
      windowsHide: true
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code !== 0) reject(new Error(`${edition}: desktop checks failed (${code})`));
      else resolve();
    });
  });
}

(async () => {
  await run('special');
  await run('general');
  await run('special', 'restart');
  await run('general', 'restart');
  console.log(`Desktop checks passed. Screenshots and isolated test data: ${root}`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
