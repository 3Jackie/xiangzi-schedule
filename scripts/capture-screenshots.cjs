const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const base = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(base, 'xiangzi-screenshots-'));
  app.setPath('appData', temporary);
  app.setPath('userData', temporary);
  app.setPath('sessionData', temporary);
  app.disableHardwareAcceleration();
  global.XIANGZI_EDITION = 'general';
  require('../src/main.cjs');
  const watchdog = setTimeout(() => { console.error('Screenshot capture timed out.'); app.exit(1); }, 60000);
  app.whenReady().then(async () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once('did-finish-load', resolve));
    window.setContentSize(1440, 1080);
    await window.webContents.executeJavaScript(`(async () => {
      const today = dateKey(new Date());
      const monday = mondayOf(new Date());
      const examples = [
        ['工作', '梳理本周计划', '09:00', '09:45', '确定三件最重要的事。'],
        ['学习', '阅读与笔记', '19:00', '20:00', '读完一章，记下自己的想法。'],
        ['工作', '项目讨论', '10:00', '11:00', '确认进度与下一步安排。'],
        ['工作', '完善设计稿', '14:00', '15:30', '集中处理细节。'],
        ['工作', '每周复盘', '09:00', '10:00', '回顾本周进度，整理下周要做的事。'],
        ['生活', '整理书桌', '10:00', '11:00', '给周末留一点轻松的时间。'],
        ['学习', '阅读一小时', '15:00', '16:00', '不赶进度，专心读书。']
      ];
      for (let index = 0; index < examples.length; index++) {
        const [category, title, startTime, endTime, note] = examples[index];
        const date = dateKey(shiftDate(monday, index));
        await window.xiangzi.setTheme(date, category);
        await window.xiangzi.addItem(date, { title, startTime, endTime, note });
      }
      await window.xiangzi.setTheme(today, '工作');
      let snapshot = await window.xiangzi.addItem(today, { title: '项目沟通', startTime: '14:00', endTime: '15:00', note: '沟通本周进度，记录需要跟进的问题。', reminderMinutes: 15 });
      await window.xiangzi.addItem(today, { title: '准备下周计划', startTime: '16:30', endTime: '17:00', note: '列好清单，然后安心下班。' });
      const first = snapshot.state.days[today].items[0];
      if (first) await window.xiangzi.toggleItem(today, first.id);
      await selectDate(today);
      await document.fonts.ready;
    })()`);
    const directory = path.join(__dirname, '..', 'docs', 'images');
    fs.mkdirSync(directory, { recursive: true });
    const capture = async name => {
      window.restore();
      window.show();
      await window.webContents.executeJavaScript("document.getElementById('toast').hidden = true; new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
      const image = await window.webContents.capturePage(undefined, { stayAwake: true });
      if (image.isEmpty()) throw new Error('Screenshot is empty');
      fs.writeFileSync(path.join(directory, name), image.toPNG());
    };
    await capture('general-month-zh.png');
    await window.webContents.executeJavaScript("document.getElementById('week-view-button').click()");
    await capture('general-week-zh.png');
    await window.webContents.executeJavaScript("document.getElementById('manage-categories-button').click()");
    await capture('general-categories-zh.png');
    await window.webContents.executeJavaScript("document.getElementById('category-dialog').close(); document.getElementById('month-view-button').click(); window.xiangzi.setLanguage('en-US').then(setSnapshot)");
    await capture('general-month-en.png');
    console.log('Four general-edition screenshots saved to docs/images using fictional, isolated data.');
    clearTimeout(watchdog);
    app.quit();
  }).catch(error => { console.error(error); clearTimeout(watchdog); app.exit(1); });
}
