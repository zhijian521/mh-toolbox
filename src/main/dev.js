'use strict';
/* 开发模式热更新（--dev 启用）：
 * renderer CSS → 免刷新替换样式；renderer JS/HTML → 自动刷新页面；
 * main / preload 变更 → 提示重启（避免 relaunch 产生游离进程）。 */
const fs = require('fs');
const path = require('path');

const RELOAD_DEBOUNCE = 120;
const MAIN_DEBOUNCE = 400;

function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, ms);
  };
}

function setupDevWatch(win) {
  const root = path.join(__dirname, '..', '..');
  const rendererDir = path.join(root, 'src', 'renderer');
  const mainDirs = [path.join(root, 'src', 'main'), path.join(root, 'src', 'preload')];

  const isJunk = (f) => !f || f.endsWith('.tmp') || f.startsWith('.') || f.includes('~$');
  const send = (ch) => {
    if (win && !win.isDestroyed()) win.webContents.send(ch);
  };

  const rendererChanged = debounce((rel) => {
    if (rel.endsWith('.css')) {
      console.log('[dev] 样式热替换：', rel);
      send('mh:dev-css');
    } else {
      console.log('[dev] 页面自动刷新：', rel);
      send('mh:dev-reload');
    }
  }, RELOAD_DEBOUNCE);

  const mainChanged = debounce(() => {
    console.log('[dev] 检测到 main/preload 变更，请重启应用（Ctrl+C 后重新 npm run dev）');
  }, MAIN_DEBOUNCE);

  fs.watch(rendererDir, { recursive: true }, (_e, f) => {
    if (!isJunk(String(f))) rendererChanged(String(f));
  });
  mainDirs.forEach((d) => {
    fs.watch(d, { recursive: true }, (_e, f) => {
      if (!isJunk(String(f))) mainChanged();
    });
  });
  console.log('[dev] 热更新已开启：CSS 免刷新 / 页面自动刷新（main 变更需手动重启）');
}

module.exports = { setupDevWatch };
