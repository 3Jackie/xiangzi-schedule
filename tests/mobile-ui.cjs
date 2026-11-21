const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');
const { SyncClient } = require('../src/sync.cjs');
const root = fs.mkdtempSync(path.join(process.env.LOCALAPPDATA || app.getPath('temp'), 'Temp/opencode/xiangzi-mobile-ui-'));
app.setPath('userData', path.join(root, 'profile'));
app.disableHardwareAcceleration();
const preload = path.join(root, 'preload.cjs');
fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('XiangziNative',{postMessage:message=>ipcRenderer.send('native-test',message)});`);
let phoneBundle = null, exported;
const setup = 'test-only-setup-for-mobile-ui-at-least-24-characters';
const timeout = setTimeout(() => { console.error('Mobile UI timed out'); app.exit(1); }, 90000);

app.whenReady().then(async () => {
  const worker = (await import('../cloud/worker.mjs')).default;
  const sql = new DatabaseSync(':memory:');
  sql.exec(fs.readFileSync(path.join(__dirname, '../cloud/migrations/0001_vaults.sql'), 'utf8'));
  const DB = { prepare(query) { let args = []; return { bind(...value) { args = value; return this; }, first() { return sql.prepare(query).get(...args); }, run() { return { meta: { changes: Number(sql.prepare(query).run(...args).changes) } }; } }; } };
  const request = (url, options) => worker.fetch(new Request(url, options), { DB, SETUP_TOKEN: setup });
  let pcBundle = { state: { version: 1, days: {} }, sync: {} };
  const pc = new SyncClient({ getBundle: () => structuredClone(pcBundle), saveBundle: value => { pcBundle = value; }, request });
  await pc.create('https://sync.example.test', setup);
  const window = new BrowserWindow({ width: 390, height: 844, useContentSize: true, webPreferences: { preload, contextIsolation: true, sandbox: true } });
  const errors = [];
  window.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  ipcMain.on('native-test', async (event, text) => {
    const { id, action, args } = JSON.parse(text);
    let value = null, error;
    try {
      if (action === 'load') value = phoneBundle;
      else if (action === 'save') { phoneBundle = structuredClone(args.bundle); value = true; }
      else if (action === 'request') { const response = await request(args.url, { method: args.method, headers: args.headers, ...(args.method === 'GET' ? {} : { body: args.body }) }); value = { status: response.status, body: await response.text() }; }
      else if (action === 'export') { exported = args.text; value = true; }
      else if (action === 'import') value = exported;
      else if (action === 'reminderStatus') value = { notifications: false, exact: false };
      else value = true;
    } catch (failure) { error = failure.message; }
    await event.sender.executeJavaScript(`window.XiangziNativeResult(${JSON.stringify(id)},${JSON.stringify({ ok: !error, value, error })})`);
  });
  await window.loadFile(path.join(__dirname, '../android/app/src/main/assets/index.html'));
  const run = script => window.webContents.executeJavaScript(script, true);
  const result = await run(`(async()=>{
    const checks=[]; const check=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message)};
    const $=id=>document.getElementById(id);
    const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('UI did not update')};
    await window.xiangzi.getState();
    await wait(()=>document.querySelectorAll('.calendar-day').length===42);
    check(document.documentElement.scrollWidth<=innerWidth+1,'390px month layout has no overflow');
    check($('language-button').hidden&&$('manage-categories-button').hidden,'Mobile keeps special edition rules');
    await selectDate('2030-01-21');
    await window.xiangzi.setTheme('2030-01-21','教学');
    $('add-item-button').click();
    let rect=$('item-dialog').getBoundingClientRect();
    check(rect.left>=0&&rect.right<=innerWidth,'Event dialog fits phone width');
    $('item-title').value='手机上的数学备课';$('item-note').value='虚构测试数据';
    $('item-form').requestSubmit();
    await wait(()=>!$('item-dialog').open);
    check(document.querySelector('.agenda-title')?.textContent==='手机上的数学备课','Phone editor saves through native bridge');
    document.querySelector('.done-toggle').click();
    await wait(()=>document.querySelector('.agenda-item')?.classList.contains('is-done'));
    check((await window.xiangzi.getState()).state.days['2030-01-21'].items[0].done,'Phone completion is persisted');
    await window.xiangzi.syncJoin(${JSON.stringify(pc.pairing())});
    check((await window.xiangzi.syncStatus()).connected,'Phone pairs and uploads local schedule');
    $('week-view-button').click();
    check(document.querySelectorAll('.week-day').length===7,'Phone week view shows seven days');
    check(document.documentElement.scrollWidth<=innerWidth+1,'Phone week view has no overflow');
    $('month-view-button').click();
    $('sync-button').click();await wait(()=>$('sync-dialog').open);
    rect=$('sync-dialog').getBoundingClientRect();
    check(rect.left>=0&&rect.right<=innerWidth,'Sync dialog fits phone width');
    $('sync-reveal').click();await wait(()=>!$('sync-code-field').hidden);
    check($('sync-pairing-code').value.startsWith('xiangzi-sync:'),'Pairing code is available on demand');
    $('sync-dialog').close();
    await wait(()=>!$('sync-pairing-code').value);
    check(!$('sync-pairing-code').value,'Pairing code cleared when settings close');
    await window.xiangzi.exportBackup();
    return checks;
  })()`);
  await pc.syncNow();
  assert.equal(pcBundle.state.days['2030-01-21'].items[0].done, true, 'Phone changes reach computer');
  pcBundle.state.days['2030-01-21'].items[0].note = '电脑修改的备注';
  await pc.syncNow();
  await run('window.xiangzi.syncNow()');
  assert.equal(phoneBundle.state.days['2030-01-21'].items[0].note, '电脑修改的备注', 'Computer edits reach phone');
  for (const width of [320, 360, 390, 412, 768]) {
    window.setContentSize(width, 844);
    await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'), true, `${width}px has no horizontal overflow`);
  }
  window.setContentSize(390, 844);
  await run('selectDate("2030-01-21");window.scrollTo(0,0);new Promise(resolve=>requestAnimationFrame(resolve))');
  fs.writeFileSync(path.join(root, 'phone-month.png'), (await window.webContents.capturePage()).toPNG());
  await run('document.querySelector(".day-panel").scrollIntoView();new Promise(resolve=>requestAnimationFrame(resolve))');
  fs.writeFileSync(path.join(root, 'phone-agenda.png'), (await window.webContents.capturePage()).toPNG());
  await run('document.getElementById("sync-button").click();new Promise(resolve=>setTimeout(resolve,100))');
  fs.writeFileSync(path.join(root, 'phone-sync.png'), (await window.webContents.capturePage()).toPNG());
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.reload();
  await loaded;
  const restored = await run('window.xiangzi.getState()');
  assert.equal(restored.state.days['2030-01-21'].items[0].note, '电脑修改的备注');
  assert.equal(restored.sync.connected, true, 'Pairing restored');
  assert.equal(errors.length, 0, errors.join('\n'));
  const results = { checks: result, additionalChecks: 9, screenshots: root, errors };
  fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  clearTimeout(timeout); app.quit();
}).catch(error => { console.error(error); clearTimeout(timeout); app.exit(1); });
