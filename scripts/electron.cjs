'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), process.argv.slice(2), {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: false,
});

// Electron 输出 UTF-8 字节，先解码为文本再由 Node 写入 Windows 控制台。
child.stdout.setEncoding('utf8').pipe(process.stdout);
child.stderr.setEncoding('utf8').pipe(process.stderr);

child.on('error', (error) => {
  console.error('[electron] 启动失败：', error.message);
  process.exitCode = 1;
});
child.on('close', (code) => {
  process.exitCode = Number.isInteger(code) && code >= 0 ? code : 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
