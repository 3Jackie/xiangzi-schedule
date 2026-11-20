const path = require('node:path');
const { parseArgs } = require('node:util');
const packageJson = require('../package.json');
const { build, Platform } = require('electron-builder');

const { values, positionals } = parseArgs({ options: { output: { type: 'string' } }, allowPositionals: true });
const [edition = 'special', target = 'dir'] = positionals;
if (!['special', 'general'].includes(edition) || !['installer', 'dir'].includes(target) || positionals.length > 2) {
  throw new Error('Usage: node scripts/build.cjs <special|general> <dir|installer> [--output directory]');
}
const targetName = target === 'installer' ? 'nsis' : 'dir';
const isSpecial = edition === 'special';
const editionLabel = isSpecial ? '教学版' : '通用版';
const executableName = isSpecial ? 'XiangziSchedule-Teaching' : 'XiangziSchedule-General';
const shortcutName = isSpecial ? '巷子日程（教学版）' : '巷子日程（通用版）';
const base = packageJson.build;

const config = {
  ...base,
  appId: `app.xiangzi.schedule.${edition}`,
  productName: '巷子日程',
  executableName,
  directories: {
    ...base.directories,
    output: values.output || path.join('dist', edition)
  },
  extraMetadata: {
    ...base.extraMetadata,
    main: `src/main-${edition}.cjs`
  },
  win: {
    ...base.win,
    artifactName: `巷子日程-${editionLabel}-\${version}-Setup.\${ext}`
  },
  nsis: {
    ...base.nsis,
    createDesktopShortcut: true,
    menuCategory: '巷子日程',
    shortcutName
  }
};

build({
  targets: Platform.WINDOWS.createTarget(targetName),
  config
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
