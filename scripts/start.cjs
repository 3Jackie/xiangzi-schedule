const { spawn } = require('node:child_process');
const path = require('node:path');
const electron = require('electron');

const edition = process.argv[2] === 'general' ? 'general' : 'special';
const child = spawn(electron, ['.'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, XIANGZI_EDITION: edition },
  stdio: 'inherit'
});

child.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
