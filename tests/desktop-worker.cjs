const { app, BrowserWindow, dialog } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const [root, edition, mode = 'exercise'] = process.argv.slice(2);
if (!root || !['special', 'general'].includes(edition)) throw new Error('Isolated test directory and edition are required.');
fs.mkdirSync(root, { recursive: true });
const initialPath = path.join(root, edition);
fs.mkdirSync(initialPath, { recursive: true });
app.setPath('appData', root);
app.setPath('userData', initialPath);
app.setPath('sessionData', initialPath);
global.XIANGZI_EDITION = edition;
app.disableHardwareAcceleration();

const backupPath = path.join(root, `${edition}-backup.json`);
dialog.showSaveDialog = async () => ({ canceled: false, filePath: backupPath });
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [backupPath] });
let deletionAttempts = 0;
let categoryRemovalAttempts = 0;
dialog.showMessageBox = async (_window, options) => {
  if (options.message.startsWith('确定删除') && ++deletionAttempts === 1) return { response: 0 };
  if (options.message.startsWith('移除') && ++categoryRemovalAttempts === 1) return { response: 0 };
  return { response: 1 };
};

require('../src/main.cjs');

const watchdog = setTimeout(() => {
  console.error('Desktop checks timed out.');
  app.exit(1);
}, 60000);

