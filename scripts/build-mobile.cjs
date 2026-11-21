const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'android/app/src/main/assets');
(async () => {
  fs.mkdirSync(destination, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(root, 'src/mobile/api.cjs')], outfile: path.join(destination, 'mobile-api.js'), bundle: true,
    platform: 'browser', format: 'iife', target: ['chrome100'],
    alias: { 'node:crypto': path.join(root, 'src/mobile/crypto.cjs') }
  });
  let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  html = html.replace('<script src="./locales.js" defer>', '<script src="./mobile-api.js" defer></script>\n  <script src="./locales.js" defer>');
  fs.writeFileSync(path.join(destination, 'index.html'), html);
  for (const file of ['renderer.js', 'locales.js', 'sync-ui.js', 'style.css', 'mobile.css']) fs.copyFileSync(path.join(root, 'src', file), path.join(destination, file));
  const drawable = path.join(root, 'android/app/src/main/res/drawable');
  fs.mkdirSync(drawable, { recursive: true });
  fs.copyFileSync(path.join(root, 'src/assets/icon.png'), path.join(drawable, 'app_icon.png'));
  console.log('Android offline assets built.');
})().catch(error => { console.error(error); process.exitCode = 1; });
