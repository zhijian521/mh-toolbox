/**
 * 端到端：启动真实窗口，按页面顺序跑一遍完整流程。
 *
 * 各段流程在 `./e2e/` 下，一个页面一个文件、导出一个 `async (env)` 函数；这里是唯一入口：
 * 准备临时 profile、伪造文件对话框、装好窗口钩子，然后按顺序 `await`。
 *
 * **段与段之间有数据依赖**：前一段留下的角色、速记、装备是后一段的前提，所以顺序不能调换，
 * 单独执行某一段必然缺前置数据。`env` 里传的是同一组助手（`read` / `until` / `click` /
 * `disk` …）、`state`（窗口与数据文件路径）以及备份段要用的那几个路径。
 */
const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-v2-electron-'));
app.setPath('appData', temporary);
const legacyDirectory = path.join(temporary, '梦幻养老助手');
fs.mkdirSync(legacyDirectory);
const legacyFile = path.join(legacyDirectory, 'data.json');
const legacyBytes = '{"currentVersion":"untouched"}';
fs.writeFileSync(legacyFile, legacyBytes);
let importFile = path.join(temporary, 'backup.json');
const exportFile = path.join(temporary, 'export.json');
dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [importFile],
});
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportFile });

const { createHelpers } = require('./e2e/helpers.cjs');
const characters = require('./e2e/01-character.cjs');
const goals = require('./e2e/02-goals.cjs');
const accounts = require('./e2e/03-accounts.cjs');
const income = require('./e2e/04-income.cjs');
const overview = require('./e2e/05-overview.cjs');
const equipment = require('./e2e/06-equipment.cjs');
const backup = require('./e2e/07-backup.cjs');

const errors = [];
const watchdog = setTimeout(() => {
    console.error('Electron tests timed out');
    app.exit(1);
}, 120000);
/** 窗口与数据文件路径：各段流程经 `env` 拿到，不各自闭包捕获。 */
const state = { window: null, file: '' };
const helpers = createHelpers(state);

app.on('browser-window-created', (_event, win) => {
    state.window = win;
    win.hide();
    win.webContents.on('console-message', (details) => {
        if (details.level === 'error') errors.push(details.message);
    });
    win.webContents.once('did-finish-load', async () => {
        const { read, until } = helpers;
        try {
            win.webContents.debugger.attach('1.3');
            await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
                enabled: true,
            });
            // 默认落地页是总览（侧栏第一项，也是打开应用后第一眼要看的东西）。
            await until(
                () => document.querySelector('.page-header h1')?.textContent === '总览',
                '启动总览页',
            );
            const info = await read(() => window.mhV2.info());
            state.file = info.dataFile;
            assert.equal(state.file, path.join(temporary, 'mh-tool-v2', 'data.json'));
            assert.equal(app.getPath('sessionData'), path.join(temporary, 'mh-tool-v2', 'session'));
            assert.equal(await read(() => !!(window.D || window.Views || window.mh)), false);

            const env = {
                ...helpers,
                state,
                assert,
                temporary,
                importFile,
                exportFile,
                legacyFile,
                legacyBytes,
            };
            // 顺序即依赖：前一段留下的角色 / 速记 / 装备是后一段的前提，不能调换。
            await characters(env);
            await goals(env);
            await accounts(env);
            await income(env);
            await overview(env);
            await equipment(env);
            await backup(env);

            assert.deepEqual(errors, []);
            clearTimeout(watchdog);
            console.log(
                'PASS Electron: isolation, character CRUD, drafts, rollback, school change, history, ordering, restart, goals, accounts, income, overview, equipment, text import, screenshot OCR, import/export/wipe',
            );
            app.exit(0);
        } catch (error) {
            clearTimeout(watchdog);
            console.error(error);
            console.error('Renderer errors:', errors);
            app.exit(1);
        }
    });
});
require('../src/main/main.cjs');
