const { app, BrowserWindow, dialog } = require('electron');
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
const errors = [];
const watchdog = setTimeout(() => {
    console.error('Electron tests timed out');
    app.exit(1);
}, 60000);
let window;
const read = (fn, ...args) =>
    window.webContents.executeJavaScript(
        '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')',
        true,
    );
async function until(fn, label) {
    for (let index = 0; index < 300; index++) {
        if (await read(fn)) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('等待失败：' + label);
}
const click = (text) =>
    read((text) => {
        const button = [...document.querySelectorAll('button')].find(
            (element) => element.textContent.trim() === text && !element.disabled,
        );
        if (!button) throw new Error('按钮不存在：' + text);
        button.click();
    }, text);
const field = (selector, value) =>
    read(
        (selector, value) => {
            const input = document.querySelector(selector);
            if (!input) throw new Error('字段不存在：' + selector);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        },
        selector,
        value,
    );
const submit = (selector) =>
    read((selector) => document.querySelector(selector).requestSubmit(), selector);
let file;
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'));

app.on('browser-window-created', (_event, win) => {
    window = win;
    win.hide();
    win.webContents.on('console-message', (details) => {
        if (details.level === 'error') errors.push(details.message);
    });
    win.webContents.once('did-finish-load', async () => {
        try {
            win.webContents.debugger.attach('1.3');
            await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
                enabled: true,
            });
            await until(
                () => document.querySelector('.page-header h1')?.textContent === '角色',
                '启动角色页',
            );
            const info = await read(() => window.mhV2.info());
            file = info.dataFile;
            assert.equal(file, path.join(temporary, 'mh-tool-v2', 'data.json'));
            assert.equal(app.getPath('sessionData'), path.join(temporary, 'mh-tool-v2', 'session'));
            assert.equal(await read(() => !!(window.D || window.Views || window.mh)), false);

            await click('＋ 添加角色');
            await until(() => !!document.querySelector('#character-form'), '新建档案');
            await field('[name="name"]', '轻舟');
            await field('[name="level"]', '109');
            await click('补齐门派技能');
            await until(() => document.querySelectorAll('.skill-row').length === 7, '门派模板');
            await field('.skill-row input[type="number"]', '0');
            await submit('#character-form');
            await until(() => !document.querySelector('.modal'), '新建保存');
            const first = disk().characters[0];
            assert.equal(first.progress.schoolSkills[0].level, 0);
            assert.equal(first.progress.training.attack, null);
            assert.equal(first.growthHistory.length, 0);

            await read(() => document.querySelector('button[aria-label="编辑档案"]').click());
            await until(() => !!document.querySelector('#character-form'), '编辑草稿');
            await field('[name="name"]', '未保存昵称');
            await click('取消');
            await until(() => !!document.querySelector('.discard-panel'), '未保存确认');
            assert.equal(await read(() => document.activeElement.textContent.trim()), '继续编辑');
            await click('继续编辑');
            await until(() => !document.querySelector('.discard-panel'), '返回编辑');
            assert.equal(
                await read(() => document.querySelector('[name="name"]').value),
                '未保存昵称',
            );
            await click('取消');
            await until(() => !!document.querySelector('.discard-panel'), '再次确认');
            await click('放弃修改');
            await until(() => !document.querySelector('.modal'), '放弃草稿');
            assert.equal(disk().characters[0].name, '轻舟');

            await read(() => document.querySelector('button[aria-label^="修改攻击修炼"]').click());
            await until(() => !!document.querySelector('#quick-form'), '快捷编辑');
            await field('[name="value"]', '18');
            fs.mkdirSync(file + '.tmp');
            await submit('#quick-form');
            await until(() => !!document.querySelector('#quick-form .error'), '保存失败显示');
            assert.equal(disk().characters[0].progress.training.attack, null);
            assert.equal(await read(() => document.querySelector('[name="value"]').value), '18');
            assert.equal(
                await read(() =>
                    document
                        .querySelector('[data-character-id] button[aria-label^="修改攻击修炼"]')
                        .textContent.trim(),
                ),
                '—',
            );
            fs.rmdirSync(file + '.tmp');
            await submit('#quick-form');
            await until(() => !document.querySelector('.modal'), '失败重试');
            assert.equal(disk().characters[0].progress.training.attack, 18);
            assert.equal(disk().characters[0].growthHistory.length, 1);

            await read(() => document.querySelector('button[aria-label="编辑档案"]').click());
            await until(() => !!document.querySelector('#character-form'), '转门派');
            await field('[name="school"]', '普陀山');
            await until(() => !!document.querySelector('.school-choice'), '技能处理选择');
            await submit('#character-form');
            await until(() => !!document.querySelector('.form-error'), '未确认不保存');
            await click('保留现有技能');
            await submit('#character-form');
            await until(() => !document.querySelector('.modal'), '保留旧技能');
            assert.equal(disk().characters[0].school, '普陀山');
            assert.equal(disk().characters[0].progress.schoolSkills[0].name, '为官之道');

            await click('养成记录');
            await until(() => !!document.querySelector('.history-entry'), '养成历史');
            assert.ok(
                (await read(() => document.querySelector('.modal').textContent)).includes(
                    '攻击修炼',
                ),
            );
            await click('关闭');
            await until(() => !document.querySelector('.modal'), '关闭历史');
            await click('＋ 添加角色');
            await until(() => !!document.querySelector('#character-form'), '新增第二角色');
            await field('[name="name"]', '山月');
            await submit('#character-form');
            await until(() => !document.querySelector('.modal'), '保存第二角色');
            const ordered = () =>
                disk()
                    .characters.slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item) => item.name);
            assert.deepEqual(ordered(), ['山月', '轻舟']);
            await read(() =>
                document
                    .querySelector('.drag-handle')
                    .dispatchEvent(
                        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
                    ),
            );
            await until(
                () => document.querySelector('.character-card h2')?.textContent === '轻舟',
                '键盘排序',
            );
            assert.deepEqual(ordered(), ['轻舟', '山月']);

            await read(() => {
                const handles = document.querySelectorAll('.drag-handle');
                const destination = document.querySelector('.card-wrapper');
                const transfer = new DataTransfer();
                handles[1].dispatchEvent(
                    new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true }),
                );
                const bounds = destination.getBoundingClientRect();
                destination.dispatchEvent(
                    new DragEvent('dragover', {
                        dataTransfer: transfer,
                        clientY: bounds.top + 10,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                destination.dispatchEvent(
                    new DragEvent('drop', {
                        dataTransfer: transfer,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            });
            await until(
                () => document.querySelector('.character-card h2')?.textContent === '山月',
                '拖动排序',
            );
            assert.deepEqual(ordered(), ['山月', '轻舟']);
            await read(() =>
                document
                    .querySelector('.drag-handle')
                    .dispatchEvent(
                        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
                    ),
            );
            await until(
                () => document.querySelector('.character-card h2')?.textContent === '轻舟',
                '恢复排序',
            );

            win.webContents.reload();
            await until(
                () => document.querySelectorAll('.character-card').length === 2,
                '重启恢复',
            );
            assert.equal(
                await read(() => document.querySelector('.character-card h2').textContent),
                '轻舟',
            );
            await read(() => document.querySelectorAll('button[aria-label="删除角色"]')[1].click());
            await until(
                () => document.querySelector('.modal h2')?.textContent === '删除角色',
                '删除角色确认',
            );
            await click('确认删除');
            await until(
                () =>
                    !document.querySelector('.modal') &&
                    document.querySelectorAll('.character-card').length === 1,
                '删除角色完成',
            );
            assert.equal(disk().characters.length, 1);
            await read(() => document.querySelector('a[href="#/settings"]').click());
            await until(() => !!document.querySelector('.settings-page'), '设置页面');
            fs.writeFileSync(
                importFile,
                JSON.stringify({
                    schemaVersion: 999,
                    characters: [],
                    transactions: [],
                }),
            );
            await click('导入 JSON 备份');
            await until(
                () => document.querySelector('.toast')?.textContent.includes('版本'),
                '拒绝未来版本',
            );
            assert.equal(disk().characters.length, 1);
            const backup = disk();
            backup.characters[0].name = '备份角色';
            fs.writeFileSync(importFile, JSON.stringify(backup));
            await click('导入 JSON 备份');
            await until(
                () => document.querySelector('.modal h2')?.textContent === '确认导入备份',
                '导入预览',
            );
            await click('确认导入 V2');
            await until(() => !document.querySelector('.modal'), '备份导入');
            assert.equal(disk().characters[0].name, '备份角色');
            assert.equal(fs.readFileSync(importFile, 'utf8'), JSON.stringify(backup));
            await click('导出 JSON 备份');
            await until(
                () => document.querySelector('.toast')?.textContent.includes('已导出'),
                '备份导出',
            );
            assert.deepEqual(JSON.parse(fs.readFileSync(exportFile, 'utf8')), disk());
            await click('清空 V2 数据');
            await until(() => !!document.querySelector('.modal'), '清空确认');
            await click('确认清空');
            await until(() => !document.querySelector('.modal'), '清空完成');
            assert.equal(disk().characters.length, 0);
            assert.ok(
                fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.bak')).length >=
                    2,
            );
            assert.equal(fs.readFileSync(legacyFile, 'utf8'), legacyBytes);
            assert.deepEqual(errors, []);
            clearTimeout(watchdog);
            console.log(
                'PASS Electron: isolation, character CRUD, drafts, rollback, school change, history, ordering, restart, import/export/wipe',
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
