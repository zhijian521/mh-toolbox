'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}
function run(command, args) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const mode = process.argv[2] || 'domain';
if (mode === 'domain') run(process.execPath, ['--test', ...files('tests').filter((file) => file.endsWith('.test.cjs')).sort()]);
else if (mode === 'electron') {
  for (const file of files('tests').filter((file) => file.endsWith('.electron.cjs')).sort()) run(require('electron'), [file]);
} else if (mode === 'syntax') {
  for (const file of [...files('src'), ...files('tests'), ...files('scripts')].filter((file) => /\.(js|cjs)$/.test(file))) run(process.execPath, ['--check', file]);
  console.log('JavaScript syntax checks passed');
} else throw new Error('未知测试模式：' + mode);