app.whenReady().then(async () => {
  const window = BrowserWindow.getAllWindows()[0];
  assert.ok(window, 'Main window created');
  await new Promise((resolve, reject) => {
    if (!window.webContents.isLoading()) return resolve();
    window.webContents.once('did-finish-load', resolve);
    window.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
  });
  if (mode === 'restart') {
    const snapshot = await window.webContents.executeJavaScript('window.xiangzi.getState()');
    assert.equal(snapshot.edition, edition);
    assert.equal(snapshot.startupError, '');
    assert.ok(snapshot.dataPath.startsWith(root));
    assert.deepEqual(snapshot.state, JSON.parse(fs.readFileSync(backupPath, 'utf8')));
    assert.equal(snapshot.state.days['2030-01-31'].theme, edition === 'general' ? '工作' : '教学');
    if (edition === 'general') assert.equal(snapshot.state.language, 'en-US');
    console.log(`${edition}: schedules and edition-specific categories survived a full application restart.`);
    clearTimeout(watchdog);
    app.quit();
    return;
  }
  const errors = [];
  window.webContents.on('console-message', (_event, ...args) => {
    const detail = args[0];
    if (typeof detail === 'object' && detail.level === 'error') errors.push(detail.message);
    else if (detail === 3) errors.push(args[1]);
  });
  const results = await window.webContents.executeJavaScript(`(async () => {
    const checks = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
    const waitFor = async predicate => {
      for (let index = 0; index < 150; index++) {
        if (predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error('Timed out waiting for interface update');
    };
    const $ = id => document.getElementById(id);
    const initial = await window.xiangzi.getState();
    check(initial.edition === ${JSON.stringify(edition)}, 'Correct edition');
    check(Object.keys(initial.state.days).length === 0, 'Starts with isolated empty data');
    await waitFor(() => document.querySelectorAll('.calendar-day').length === 42);
    check($('manage-categories-button').hidden === (${JSON.stringify(edition)} !== 'general'), 'Category management visibility');
    check($('language-button').hidden === (${JSON.stringify(edition)} !== 'general'), 'Language switch is available only in general edition');
    check(getComputedStyle($('category-dialog')).display === 'none', 'Category dialog hidden initially');
    check(getComputedStyle($('clear-search')).display === 'none', 'Hidden controls do not occupy space');

    const date = '2030-01-31';
    const firstTheme = initial.themeChoices[0];
    await window.xiangzi.setTheme(date, firstTheme);
    let snapshot = await window.xiangzi.addItem(date, {
      title: '演示安排', startTime: '09:00', endTime: '10:00', note: '这是用于界面测试的虚构内容', reminderMinutes: null
    });
    let item = snapshot.state.days[date].items[0];
    await selectDate(date);
    check($('theme-select').value === firstTheme, 'Day theme selection');
    check(document.querySelector('.agenda-title')?.textContent === '演示安排', 'Added item displayed');

    document.querySelector('.done-toggle').click();
    await waitFor(() => document.querySelector('.agenda-item')?.classList.contains('is-done'));
    snapshot = await window.xiangzi.getState();
    item = snapshot.state.days[date].items[0];
    check(item.done, 'Completion persists through IPC');
    snapshot = await window.xiangzi.updateItem(date, date, { ...item, title: '修改后的安排' });
    check(snapshot.state.days[date].items[0].done, 'Editing preserves completion');

    $('next-button').click();
    check($('selected-date-title').textContent.includes('2月28日'), 'January 31 moves to February 28');
    $('previous-button').click();
    check($('calendar-title').textContent.includes('1月'), 'Month navigation stays synchronized');
    await selectDate(date);

    $('add-item-button').click();
    $('item-title').value = '表单创建';
    $('item-start').value = '13:00';
    $('item-end').value = '14:00';
    $('item-form').requestSubmit();
    await waitFor(() => !$('item-dialog').open);
    snapshot = await window.xiangzi.getState();
    check(snapshot.state.days[date].items.some(entry => entry.title === '表单创建'), 'New item form saves');
    check($('form-error').hidden, 'No form error after valid save');

    const completedRow = [...document.querySelectorAll('.agenda-item')].find(row => row.querySelector('.agenda-title').textContent === '修改后的安排');
    completedRow.querySelector('[data-action="edit"]').click();
    $('item-title').value = '表单修改后保留完成';
    $('item-form').requestSubmit();
    await waitFor(() => !$('item-dialog').open);
    snapshot = await window.xiangzi.getState();
    check(snapshot.state.days[date].items.find(entry => entry.title === '表单修改后保留完成')?.done, 'Edit form retains completion');

    await window.xiangzi.addItem('2030-02-01', { title: '每周例会', startTime: '11:00', endTime: '12:00' }, { frequency: 'weekly', until: '2030-02-15' });
    snapshot = await window.xiangzi.getState();
    check(['2030-02-01', '2030-02-08', '2030-02-15'].every(key => snapshot.state.days[key]?.items.length === 1), 'Weekly recurrence creates three occurrences');

    $('search-input').value = '例会';
    $('search-input').dispatchEvent(new Event('input', { bubbles: true }));
    check(document.querySelectorAll('.agenda-item').length === 3, 'Search spans dates beyond visible month');
    $('clear-search').click();
    $('week-view-button').click();
    check(document.querySelectorAll('.week-day').length === 7, 'Week view contains seven days');
    check(getComputedStyle($('weekday-row')).display === 'none', 'Week view hides duplicate headers');
    $('month-view-button').click();

    if (${JSON.stringify(edition)} === 'general') {
      $('manage-categories-button').click();
      check($('category-dialog').open, 'Category manager opens');
      $('category-list').querySelector('input').value = '项目';
      $('add-category-button').click();
      [...$('category-list').querySelectorAll('input')].at(-1).value = '运动';
      $('category-form').requestSubmit();
      await waitFor(() => !$('category-dialog').open);
      snapshot = await window.xiangzi.getState();
      check(snapshot.state.categories.join(',') === '项目,学习,生活,运动', 'Custom categories save');
      check(snapshot.state.days[date].theme === '项目', 'Category rename updates existing dates');
      check(snapshot.state.days[date].items.length === 2, 'Category rename preserves schedules');

      $('manage-categories-button').click();
      const removalButton = [...$('category-list').querySelectorAll('.category-row')].find(row => row.querySelector('input').value === '运动').querySelector('button');
      removalButton.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      check($('category-list').children.length === 4, 'Cancel category removal retains row');
      removalButton.click();
      await waitFor(() => $('category-list').children.length === 3);
      $('category-form').requestSubmit();
      await waitFor(() => !$('category-dialog').open);
      snapshot = await window.xiangzi.getState();
      check(!snapshot.state.categories.includes('运动'), 'Unused category can be removed');
      await window.xiangzi.setCategories(['学习', '生活']);
      snapshot = await window.xiangzi.getState();
      check(snapshot.state.days[date].theme === '' && snapshot.state.days[date].items.length === 2, 'Removing used category retains schedules');
      await window.xiangzi.setCategories(['工作', '学习', '生活']);
      await window.xiangzi.setTheme(date, '工作');
    } else {
      let refused = false;
      try { await window.xiangzi.setCategories(['工作']); } catch { refused = true; }
      check(refused, 'Teaching edition rejects custom categories');
    }

    const beforeBackup = await window.xiangzi.getState();
    await window.xiangzi.exportBackup();
    const canceled = await window.xiangzi.deleteItem(date, beforeBackup.state.days[date].items[0].id);
    check(canceled === null && JSON.stringify((await window.xiangzi.getState()).state) === JSON.stringify(beforeBackup.state), 'Cancel deletion keeps schedules');
    await window.xiangzi.deleteItem(date, beforeBackup.state.days[date].items[0].id);
    check((await window.xiangzi.getState()).state.days[date].items.length === 1, 'Confirmed deletion removes one item');
    const restored = await window.xiangzi.importBackup();
    check(JSON.stringify(restored.state) === JSON.stringify(beforeBackup.state), 'Backup restores themes, schedules and completion');
    await selectDate(date);
    if (${JSON.stringify(edition)} === 'general') {
      const originalDays = JSON.stringify(restored.state.days);
      $('language-button').click();
      await waitFor(() => document.documentElement.lang === 'en-US');
      check($('today-button').textContent === 'Today' && $('month-view-button').textContent === 'Month', 'Language button switches calendar controls to English');
      check($('calendar-title').textContent === 'January 2030', 'Month heading uses English date formatting');
      check($('theme-select').selectedOptions[0].textContent === 'Work', 'Default category labels display in English');
      check($('search-input').placeholder === 'Search schedules', 'Search placeholder is translated');
      $('add-item-button').click();
      check($('dialog-title').textContent === 'New event' && $('save-item-button').textContent === 'Save event', 'Event dialog is translated');
      check($('item-reminder').options[1].textContent === 'At start time', 'Reminder choices are translated');
      $('item-dialog').close();
      let englishError = '';
      try { await window.xiangzi.addItem(date, { title: 'Invalid', startTime: '11:00', endTime: '10:00' }); } catch (error) { englishError = error.message; }
      check(englishError.includes('The end time must be after the start time'), 'IPC validation errors use the selected language');
      $('manage-categories-button').click();
      check($('category-list').querySelector('input').value === 'Work', 'Category manager displays translated defaults');
      $('category-form').requestSubmit();
      await waitFor(() => !$('category-dialog').open);
      const englishState = await window.xiangzi.getState();
      check(englishState.state.categories.join(',') === '工作,学习,生活', 'Saving translated category defaults preserves stored names');
      check(JSON.stringify(englishState.state.days) === originalDays, 'Language switch preserves all event data');
      $('language-button').click();
      await waitFor(() => document.documentElement.lang === 'zh-CN');
      check($('today-button').textContent === '今天' && $('theme-select').selectedOptions[0].textContent === '工作', 'Switching back restores Chinese labels');
      $('language-button').click();
      await waitFor(() => document.documentElement.lang === 'en-US');
      await window.xiangzi.exportBackup();
    }
    return { checks, dataPath: restored.dataPath, edition: restored.edition };
  })()`, true);
  assert.ok(results.dataPath.startsWith(root), 'Data stays in test directory');
  assert.ok(fs.existsSync(backupPath), 'Backup written');
  const savedState = JSON.parse(fs.readFileSync(results.dataPath, 'utf8'));
  assert.deepEqual(savedState, JSON.parse(fs.readFileSync(backupPath, 'utf8')), 'Restored state persisted on disk');
  assert.equal(errors.length, 0, `Renderer errors: ${errors.join('; ')}`);
  const capture = async name => {
    window.restore();
    window.show();
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
    try {
      const image = await window.webContents.capturePage(undefined, { stayAwake: true });
      assert.ok(!image.isEmpty(), `${name}: screenshot is not empty`);
      fs.writeFileSync(path.join(root, `${edition}-${name}.png`), image.toPNG());
    } catch (error) {
      throw new Error(`${name} screenshot failed: ${error.message}`, { cause: error });
    }
  };
  await capture('month');
  await window.webContents.executeJavaScript("document.getElementById('add-item-button').click()");
  await capture('dialog');
  await window.webContents.executeJavaScript("document.getElementById('item-dialog').close(); document.getElementById('week-view-button').click()");
  await capture('week');
  if (edition === 'general') {
    await window.webContents.executeJavaScript("document.getElementById('manage-categories-button').click()");
    await capture('categories');
  }
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  window.webContents.reload();
  await loaded;
  const reloaded = await window.webContents.executeJavaScript('window.xiangzi.getState()');
  assert.deepEqual(reloaded.state, savedState, 'State remains available after renderer reload');
  fs.writeFileSync(path.join(root, `${edition}-results.json`), JSON.stringify(results, null, 2));
  console.log(`${edition}: ${results.checks.length} interface checks passed; data saved and reload verified.`);
  clearTimeout(watchdog);
  app.quit();
}).catch(error => {
  console.error(error);
  clearTimeout(watchdog);
  app.exit(1);
});
