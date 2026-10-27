'use strict';
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

test('Electron 启动入口保留中文日志、文件名、分块字符、stderr、参数与退出码', () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-log-encoding-'));
  const probe = path.join(dir, 'probe.cjs');
  fs.writeFileSync(probe, `
    const { app } = require('electron');
    const fs = require('node:fs');
    const path = require('node:path');
    app.setPath('userData', path.join(__dirname, 'profile'));
    app.disableHardwareAcceleration();
    setTimeout(() => app.exit(9), 10000);
    app.whenReady().then(() => {
      if (!process.argv.includes('--日志参数')) return app.exit(8);
      const watchers = [];
      fs.watch = (_dir, _options, callback) => watchers.push(callback);
      require(${JSON.stringify(path.join(root, 'src/main/dev.js'))}).setupDevWatch({
        isDestroyed: () => false,
        webContents: { send(channel) {
          if (channel === 'mh:dev-css') watchers[0]('change', 'assets/images/online-record/珍珠.png');
          if (channel === 'mh:dev-reload') watchers[1]('change', 'dev.js');
        } },
      });
      const log = console.log;
      console.log = (...args) => {
        log(...args);
        if (!String(args[0]).includes('请重启应用')) return;
        console.error('错误输出：中文日志');
        const bytes = Buffer.from('分块输出：中文与珍珠\\n', 'utf8');
        process.stdout.write(bytes.subarray(0, 5));
        setTimeout(() => {
          process.stdout.write(bytes.subarray(5));
          setTimeout(() => app.exit(7), 30);
        }, 20);
      };
      watchers[0]('change', 'styles.css');
    });
  `);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/electron.cjs'), probe, '--日志参数'], {
    cwd: dir, encoding: 'utf8', timeout: 15000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 7, result.stderr + result.stdout);
  for (const text of ['热更新已开启', '样式热替换', '页面自动刷新', '珍珠.png', '请重启应用', '分块输出：中文与珍珠']) {
    assert.ok(result.stdout.includes(text), text + '\n' + result.stdout);
  }
  assert.ok(result.stderr.includes('错误输出：中文日志'), result.stderr);
  assert.ok(!result.stdout.includes('\uFFFD'));
});

test('启动入口显示实际应用主窗口并完成页面加载', () => {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-startup-window-'));
  const probe = path.join(dir, 'probe.cjs');
  fs.writeFileSync(probe, `
    const { app, BrowserWindow } = require('electron');
    app.setPath('userData', ${JSON.stringify(path.join(dir, 'profile'))});
    setTimeout(() => app.exit(9), 10000);
    app.on('browser-window-created', (_event, win) => {
      win.webContents.once('did-finish-load', async () => {
        try {
          const ready = await win.webContents.executeJavaScript(
            'new Promise(resolve => { const poll = setInterval(() => { if (document.querySelectorAll(".nav-item").length === 7) { clearInterval(poll); resolve(true); } }, 20); })'
          );
          console.log('STARTUP_WINDOW=' + JSON.stringify({ visible: win.isVisible(), minimized: win.isMinimized(), ready }));
          app.exit(0);
        } catch (error) { console.error(error); app.exit(1); }
      });
    });
    require(${JSON.stringify(path.join(root, 'src/main/main.js'))});
  `);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/electron.cjs'), probe, '--dev'], {
    cwd: dir, encoding: 'utf8', timeout: 15000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const match = result.stdout.match(/STARTUP_WINDOW=(.+)/);
  assert.ok(match, result.stdout);
  assert.deepEqual(JSON.parse(match[1]), { visible: true, minimized: false, ready: true });
  assert.ok(result.stdout.includes('热更新已开启'));
});
