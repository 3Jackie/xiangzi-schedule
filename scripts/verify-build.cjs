const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const asar = require('@electron/asar');

const root = path.resolve(process.argv[2] || path.join('dist', 'verified'));
const checksums = [];
for (const edition of ['special', 'general']) {
  const directory = path.join(root, edition);
  const archive = path.join(directory, 'win-unpacked', 'resources', 'app.asar');
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(metadata.main, `src/main-${edition}.cjs`);
  const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/').replace(/^\//, ''));
  assert.ok(files.every(file => file === 'src' || file.startsWith('src/') || ['package.json', 'README.md', 'LICENSE'].includes(file)), 'Only application files may be packaged');
  assert.ok(!files.some(file => /plans.*\.json|\.env|\.pfx|\.pem|backup/i.test(file)), 'Personal data and credentials must not be packaged');
  for (const file of files.filter(file => file.startsWith('src/') || file === 'README.md')) {
    const source = path.join(...file.split('/'));
    if (fs.statSync(source).isFile()) assert.deepEqual(asar.extractFile(archive, source), fs.readFileSync(source), `${edition}: ${file} must match the current source`);
  }
  const installer = fs.readdirSync(directory).find(name => name.endsWith('-Setup.exe'));
  assert.ok(installer, `${edition}: installer is present`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, installer))).digest('hex');
  checksums.push(`${hash}  ${installer}`);
  console.log(`${edition}: packaged sources and installer verified.`);
}
fs.writeFileSync(path.join(root, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, 'utf8');
console.log('SHA256SUMS.txt generated for the release assets.');
