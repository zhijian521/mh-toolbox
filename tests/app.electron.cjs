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
const errors = [];
const watchdog = setTimeout(() => {
    console.error('Electron tests timed out');
    app.exit(1);
}, 120000);
let window;
const read = (fn, ...args) =>
    window.webContents.executeJavaScript(
        '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')',
        true,
    );
async function until(fn, label, ...args) {
    for (let index = 0; index < 300; index++) {
        if (await read(fn, ...args)) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('等待失败：' + label);
}
/**
 * 等一件要真正花时间的活。
 *
 * 本地 OCR 首次要加载 ONNX 模型，几秒钟起步，默认 6 秒的上限不够；轮询间隔也放宽，
 * 免得几十次 `executeJavaScript` 反过来拖慢推理。
 */
async function untilSlow(fn, label, seconds, ...args) {
    for (let index = 0; index < Math.round((seconds * 1000) / 50); index++) {
        if (await read(fn, ...args)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
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
const openSelect = (label) =>
    read((label) => {
        const trigger = document.querySelector('[role="combobox"][aria-label="' + label + '"]');
        if (!trigger) throw new Error('下拉不存在：' + label);
        trigger.click();
    }, label);
// 查找与点击放在同一次执行里：分成两次会在弹层重渲染的间隙里拿不到节点。
const choose = async (label, text) => {
    await openSelect(label);
    await until(
        (text) => {
            const item = [...document.querySelectorAll('.popover .xitem')].find(
                (element) => element.textContent.trim() === text,
            );
            if (!item) return false;
            item.click();
            return true;
        },
        '选择选项：' + label + ' / ' + text,
        text,
    );
};
// 目标状态下拉的选项带计数（如「已完成 1」），按前缀匹配，避免把数量写死在用例里。
const chooseStatus = async (text) => {
    await openSelect('目标状态');
    await until(
        (text) => {
            const item = [...document.querySelectorAll('.popover .xitem')].find((element) =>
                element.textContent.trim().startsWith(text),
            );
            if (!item) return false;
            item.click();
            return true;
        },
        '选择目标状态：' + text,
        text,
    );
};
let file;
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'));
/**
 * 在 Node 侧轮询磁盘。
 *
 * `until` 是把函数序列化丢进页面执行，闭包里的 `disk()` 之类根本看不见；账号同步是
 * 异步落盘的，只能读文件等它写完。
 */
async function untilDisk(check, label) {
    for (let index = 0; index < 200; index++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error('等待失败：' + label);
}
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
            // 默认落地页是总览（侧栏第一项，也是打开应用后第一眼要看的东西）。
            await until(
                () => document.querySelector('.page-header h1')?.textContent === '总览',
                '启动总览页',
            );
            const info = await read(() => window.mhV2.info());
            file = info.dataFile;
            assert.equal(file, path.join(temporary, 'mh-tool-v2', 'data.json'));
            assert.equal(app.getPath('sessionData'), path.join(temporary, 'mh-tool-v2', 'session'));
            assert.equal(await read(() => !!(window.D || window.Views || window.mh)), false);
            // 空数据时总览是「创建角色」引导页，先点进去把流程接上。
            await read(() => document.querySelector('.empty a[href="#/characters"]').click());
            await until(
                () => document.querySelector('.page-header h1')?.textContent === '角色',
                '进入角色页',
            );

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
            // Tab 收起下拉并继续前进一格：焦点落在触发器后面那个控件上，不经过触发器本身。
            await openSelect('门派');
            await until(() => !!document.querySelector('.select-popover'), '门派下拉');
            await read(() =>
                (document.activeElement || document.body).dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
                ),
            );
            await until(() => !document.querySelector('.select-popover'), 'Tab 收起下拉');
            assert.equal(
                await read(() => document.activeElement.getAttribute('name')),
                'server',
                'Tab 应落触发器后面的服务器输入，而不是退回触发器',
            );
            // Shift+Tab 反向一格：回到触发器前面的等级输入。
            await openSelect('门派');
            await until(() => !!document.querySelector('.select-popover'), '门派下拉再次打开');
            await read(() =>
                (document.activeElement || document.body).dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'Tab',
                        shiftKey: true,
                        bubbles: true,
                        cancelable: true,
                    }),
                ),
            );
            await until(() => !document.querySelector('.select-popover'), 'Shift+Tab 收起下拉');
            const backward = await read(() => {
                const element = document.activeElement;
                return {
                    name: element?.getAttribute('name'),
                    html: element?.outerHTML.slice(0, 120),
                };
            });
            assert.equal(
                backward.name,
                'level',
                'Shift+Tab 应落触发器前面的等级输入，实际：' + backward.html,
            );
            await choose('门派', '普陀山');
            await until(() => !!document.querySelector('.school-choice'), '技能处理选择');
            await submit('#character-form');
            await until(() => !!document.querySelector('.form-error'), '未确认不保存');
            await click('保留现有技能');
            await submit('#character-form');
            await until(() => !document.querySelector('.modal'), '保留旧技能');
            assert.equal(disk().characters[0].school, '普陀山');
            assert.equal(disk().characters[0].progress.schoolSkills[0].name, '为官之道');

            await read(() => document.querySelector('button[aria-label="编辑档案"]').click());
            await until(() => !!document.querySelector('#character-form'), '技能排序草稿');
            const skillNames = () =>
                read(() =>
                    [...document.querySelectorAll('.skill-row')].map(
                        (row) => row.querySelector('input:not([type="number"])').value,
                    ),
                );
            const order = await skillNames();
            assert.ok(order.length >= 3);
            assert.equal(
                await read(() => document.querySelectorAll('.skill-row .drag-handle').length),
                order.length,
            );
            await read(() => {
                const rows = document.querySelectorAll('.skill-row');
                const transfer = new DataTransfer();
                rows[0]
                    .querySelector('.drag-handle')
                    .dispatchEvent(
                        new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true }),
                    );
                const bounds = rows[2].getBoundingClientRect();
                rows[2].dispatchEvent(
                    new DragEvent('dragover', {
                        dataTransfer: transfer,
                        clientX: bounds.right - 4,
                        clientY: bounds.top + 10,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
                rows[2].dispatchEvent(
                    new DragEvent('drop', {
                        dataTransfer: transfer,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            });
            await until(
                (name) =>
                    document.querySelector('.skill-row input:not([type="number"])').value === name,
                '技能拖动',
                order[1],
            );
            assert.deepEqual(await skillNames(), [order[1], order[2], order[0], ...order.slice(3)]);
            await read(() =>
                document
                    .querySelector('.skill-row .drag-handle')
                    .dispatchEvent(
                        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
                    ),
            );
            await until(
                (name) =>
                    document.querySelector('.skill-row input:not([type="number"])').value === name,
                '技能方向键排序',
                order[2],
            );
            assert.deepEqual(await skillNames(), [order[2], order[1], order[0], ...order.slice(3)]);
            // 增删技能后焦点仍留在技能组内：新行落到名称框，删行落到相邻的「移除」。
            await click('＋ 添加技能');
            await until(
                (count) => document.querySelectorAll('.skill-row').length === count + 1,
                '添加技能行',
                order.length,
            );
            assert.equal(
                await read(() => document.activeElement?.getAttribute('placeholder')),
                '技能名称',
            );
            await read(() => {
                const rows = document.querySelectorAll('.skill-row');
                rows[rows.length - 1].querySelector('button.danger').click();
            });
            await until(
                (count) => document.querySelectorAll('.skill-row').length === count,
                '移除技能行',
                order.length,
            );
            assert.equal(
                await read(() => document.activeElement?.getAttribute('aria-label')),
                '移除此技能',
            );
            // 分区导航跟随滚动，而不是只在点击时切换。
            const bodyMetrics = await read(() => {
                const body = document.querySelector('.modal-body');
                return { client: body.clientHeight, scroll: body.scrollHeight };
            });
            assert.ok(
                bodyMetrics.scroll > bodyMetrics.client,
                '弹窗内容应可滚动：' + JSON.stringify(bodyMetrics),
            );
            await read(() => {
                const body = document.querySelector('.modal-body');
                body.scrollTop = body.scrollHeight;
            });
            await until(
                () =>
                    document
                        .querySelector('.section-nav [aria-current="location"]')
                        ?.textContent.trim() === '其他养成',
                '滚动到底部高亮其他养成',
            );
            await read(() => {
                document.querySelector('.modal-body').scrollTop = 0;
            });
            await until(
                () =>
                    document
                        .querySelector('.section-nav [aria-current="location"]')
                        ?.textContent.trim() === '基础信息',
                '滚回顶部高亮基础信息',
            );
            await submit('#character-form');
            await until(() => !document.querySelector('.modal'), '保存技能顺序');
            assert.deepEqual(
                disk()
                    .characters[0].progress.schoolSkills.map((item) => item.name)
                    .slice(0, 3),
                [order[2], order[1], order[0]],
            );

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

            // ---- 目标页：跟随档案 → 批量更新 → 达成 → 养成记录 ----
            await read(() => document.querySelector('a[href="#/goals"]').click());
            await until(
                () => document.querySelector('.page-header h1')?.textContent === '目标',
                '目标页面',
            );
            assert.equal(await read(() => document.querySelectorAll('.goal-card').length), 0);
            await click('新建第一个目标');
            await until(() => !!document.querySelector('#goal-form'), '新建目标表单');
            await submit('#goal-form');
            await until(() => document.querySelectorAll('.goal-card').length === 1, '目标创建');
            const goalCard = () =>
                read(() => {
                    const card = document.querySelector('.goal-card');
                    if (!card) return null;
                    const text = (selector) =>
                        card.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '';
                    return {
                        title: text('.goal-title'),
                        meta: text('.goal-meta'),
                        nums: text('.goal-nums'),
                        members: [...card.querySelectorAll('.goal-member')].map((row) =>
                            row.textContent.replace(/\s+/g, ' ').trim(),
                        ),
                        pct: card.querySelector('.progress').getAttribute('aria-valuenow'),
                        done: card.classList.contains('done'),
                    };
                });
            let goal = await goalCard();
            assert.equal(goal.title, '全部角色 · 强身术达到 120级');
            assert.ok(goal.meta.includes('养成目标'), goal.meta);
            assert.ok(goal.meta.includes('全部角色'), goal.meta);
            assert.ok(goal.meta.includes('跟随角色档案'), goal.meta);
            assert.equal(goal.pct, '0');
            assert.ok(goal.members[0].includes('待补录'), goal.members[0]);
            assert.equal(disk().goals[0].tracking.key, '强身术');
            assert.equal(disk().goals[0].tracking.category, 'auxiliarySkills');

            await click('更新养成');
            await until(() => !!document.querySelector('#goal-growth-form'), '更新养成表单');
            await field('#goal-growth-form input[type="number"]', '120');
            await submit('#goal-growth-form');
            await until(() => !document.querySelector('#goal-growth-form'), '保存养成进度');
            const filled = disk().characters[0].progress.auxiliarySkills.find(
                (skill) => skill.name === '强身术',
            );
            assert.equal(filled.level, 120);
            assert.equal(disk().goals.length, 1);
            assert.equal(disk().goals[0].logs.length, 0, '跟随档案的目标不产生自己的流水');
            await chooseStatus('已完成');
            await until(
                () => document.querySelector('.goal-card')?.classList.contains('done'),
                '目标自动达成',
            );
            goal = await goalCard();
            assert.equal(goal.pct, '100');
            assert.ok(goal.meta.includes('已全部达标'), goal.meta);
            assert.ok(goal.members[0].includes('已达标'), goal.members[0]);
            await click('养成记录');
            await until(() => !!document.querySelector('.record-row'), '养成记录弹窗');
            assert.equal(await read(() => document.querySelectorAll('.record-row').length), 1);
            assert.ok(
                await read(() =>
                    document.querySelector('.record-row').textContent.includes('强身术'),
                ),
            );
            await click('关闭');
            await until(() => !document.querySelector('.modal'), '关闭养成记录');

            // ---- 手动累计目标：记进度、编辑、删除记录、改目标数值 ----
            await chooseStatus('进行中');
            await click('＋ 新建目标');
            await until(() => !!document.querySelector('#goal-form'), '新建存钱目标');
            await choose('目标类型', '存钱目标');
            await field('[name="target"]', '1000');
            await submit('#goal-form');
            await until(() => document.querySelectorAll('.goal-card').length === 1, '存钱目标创建');
            goal = await goalCard();
            assert.equal(goal.title, '全部角色 · 存钱目标达到 1000万');
            assert.ok(goal.meta.includes('共同累计'), goal.meta);
            assert.equal(disk().goals[1].tracking, null);

            await click('＋ 记进度');
            await until(() => !!document.querySelector('#goal-progress-form'), '记进度表单');
            // 空表单不能提交：Number('') === 0 能通过领域的有限数校验，会落一条 +0 记录。
            assert.equal(
                await read(() => document.querySelector('.modal .btn.primary').disabled),
                true,
                '进度未填时保存按钮应禁用',
            );
            await submit('#goal-progress-form');
            await new Promise((resolve) => setTimeout(resolve, 200));
            assert.ok(
                await read(() => !!document.querySelector('#goal-progress-form')),
                '空提交后表单仍应打开',
            );
            assert.equal(disk().goals[1].logs.length, 0, '空提交不应写入记录');
            await field('[name="delta"]', '250.5');
            await submit('#goal-progress-form');
            await until(() => !document.querySelector('#goal-progress-form'), '保存进度');
            await until(
                () =>
                    document
                        .querySelector('.goal-card .progress')
                        ?.getAttribute('aria-valuenow') === '25',
                '进度 25%',
            );
            assert.equal(disk().goals[1].logs.length, 1);

            await click('进度历史');
            await until(() => !!document.querySelector('.record-row.manual'), '进度历史');
            await click('编辑');
            await until(() => !document.querySelector('.record-row.manual'), '收起进度历史');
            await until(() => !!document.querySelector('#goal-progress-form'), '编辑进度表单');
            await field('[name="delta"]', '500');
            await submit('#goal-progress-form');
            await until(
                () =>
                    document
                        .querySelector('.goal-card .progress')
                        ?.getAttribute('aria-valuenow') === '50',
                '进度 50%',
            );

            await click('进度历史');
            await until(() => !!document.querySelector('.record-row.manual'), '再次打开进度历史');
            await click('删除');
            // 确认是独立的第二层弹窗，不是列表里的内联确认条。
            await until(
                () =>
                    [...document.querySelectorAll('.modal h2')].some(
                        (title) => title.textContent === '删除进度记录',
                    ),
                '删除记录确认',
            );
            assert.equal(
                await read(() => document.querySelectorAll('.modal').length),
                2,
                '确认弹窗叠在进度历史之上',
            );
            await click('确认删除');
            await until(() => !document.querySelector('.record-row.manual'), '删除记录完成');
            assert.equal(
                await read(() => document.querySelectorAll('.modal').length),
                1,
                '确认弹窗关闭后回到进度历史',
            );
            assert.equal(disk().goals[1].logs.length, 0);
            assert.equal(
                await read(() =>
                    document.querySelector('.goal-card .progress').getAttribute('aria-valuenow'),
                ),
                '0',
            );
            await click('关闭');
            await until(() => !document.querySelector('.modal'), '关闭进度历史');

            await read(() => document.querySelector('button[aria-label="编辑目标"]').click());
            await until(() => !!document.querySelector('#goal-form'), '编辑目标表单');
            await field('[name="target"]', '2000');
            await submit('#goal-form');
            await until(
                () => document.querySelector('.goal-title')?.textContent.includes('2000'),
                '标题随目标数值更新',
            );

            // ---- 完成 / 恢复 / 筛选 / 删除 ----
            await click('标记完成');
            await until(() => !document.querySelector('.goal-card'), '完成后离开进行中列表');
            // 全部完成时不能只说「没有符合筛选条件」——那时没有任何筛选条件可清。
            assert.equal(
                await read(() => document.querySelector('.empty h2')?.textContent),
                '进行中的目标都完成了',
                '全部完成时给出切换已完成的出口',
            );
            assert.ok(
                await read(() =>
                    [...document.querySelectorAll('.empty .btn')].some(
                        (btn) => btn.textContent.trim() === '查看已完成',
                    ),
                ),
                '全部完成时空状态应有「查看已完成」',
            );
            // 卡片离开当前筛选后，焦点不能掉回文档开头。
            assert.ok(
                await read(
                    () => document.activeElement?.textContent?.includes('新建目标') ?? false,
                ),
                '目标移出列表后焦点应退回新建按钮',
            );
            await chooseStatus('已完成');
            await until(
                () => document.querySelector('.goal-card')?.classList.contains('done'),
                '已完成筛选',
            );
            assert.equal(
                await read(() =>
                    document.querySelector('.goal-card .progress').getAttribute('aria-valuenow'),
                ),
                '100',
            );
            await click('恢复进行');
            // 已完成列表里还剩跟随档案的那个目标，恢复进行只移走手动目标本身。
            await until(
                () => document.querySelectorAll('.goal-card').length === 1,
                '恢复后离开已完成列表',
            );

            await chooseStatus('全部');
            await until(() => document.querySelectorAll('.goal-card').length === 2, '全部目标');
            await field('[aria-label="搜索目标、角色或备注"]', '不存在的目标');
            await until(
                () => !!document.querySelector('.empty h2')?.textContent.includes('筛选'),
                '搜索无结果',
            );
            await click('清除筛选');
            await until(() => document.querySelectorAll('.goal-card').length === 2, '清除筛选');

            // 键盘排序：焦点必须留在手柄上，否则连按方向键只能移动一次。
            const beforeOrder = await read(() =>
                [...document.querySelectorAll('.goal-card')].map((card) => card.dataset.goalId),
            );
            await read(() => {
                const handle = document.querySelector('.goal-card .drag-handle');
                handle.focus();
                handle.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
                );
            });
            await until(
                (first) =>
                    [...document.querySelectorAll('.goal-card')].map(
                        (card) => card.dataset.goalId,
                    )[0] !== first,
                '方向键移动目标',
                beforeOrder[0],
            );
            await new Promise((resolve) => setTimeout(resolve, 150));
            const focusAfterMove = await read(() => ({
                onHandle: document.activeElement?.classList.contains('drag-handle') ?? false,
                goalId: document.activeElement?.closest('.goal-card')?.dataset.goalId ?? '',
            }));
            assert.ok(focusAfterMove.onHandle, '方向键排序后焦点应留在拖动手柄上');
            assert.equal(focusAfterMove.goalId, beforeOrder[0], '焦点应跟着被移动的目标');

            await read(() => document.querySelectorAll('button[aria-label="删除目标"]')[0].click());
            await until(
                () => document.querySelector('.modal h2')?.textContent === '删除目标',
                '删除目标确认',
            );
            await click('确认删除');
            await until(() => document.querySelectorAll('.goal-card').length === 1, '删除目标完成');
            await read(() => document.querySelectorAll('button[aria-label="删除目标"]')[0].click());
            await until(() => !!document.querySelector('.modal'), '删除最后一个目标');
            await click('确认删除');
            await until(
                () =>
                    !document.querySelector('.goal-card') &&
                    !!document.querySelector('.empty h2')?.textContent.includes('小目标'),
                '目标清空',
            );
            assert.equal(disk().goals.length, 0);

            // ---- 账号页：快捷记账、双币种汇总、编辑、筛选与删除 ----
            await read(() => document.querySelector('a[href="#/accounts"]').click());
            await until(() => !!document.querySelector('.account-totals'), '账号页');
            assert.equal(
                await read(() => document.querySelector('.recent-footer b')?.textContent),
                '0',
                '账号页初始没有记录',
            );
            assert.ok(await read(() => !document.querySelector('.recent-row')), '最近记录为空');

            // 快捷入口把分类、方向、币种、渠道一起带过去。
            await read(() => document.querySelector('[data-shortcut="topup"]').click());
            await until(() => !!document.querySelector('#account-form'), '记账弹窗');
            await field('[name="amount"]', '100');
            await submit('#account-form');
            await until(() => !document.querySelector('#account-form'), '保存点卡充值');
            let tx = disk().transactions.find((item) => item.ledger === 'account');
            assert.equal(tx.category, '点卡充值');
            assert.equal(tx.kind, 'expense');
            assert.equal(tx.currency, 'rmb');
            assert.equal(tx.channel, '官方充值');
            assert.equal(tx.amount, 100);
            assert.equal(tx.recordType, 'money');

            // 游戏内买点卡：同一分类，但预设在梦幻币上。
            await read(() => document.querySelector('[data-shortcut="topup-cash"]').click());
            await until(() => !!document.querySelector('#account-form'), '购买点卡弹窗');
            assert.equal(
                await read(() =>
                    document.querySelector('[aria-label="记账币种"]').textContent.trim(),
                ),
                '梦幻币 · 万',
                '购买点卡应预设为梦幻币',
            );
            assert.equal(
                await read(() =>
                    document.querySelector('[aria-label="交易渠道"]').textContent.trim(),
                ),
                '游戏内',
                '购买点卡应预设为游戏内渠道',
            );
            assert.equal(
                await read(() =>
                    document.querySelector('[aria-label="收支分类"]').textContent.trim(),
                ),
                '点卡购买',
                '游戏内买点卡用独立分类，不与官方充值混在一起',
            );
            await click('取消');
            await until(() => !document.querySelector('#account-form'), '关闭购买点卡');

            // 收入扣手续费：200 - 10 = 190。
            await click('＋ 记一笔');
            await until(() => !!document.querySelector('#account-form'), '记一笔弹窗');
            // 金额留空不能落一条 ¥0.00：领域允许 0，拦截放在表单这一层。
            await submit('#account-form');
            await until(
                () => !!document.querySelector('#account-form .form-error'),
                '空金额被拦下',
            );
            assert.equal(
                await read(() =>
                    document.querySelector('#account-form .form-error').textContent.trim(),
                ),
                '请填写成交金额',
            );
            assert.equal(
                disk().transactions.filter((item) => item.ledger === 'account').length,
                1,
                '空金额不落盘',
            );
            // 两个点卡分类各自绑定币种与渠道：没走快捷入口、直接选分类也不会记错账。
            await choose('收支分类', '点卡购买');
            assert.equal(
                await read(() =>
                    document.querySelector('[aria-label="记账币种"]').textContent.trim(),
                ),
                '梦幻币 · 万',
                '点卡购买应带出梦幻币',
            );
            assert.equal(
                await read(() =>
                    document.querySelector('[aria-label="交易渠道"]').textContent.trim(),
                ),
                '游戏内',
                '点卡购买应带出游戏内渠道',
            );
            await choose('收支分类', '游戏币卖出');
            await choose('记账币种', '人民币 · 元');
            await choose('收支方向', '收入 / 卖出');
            await field('[name="amount"]', '200');
            await field('[name="fee"]', '10');
            await submit('#account-form');
            await until(() => !document.querySelector('#account-form'), '保存卖出记录');
            tx = disk().transactions.find((item) => item.category === '游戏币卖出');
            assert.equal(tx.kind, 'income');
            assert.equal(tx.fee, 10);
            assert.equal(
                await read(() =>
                    [...document.querySelectorAll('.account-totals .total-card')][0]
                        .querySelectorAll('.account-metrics b')[0]
                        .textContent.trim(),
                ),
                '¥ 190.00',
                '人民币收入应扣除手续费',
            );

            // 梦幻币走另一本账，不和人民币相加。
            await read(() => document.querySelector('[data-shortcut="progress"]').click());
            await until(() => !!document.querySelector('#account-form'), '养成投入弹窗');
            await field('[name="amount"]', '500');
            await submit('#account-form');
            await until(() => !document.querySelector('#account-form'), '保存养成投入');
            const cashExpense = await read(() =>
                [...document.querySelectorAll('.account-totals .total-card')][1]
                    .querySelectorAll('.account-metrics b')[1]
                    .textContent.trim(),
            );
            assert.ok(cashExpense.includes('500'), cashExpense);

            // 最近记录点开编辑，改金额后汇总跟着变。
            const recentId = await read(
                () => document.querySelector('.recent-row')?.dataset.record,
            );
            await read(() => document.querySelector('.recent-row').click());
            await until(() => !!document.querySelector('#account-form'), '编辑账号记录');
            await field('[name="amount"]', '600');
            await submit('#account-form');
            await until(() => !document.querySelector('#account-form'), '保存账号编辑');
            assert.equal(disk().transactions.find((item) => item.id === recentId).amount, 600);

            await click('查看记录');
            await until(() => !!document.querySelector('.record-head'), '全部记录');
            assert.equal(
                await read(() =>
                    document.querySelector('.record-filters .seg-btn.on')?.textContent.trim(),
                ),
                '本月',
                '记录弹窗继承页面的时间范围',
            );
            assert.equal(await read(() => document.querySelectorAll('.record-row').length), 3);
            await choose('收支方向筛选', '收入 / 卖出');
            await until(() => document.querySelectorAll('.record-row').length === 1, '只看收入');
            await click('删除');
            await until(
                () =>
                    [...document.querySelectorAll('.modal h2')].some(
                        (title) => title.textContent === '删除记录',
                    ),
                '删除确认弹窗',
            );
            assert.equal(
                await read(() => document.querySelectorAll('.modal').length),
                2,
                '确认弹窗叠在记录列表之上',
            );
            // 叠层时 Escape 只能关最上面那层，不能连记录列表一起关掉。
            await read(() =>
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
            );
            await until(
                () => document.querySelectorAll('.modal').length === 1,
                'Escape 只关确认弹窗',
            );
            assert.ok(
                await read(() => !!document.querySelector('.record-head')),
                'Escape 后记录列表仍在',
            );
            await click('删除');
            await until(() => document.querySelectorAll('.modal').length === 2, '再次打开确认弹窗');
            await click('确认删除');
            await until(() => !document.querySelector('.record-row'), '筛选结果已清空');
            assert.equal(disk().transactions.filter((item) => item.ledger === 'account').length, 2);
            await click('重置');
            await until(() => document.querySelectorAll('.record-row').length === 2, '重置筛选');
            await click('关闭');
            await until(() => !document.querySelector('.modal'), '关闭账号记录');

            // ---- 收益页：菜单已迁移、速记即收益、汇总、计时与补记 ----
            await read(() => document.querySelector('a[href="#/income"]').click());
            await until(() => !!document.querySelector('.stat-grid'), '收益页');
            assert.equal(
                await read(() => document.querySelector('.loot-footer b')?.textContent),
                '0',
                '本日还没有收益记录',
            );
            // 统计卡：在线时长、点卡消耗在前，物品估值与梦幻币净收益在后，不再有在仓/时薪。
            assert.equal(
                await read(() => document.querySelectorAll('.stat-grid .stat').length),
                4,
                '统计共四张卡',
            );
            assert.equal(
                await read(() =>
                    [...document.querySelectorAll('.stat-label')]
                        .map((element) => element.textContent.trim())
                        .join('|'),
                ),
                '在线时长|点卡消耗|物品估值|梦幻币净收益',
                '统计卡顺序',
            );
            // 收益页不再给「记一笔」：日常收益走物品速记，通用收支去账号页记。
            assert.equal(
                await read(() =>
                    [...document.querySelectorAll('button')].some(
                        (element) => element.textContent.trim() === '＋ 记一笔',
                    ),
                ),
                false,
                '收益页没有记一笔入口',
            );

            // ---- 金币速记：记成金额收入，其它物品只进库存估值 ----
            await read(() => document.querySelector('[data-item="99"]').click());
            await until(() => !!document.querySelector('#item-price-form'), '金币单价弹窗');
            await field('[name="price"]', '1200');
            await click('记录');
            await until(() => !document.querySelector('#item-price-form'), '金币入账');
            await until(
                () => document.querySelectorAll('.loot-row').length === 1,
                '金币出现在收益记录',
            );
            const coin = disk().transactions.find((item) => item.itemId === 99);
            assert.equal(coin.recordType, 'money');
            assert.equal(coin.kind, 'income');
            assert.equal(coin.currency, 'cash');
            assert.equal(coin.ledger, 'earnings');
            assert.equal(coin.amount, 1200);
            assert.equal(
                await read(() =>
                    document
                        .querySelectorAll('.stat-grid .stat')[3]
                        .querySelector('.stat-value')
                        .textContent.trim(),
                ),
                '1200 万',
                '金币计入净收益',
            );

            // ---- 固定价格速记：没设价先弹单价，保存后按单价入库并沿用 ----
            await read(() => document.querySelector('[data-item="1"]').click());
            await until(() => !!document.querySelector('#item-price-form'), '单价弹窗');
            await field('[name="price"]', '8.5');
            await click('保存并记录');
            await until(() => !document.querySelector('#item-price-form'), '单价保存');
            await until(() => document.querySelectorAll('.loot-row').length === 2, '物品入库');
            const quick = disk().transactions.find((item) => item.itemId === 1);
            assert.equal(quick.recordType, 'item');
            assert.equal(quick.itemName, '60武器');
            assert.equal(quick.quantity, 1);
            assert.equal(quick.unitPrice, 8.5);
            assert.equal(quick.status, 'held');
            assert.equal(disk().itemPrices['1'], 85000, '单价按游戏币原值存储');
            assert.equal(
                await read(() => document.querySelector('.loot-price').textContent.trim()),
                '8.50 万',
                '收益列表按单价显示物品价值',
            );
            assert.equal(
                await read(() =>
                    document
                        .querySelectorAll('.stat-grid .stat')[2]
                        .querySelector('.stat-value')
                        .textContent.trim(),
                ),
                '8.50 万',
                '物品估值卡合计标价',
            );

            // ---- 不固定价格：每次现填单价，且不写回单价表 ----
            assert.equal(
                await read(
                    () =>
                        document.querySelector('[data-item="100"]').querySelectorAll('.item-price')
                            .length,
                ),
                0,
                '不固定价格的卡片不再标注单价',
            );
            await read(() => document.querySelector('[data-item="100"]').click());
            await until(() => !!document.querySelector('#item-price-form'), '兽决单价弹窗');
            assert.ok(
                await read(() => !!document.querySelector('#item-price-form .stepper input')),
                '单价弹窗用步进器输入',
            );
            await field('[name="price"]', '35');
            assert.equal(
                await read(() =>
                    document.querySelector('.price-preview').textContent.replace(/\s+/g, ''),
                ),
                '估值35万',
                '弹窗内实时显示估值',
            );
            await click('记录');
            await until(() => !document.querySelector('#item-price-form'), '一次性单价保存');
            await until(() => document.querySelectorAll('.loot-row').length === 3, '第三条收益');
            assert.equal(disk().itemPrices['100'], undefined, '不固定价格不写回单价表');
            const variable = disk().transactions.find((item) => item.itemId === 100);
            assert.equal(variable.unitPrice, 35, '按本次填的单价估值');

            // ---- 在线计时：开始前先问这次几个号在线（不再固定用设置里的角色数） ----
            await click('▶ 开始游戏');
            await until(() => !!document.querySelector('#online-form'), '开始游戏弹窗');
            assert.equal(
                await read(() => document.querySelectorAll('.who-chip.on').length),
                disk().characters.length,
                '开始游戏默认全部角色在线',
            );
            await click('开始计时');
            await until(() => !!document.querySelector('.live'), '计时中');
            await new Promise((resolve) => setTimeout(resolve, 1100));
            await click('■ 全部结束');
            await until(() => !document.querySelector('.live'), '计时结束');
            assert.equal(disk().sessions.length, 1, '计时结束后落一条会话');
            assert.equal(
                disk().transactions.filter((item) => item.sessionId).length,
                1,
                '会话结算出点卡流水',
            );

            // ---- 实时同步：结束游戏不再弹结算窗，账号里那条「游戏收益」自己跟着走 ----
            assert.equal(
                await read(() => !!document.querySelector('[id^="settle-form"]')),
                false,
                '结束游戏不再弹结算窗',
            );
            // 速记一次就会同步一次，所以第一次速记（金币 1200）之后账号里已有记录。
            const settleRows = () =>
                disk().transactions.filter(
                    (item) => item.ledger === 'account' && item.category === '游戏收益',
                );
            await untilDisk(() => settleRows().length === 1, '账号里已同步一条游戏收益');
            const merged = settleRows();
            assert.equal(merged.length, 1, '同一天只留一条游戏收益');
            assert.equal(merged[0].source, 'settle');
            assert.equal(merged[0].currency, 'cash');
            assert.equal(merged[0].kind, 'income');
            assert.ok(
                Math.abs(merged[0].amount - 1243.5) < 0.05,
                '金额 = 速记金币 1200 + 物品 43.5 − 点卡，实际 ' + merged[0].amount,
            );

            // ---- 同一天再打一局：覆盖那条，不新增 ----
            const firstSettleId = merged[0].id;
            await click('▶ 开始游戏');
            await until(() => !!document.querySelector('#online-form'), '第二局开始弹窗');
            await click('开始计时');
            await until(() => !!document.querySelector('.live'), '第二局计时中');
            await new Promise((resolve) => setTimeout(resolve, 1100));
            await click('■ 全部结束');
            await until(() => !document.querySelector('.live'), '第二局计时结束');
            await untilDisk(() => settleRows().length === 1, '第二局同步完成');
            assert.equal(settleRows()[0].id, firstSettleId, '改的是原来那条，不是新增');
            assert.equal(disk().sessions.length, 2, '第二局落一条会话');

            // ---- 补在线时长：默认全选在线角色，角色数就是点卡的乘数 ----
            await click('补在线时长');
            await until(() => !!document.querySelector('#online-form'), '补记在线弹窗');
            assert.equal(
                await read(() => document.querySelectorAll('.who-chip.on').length),
                disk().characters.length,
                '在线角色默认全选',
            );
            await field('[name="hours"]', '1');
            await field('[name="minutes"]', '30');
            // 全部取消勾选时没有乘数可用，保存要被拦住。
            await read(() => document.querySelector('.who-chip').click());
            assert.equal(
                await read(() => document.querySelectorAll('.who-chip.on').length),
                0,
                '在线角色可以取消勾选',
            );
            await click('补记');
            await until(() => !!document.querySelector('.form-error'), '未选角色拦截');
            assert.equal(
                await read(() => document.querySelector('.form-error').textContent.trim()),
                '至少选一个在线角色',
            );
            await read(() => document.querySelector('.who-chip').click());
            await click('补记');
            await until(() => !document.querySelector('#online-form'), '补记保存');
            assert.equal(disk().sessions.length, 3, '补记后多一条会话');
            const backfill = disk().sessions.find((item) => item.mode === 'duration');
            assert.equal(backfill.minutes, 90, '按小时与分钟折算时长');
            assert.equal(backfill.source, 'manual');
            assert.equal(backfill.accounts, disk().characters.length, '按勾选的在线角色数结算');
            assert.equal(
                disk().transactions.filter((item) => item.sessionId === backfill.id).length,
                1,
                '补记也结算点卡流水',
            );
            // 补记的 90 分钟点卡（唯一角色 13.5）要立刻从账号那条收益里扣掉。
            await untilDisk(
                () => Math.abs(settleRows()[0].amount - 1230) < 0.05,
                '补记后账号金额扣掉点卡',
            );

            // ---- 收益记录弹窗：区间继承、物品与点卡行都能删 ----
            await click('查看全部');
            await until(() => !!document.querySelector('.record-head'), '收益记录弹窗');
            assert.equal(
                await read(() => document.querySelectorAll('.record-row').length),
                6,
                '三条速记 + 三段在线点卡',
            );
            assert.equal(
                await read(() =>
                    document.querySelector('.record-filters .seg-btn.on')?.textContent.trim(),
                ),
                '本日',
                '收益记录继承页面区间',
            );
            assert.equal(
                await read(
                    () => document.querySelectorAll('.record-filters [role="combobox"]').length,
                ),
                3,
                '筛选只剩收支、分类、角色',
            );
            // 物品行记错时也能删：只有删除，没有编辑（金额是算出来的）。
            assert.equal(
                await read(() => {
                    const row = [...document.querySelectorAll('.record-row')].find((element) =>
                        element.textContent.includes('60武器'),
                    );
                    return (
                        !!row?.querySelector('.btn.danger') &&
                        ![...row.querySelectorAll('.btn')].some(
                            (button) => button.textContent.trim() === '编辑',
                        )
                    );
                }),
                true,
                '物品行可以删但不可编辑',
            );
            // 点卡行同样有删除按钮，确认窗说明连带删除在线记录。
            assert.equal(
                await read(() =>
                    [...document.querySelectorAll('.record-row')]
                        .filter((row) => {
                            const state = row.querySelector('.cell-state').textContent;
                            return state.includes('计时') || state.includes('补记');
                        })
                        .every((row) => !!row.querySelector('.btn.danger')),
                ),
                true,
                '点卡行也有删除按钮',
            );
            // 先删速记的金币行：只在那一行里点删除。
            await read(() => {
                const row = [...document.querySelectorAll('.record-row')].find((element) =>
                    element.textContent.includes('金币'),
                );
                row.querySelector('.btn.danger').click();
            });
            await until(() => document.querySelectorAll('.modal').length === 2, '收益删除确认');
            await click('确认删除');
            await until(
                () => document.querySelectorAll('.record-row').length === 5,
                '收益记录减少',
            );
            assert.equal(
                disk().transactions.filter((item) => item.itemId === 99).length,
                0,
                '金币记录已删除',
            );
            // 删掉 1200 的金币之后，账号那条要跟着降到 43.5 − 13.5 = 30。
            await untilDisk(
                () =>
                    settleRows().length === 1 &&
                    settleRows()[0].kind === 'income' &&
                    Math.abs(settleRows()[0].amount - 30) < 0.05,
                '删金币后账号金额跟着降',
            );

            // 再删一段点卡：会话与它的流水一起消失，时长不会还在、成本却没了。
            const sessionsBefore = disk().sessions.length;
            await read(() => {
                const row = [...document.querySelectorAll('.record-row')].find((element) =>
                    element.querySelector('.cell-state').textContent.includes('补记'),
                );
                row.querySelector('.btn.danger').click();
            });
            await until(
                () =>
                    [...document.querySelectorAll('.modal h2')].some(
                        (heading) => heading.textContent.trim() === '删除点卡记录',
                    ),
                '点卡删除确认',
            );
            assert.ok(
                await read(() => {
                    const modal = [...document.querySelectorAll('.modal')].find(
                        (element) =>
                            element.querySelector('h2')?.textContent.trim() === '删除点卡记录',
                    );
                    return modal.textContent.includes('一并删除');
                }),
                '确认窗说明会连带删除在线记录',
            );
            await click('确认删除');
            await until(() => document.querySelectorAll('.record-row').length === 4, '点卡行减少');
            assert.equal(disk().sessions.length, sessionsBefore - 1, '会话随点卡一起删除');
            assert.equal(
                disk().transactions.filter((item) => item.sessionId === backfill.id).length,
                0,
                '该会话的点卡流水一并删除',
            );
            // 点卡没了，账号那条回到 43.5 的收入。
            await untilDisk(
                () =>
                    settleRows().length === 1 &&
                    settleRows()[0].kind === 'income' &&
                    Math.abs(settleRows()[0].amount - 43.5) < 0.05,
                '删点卡后账号金额回到物品估值',
            );

            // ---- 最后删一件物品：记错了就地去掉，账号金额跟着降 ----
            await read(() => {
                const row = [...document.querySelectorAll('.record-row')].find((element) =>
                    element.textContent.includes('60武器'),
                );
                row.querySelector('.btn.danger').click();
            });
            await until(
                () =>
                    [...document.querySelectorAll('.modal h2')].some(
                        (heading) => heading.textContent.trim() === '删除物品记录',
                    ),
                '物品删除确认',
            );
            assert.ok(
                await read(() => {
                    const modal = [...document.querySelectorAll('.modal')].find(
                        (element) =>
                            element.querySelector('h2')?.textContent.trim() === '删除物品记录',
                    );
                    return modal.textContent.includes('物品估值');
                }),
                '确认窗说明会影响物品估值',
            );
            await click('确认删除');
            await until(() => document.querySelectorAll('.record-row').length === 3, '物品行减少');
            assert.equal(
                disk().transactions.filter((item) => item.itemId === 1).length,
                0,
                '物品记录已删除',
            );
            await untilDisk(
                () => settleRows().length === 1 && Math.abs(settleRows()[0].amount - 35) < 0.05,
                '删物品后账号金额只剩兽决',
            );
            await click('关闭');
            await until(() => !document.querySelector('.modal'), '关闭收益记录');

            // ---- 错峰计时：单号能先退，已在线的不重复加入 ----
            await click('▶ 开始游戏');
            await until(() => !!document.querySelector('#online-form'), '错峰开始弹窗');
            await click('开始计时');
            await until(() => document.querySelectorAll('.live').length === 1, '单号计时中');
            await click('＋ 加入角色');
            await until(() => !!document.querySelector('#online-form'), '加入角色弹窗');
            assert.equal(
                await read(() => document.querySelectorAll('.who-chip.on-line').length),
                1,
                '已在计时的号显示为在线中',
            );
            assert.equal(
                await read(() => document.querySelectorAll('.who-chip.on').length),
                0,
                '没有可加入的号时默认一个都不勾',
            );
            await click('加入');
            await until(() => !!document.querySelector('.form-error'), '无可加入角色拦截');
            await click('取消');
            await until(() => !document.querySelector('#online-form'), '关闭加入弹窗');
            // 点号后面的 ✕ 就能单独退，不必等「全部结束」。
            await read(() => {
                document.querySelector('.live-stop').click();
                return true;
            });
            await until(() => !document.querySelector('.live'), '单号结束');
            await untilDisk(() => disk().activeSessions.length === 0, '单号结束落盘');

            // ---- 总览：三块聚合、14 天趋势、口径与明细页一致 ----
            await read(() => document.querySelector('a[href="#/overview"]').click());
            await until(
                () => document.querySelector('.board-title h2')?.textContent === '日常收益',
                '总览页',
            );
            // 五张卡：净收益领头，物品只取收益页口径（按速记标价），没有「持有估值」。
            assert.equal(
                await read(() =>
                    [...document.querySelectorAll('.stat-strip .stat-label')]
                        .map((element) => element.textContent.trim())
                        .join('|'),
                ),
                '净收益|游戏币收入|点卡消耗|物品估值|在线净时薪',
                '统计条顺序',
            );
            const overviewStat = (index) =>
                read((index) => {
                    const stat = document.querySelectorAll('.stat-strip .stat')[index];
                    return stat.querySelector('.stat-value').textContent.trim();
                }, index);
            // 前面删到只剩「兽决」一条速记，其余点卡与金币都清掉了。
            assert.equal(await overviewStat(3), '35 万', '物品估值沿用收益页口径');
            assert.equal(
                await read(() =>
                    [...document.querySelectorAll('.board-title h2')]
                        .map((h) => h.textContent.trim())
                        .join('|'),
                ),
                '日常收益|账号账本|进行中的目标',
                '三个区块',
            );
            assert.equal(
                await read(() =>
                    [...document.querySelectorAll('.account-panel h3')]
                        .map((h) => h.textContent.trim())
                        .join('|'),
                ),
                '人民币|梦幻币',
                '账号账本按币种分两块',
            );
            // 趋势固定 14 天：选「本日」也照样有时间轴。
            assert.equal(
                await read(() => document.querySelectorAll('.chart:not(.slim) .chart-col').length),
                14,
                '每日净收益 14 根柱子',
            );
            assert.equal(
                await read(() => document.querySelectorAll('.chart.slim').length),
                2,
                '两个币种各一条迷你趋势',
            );

            // ---- 从总览跳进明细页 ----
            await read(() => {
                const link = [...document.querySelectorAll('a')].find(
                    (element) => element.textContent.trim() === '进入收益',
                );
                link.click();
            });
            await until(() => !!document.querySelector('.stat-grid'), '从总览进入收益');
            await read(() => document.querySelector('a[href="#/overview"]').click());
            await until(
                () => document.querySelector('.board-title h2')?.textContent === '日常收益',
                '回到总览',
            );

            // ---- 装备：三套方案、换装、记变动、删除 ----
            await read(() => document.querySelector('a[href="#/equipment"]').click());
            await until(
                () => document.querySelector('.page-header h1')?.textContent === '装备',
                '装备页',
            );
            assert.equal(
                await read(() => document.querySelectorAll('.eq-slot').length),
                12,
                '常规 6 格 + 灵饰 4 格 + 玉魄 2 格',
            );
            assert.equal(await read(() => document.querySelectorAll('.eq-plan').length), 3);
            assert.equal(
                await read(() => document.querySelectorAll('.eq-slot.filled').length),
                0,
                '还没有档案，格子都是空位',
            );

            // 空位选装里也能直接截图识别：带着当前方案号进去，入库后默认穿到这一套。
            await read(() => document.querySelectorAll('.eq-slot')[2].click());
            // 档案还没有时选装弹窗里没有候选列表，等的是「空态」那句话。
            await until(
                () => !!document.querySelector('.eq-picker, .eq-picker-empty'),
                '空位选装弹窗',
            );
            // 顶栏也有一个同名的「截图识别」，这里要点弹窗里那颗。
            await read(() => {
                const modal = document.querySelector('.modal');
                [...modal.querySelectorAll('button')]
                    .find((button) => button.textContent.trim() === '截图识别')
                    .click();
            });
            await until(() => !!document.querySelector('.shot-drop'), '选装里的截图识别');
            assert.notEqual(
                await read(() =>
                    document.querySelector('.shot-plan .select-value')?.textContent.trim(),
                ),
                '只入库，不自动穿戴',
                '从空位进来时默认选中正在看的那一套',
            );
            await click('取消');
            await until(() => !document.querySelector('.shot-drop'), '截图识别已关闭');
            assert.equal(
                await read(() => !!document.querySelector('.eq-picker')),
                false,
                '截图弹窗关掉后不再叠着一个选装弹窗',
            );

            // 新增一件武器：只填档案，属性留空也是合法档案（属性编辑器另有一步验证）。
            await click('＋ 新增装备');
            await until(() => !!document.querySelector('#equipment-form'), '新增装备弹窗');
            await field('[name="name"]', '测试武器');
            await field('[name="level"]', '120');
            await click('登记装备');
            await until(() => !document.querySelector('#equipment-form'), '装备已登记');
            await untilDisk(() => disk().equipment.length === 1, '装备落盘');
            assert.equal(disk().equipment[0].slot, '武器');
            assert.equal(
                disk().equipment[0].characterId,
                disk().characters[0].id,
                '挂在当前角色上',
            );

            // 点空位选装：格子 → 选装弹窗 → 选中即穿到方案一。
            await read(() => document.querySelectorAll('.eq-slot')[2].click());
            await until(() => !!document.querySelector('.eq-picker'), '选装弹窗');
            await read(() => {
                const button = [...document.querySelectorAll('.eq-pick')].find((item) =>
                    item.textContent.includes('测试武器'),
                );
                button.click();
            });
            await until(() => !document.querySelector('.modal'), '选装完成');
            await untilDisk(
                () =>
                    disk().characters[0].equipmentSets[0].slots['武器'] === disk().equipment[0].id,
                '已穿到方案一',
            );

            // 切到第二套：方案只存引用，切换本身也要落盘。
            await read(() => document.querySelectorAll('.eq-plan')[1].click());
            await untilDisk(() => disk().characters[0].viewedEquipmentSet === 1, '切到方案二');
            await until(
                () => document.querySelectorAll('.eq-slot.filled').length === 0,
                '方案二还是空栏',
            );
            await read(() => document.querySelectorAll('.eq-plan')[0].click());
            await until(
                () => document.querySelectorAll('.eq-slot.filled').length === 1,
                '切回方案一',
            );

            // 记一次变动：默认同时记进账号账本，双向关联。
            await click('仓库');
            await until(() => !!document.querySelector('.eq-table'), '装备仓库');
            assert.ok(
                await read(() =>
                    document.querySelector('.modal h2')?.textContent.endsWith('装备仓库'),
                ),
                '仓库盖在页面上弹窗打开，不是同层标签',
            );
            await click('记变动');
            await until(() => !!document.querySelector('#gear-log-form'), '记变动弹窗');
            await field('[name="amount"]', '300');
            await click('记录变动');
            await until(() => !document.querySelector('#gear-log-form'), '变动已记录');
            await untilDisk(
                () =>
                    disk().transactions.some(
                        (tx) => tx.equipmentId === disk().equipment[0].id && tx.amount === 300,
                    ),
                '变动进了账号账本',
            );
            const gearTx = disk().transactions.find(
                (tx) => tx.equipmentId === disk().equipment[0].id,
            );
            assert.equal(gearTx.ledger, 'account', '装备买卖记在账号账本');
            assert.equal(gearTx.kind, 'expense', '购入是支出');
            assert.equal(disk().gearLogs.length, 1, '时间线有一条变动');

            // 删除档案：流水保留、只解除关联。
            // 仓库是盖在页面上的弹窗，详情与删除确认会再叠一层，所以 `.modal` 不止一个，
            // 取最后一个才是当前最上面那层。
            await click('删除');
            await until(
                () =>
                    [...document.querySelectorAll('.modal')].some((modal) =>
                        modal.textContent.includes('删除装备档案'),
                    ),
                '删除确认',
            );
            await read(() =>
                [...document.querySelectorAll('.modal')]
                    .at(-1)
                    .querySelector('.btn.danger')
                    .click(),
            );
            await untilDisk(() => disk().equipment.length === 0, '档案已删除');
            await until(
                () =>
                    ![...document.querySelectorAll('.modal')].some((modal) =>
                        modal.textContent.includes('删除装备档案'),
                    ),
                '删除确认收起',
            );
            assert.equal(disk().gearLogs.length, 0, '变动记录一并删除');
            const keptTx = disk().transactions.find((tx) => tx.amount === 300);
            assert.ok(keptTx, '账本流水保留');
            assert.equal(keptTx.equipmentId, undefined, '只解除关联');

            // ---- 属性编辑器：词条、宝石、特效都写进结构化属性 ----
            await click('＋ 新增装备');
            await until(() => !!document.querySelector('#equipment-form'), '新增装备弹窗');
            await field('[name="name"]', '测试剑');
            await field('[name="level"]', '130');
            await field('[name="eq-base-damage"]', '480');
            await field('[name="eq-base-hit"]', '530');
            await field('[name="eq-forge"]', '8');
            // 附加属性：先加一行，再选属性、填数值。
            await read(() => document.querySelector('.modal .group-head .add').click());
            await choose('附加属性', '力量');
            await field('.modal .row input[type="number"]', '32');
            // 特效与宝石：勾选框直接点 input，标签结构变了也不会让用例失效。
            await read(() => {
                const check = [...document.querySelectorAll('.modal .checks .check')].find(
                    (element) => element.textContent.trim() === '永不磨损',
                );
                check.querySelector('input').click();
            });
            await read(() => {
                const gem = [...document.querySelectorAll('.modal .gem')].find((element) =>
                    element.textContent.includes('太阳石'),
                );
                gem.querySelector('input[type="checkbox"]').click();
            });
            await read(() => {
                const gem = [...document.querySelectorAll('.modal .gem')].find((element) =>
                    element.textContent.includes('太阳石'),
                );
                const input = gem.querySelector('input[type="number"]');
                input.value = '8';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await click('登记装备');
            await until(() => !document.querySelector('#equipment-form'), '属性已保存');
            await untilDisk(
                () =>
                    disk().equipment.some((eq) => eq.name === '测试剑' && eq.details?.forge === 8),
                '结构化属性落盘',
            );
            const crafted = disk().equipment.find((eq) => eq.name === '测试剑');
            assert.equal(crafted.details.base.length, 2, '主要属性两条');
            assert.equal(crafted.details.base[0].key, 'damage');
            assert.equal(crafted.details.extra[0].key, 'strength');
            assert.equal(crafted.details.extra[0].value, 32);
            assert.deepEqual(crafted.details.effects, ['永不磨损']);
            assert.equal(crafted.details.gems[0].type, '太阳石', '宝石勾选写入');
            assert.equal(crafted.details.gems[0].level, 8);
            assert.equal(crafted.attributes, '伤害 +480\n命中 +530\n力量 +32', '快照文本同步');

            // ---- 方案改名：三条一起校验，改完随档案读回 ----
            // 仓库这时还开着（新增是从页面顶部进去的，弹窗留在下面），先收起它回到搭配。
            await read(() => {
                const modal = [...document.querySelectorAll('.modal')].at(-1);
                [...modal.querySelectorAll('.btn')]
                    .find((button) => button.textContent.trim() === '关闭')
                    .click();
            });
            await until(() => !document.querySelector('.eq-table'), '收起仓库');
            await until(() => document.querySelectorAll('.eq-plan').length === 3, '回到搭配');
            await click('改名');
            await until(() => !!document.querySelector('#plan-form'), '改名弹窗');
            await field('[name="set-0"]', '日常');
            await field('[name="set-1"]', '比武');
            await field('[name="set-2"]', '任务');
            await click('保存名称');
            await until(() => !document.querySelector('#plan-form'), '改名保存');
            await untilDisk(
                () => disk().characters[0].equipmentSets[2].name === '任务',
                '方案名落盘',
            );
            assert.equal(
                await read(
                    () =>
                        document.querySelectorAll('.eq-plan')[1].querySelector('span').textContent,
                ),
                '比武',
                '标签跟着变',
            );

            // 先穿一件：复制断言要有可比的内容，空方案复制空方案说明不了问题。
            await read(() => document.querySelectorAll('.eq-slot')[2].click());
            await until(() => !!document.querySelector('.eq-picker'), '选装弹窗');
            await read(() => {
                const button = [...document.querySelectorAll('.eq-pick')].find((item) =>
                    item.textContent.includes('测试剑'),
                );
                button.click();
            });
            await until(() => !document.querySelector('.modal'), '穿上测试剑');
            await untilDisk(
                () => !!disk().characters[0].equipmentSets[0].slots['武器'],
                '方案一穿上测试剑',
            );

            // ---- 复制方案：把正在查看的这套覆盖到另一套 ----
            await click('复制方案');
            await until(() => !!document.querySelector('#plan-form'), '复制弹窗');
            await click('覆盖目标方案');
            await until(() => !document.querySelector('#plan-form'), '复制完成');
            await untilDisk(
                () => !!disk().characters[0].equipmentSets[1].slots['武器'],
                '方案二拿到武器引用',
            );
            assert.equal(
                disk().characters[0].equipmentSets[1].slots['武器'],
                disk().characters[0].equipmentSets[0].slots['武器'],
                '复制的是引用，不是新档案',
            );
            assert.equal(disk().equipment.length, 1, '复制不新增档案');

            // ---- 粘贴导入：两件文本，一件按名称认出部位，一件按后缀 ----
            await click('粘贴导入');
            await until(() => !!document.querySelector('[name="paste"]'), '导入弹窗');
            await field(
                '[name="paste"]',
                '名称：霜寒剑\n装备等级：130\n伤害 +500\n命中 +540\n\n名称：流云履\n装备等级：120\n防御 +86\n敏捷 +35',
            );
            await click('解析文本');
            await until(() => document.querySelectorAll('.modal .item').length === 2, '解析出两件');
            assert.equal(
                await read(() => document.querySelectorAll('.modal .item.bad').length),
                0,
                '两件都识别出部位，没有待补齐项',
            );
            await read(() => {
                const button = [...document.querySelectorAll('.modal button')].find((element) =>
                    element.textContent.trim().startsWith('入库'),
                );
                button.click();
            });
            await until(() => !document.querySelector('[name="paste"]'), '导入完成');
            await untilDisk(() => disk().equipment.length === 3, '两件都落盘');
            const imported = disk().equipment.find((eq) => eq.name === '霜寒剑');
            assert.equal(imported.slot, '武器');
            assert.equal(imported.level, 130);
            assert.equal(imported.details.base.length, 2, '属性文本解析成结构化属性');
            assert.equal(imported.details.base[0].value, 500);
            assert.equal(
                disk().equipment.find((eq) => eq.name === '流云履').slot,
                '鞋子',
                '名称后缀认出部位',
            );
            assert.ok(imported.ocrText.includes('霜寒剑'), '原文留在档案里可回查');
            assert.equal(
                await read(() => document.querySelectorAll('.eq-row').length),
                4,
                '导入后自动打开仓库，包含表头与三件档案',
            );

            // ---- 截图识别：真实截图跑通「图片 → 本地 OCR → 同一套解析 → 落盘」 ----
            await click('截图识别');
            await until(() => !!document.querySelector('.shot-drop'), '截图录入弹窗');
            const shotBytes = fs
                .readFileSync(path.join(__dirname, 'fixtures', 'equipment-jade.png'))
                .toString('base64');
            // 文件读不了、真实拖拽又难模拟，直接把字节塞进 file input，走与选择图片相同的路径。
            await read((bytes) => {
                // 仓库弹窗还开着，按类名精确找截图弹窗里的「选择图片」输入框。
                const input = document.querySelector('.shot-add input[type="file"]');
                if (!input) throw new Error('截图弹窗里没有文件输入框');
                const binary = atob(bytes);
                const pixels = new Uint8Array(binary.length);
                for (let index = 0; index < binary.length; index++)
                    pixels[index] = binary.charCodeAt(index);
                const transfer = new DataTransfer();
                transfer.items.add(new File([pixels], 'shot.png', { type: 'image/png' }));
                input.files = transfer.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }, shotBytes);
            // 识别完成时缩略图上的进度角标消失；「待补充」是另一种角标，不会被这里误判成完成。
            await untilSlow(
                () =>
                    !!document.querySelector('.shot-thumb') &&
                    !document.querySelector('.shot-thumb .shot-badge'),
                '本地 OCR 识别完成',
                60,
            );
            assert.equal(
                await read(() => document.querySelector('.shot-meta input')?.value),
                '上古玉魄·阳',
                '识别出玉魄名称',
            );
            await click('入库 1 件');
            await untilDisk(() => disk().equipment.length === 4, '识别结果落盘');
            const shotJade = disk().equipment.find((eq) => eq.slot === '玉魄·阳');
            assert.ok(shotJade, '按名称认出这是玉魄·阳');
            assert.equal(shotJade.name, '上古玉魄·阳');
            assert.equal(shotJade.details.jade.dust, 2, '识别出灵尘等级');
            assert.equal(shotJade.details.jade.assault, '奇袭法术', '识别出奇袭类型');
            assert.equal(shotJade.details.jade.chance, 0.5, '识别出奇袭概率');
            assert.equal(shotJade.details.jade.holes, 1, '「奇袭特技：[空]」算出一个开光孔');
            assert.equal(shotJade.details.base[0].value, 10, '基础属性进 base');
            assert.deepEqual(
                shotJade.details.extra.map((row) => row.value),
                [5, 4],
                '两条附加属性按顺序进 extra',
            );
            assert.deepEqual(
                shotJade.details.extra.map((row) => row.boost),
                [12, 9],
                '方括号里的灵尘加成存成 boost',
            );
            assert.ok(shotJade.ocrText.includes('灵尘等级'), '识别原文留在档案里可回查');

            // ---- 列表只摆装备本身的属性：灵尘、开光这类配置留给详情 ----
            const warehouseRow = await read(() => {
                const row = [...document.querySelectorAll('.eq-row')].find((element) =>
                    element.textContent.includes('上古玉魄·阳'),
                );
                return row
                    ? [...row.querySelectorAll('.eq-prop')].map((line) => line.textContent.trim())
                    : [];
            });
            assert.ok(
                warehouseRow.some((line) => line.includes('物理暴击等级')),
                '基础属性在列表里',
            );
            // 2026-10-29 起列表不再折叠：灵尘、开光、奇袭这些配置项也摆出来。
            assert.ok(
                warehouseRow.some((line) => /灵尘/.test(line)),
                '列表里能看到灵尘等级',
            );
            assert.ok(
                warehouseRow.some((line) => /开光/.test(line)),
                '列表里能看到开光孔',
            );
            assert.ok(
                !warehouseRow.some((line) => /五行|制造者|耐久|修理失败/.test(line)),
                '五行、制造者、耐久、修理失败不进列表',
            );
            assert.ok(
                !warehouseRow.some((line) => /还有 \d+ 条/.test(line)),
                '属性不再折叠成「还有 N 条」',
            );
            await read(() => {
                [...document.querySelectorAll('.eq-row')]
                    .find((element) => element.textContent.includes('上古玉魄·阳'))
                    .querySelector('.eq-name-button')
                    .click();
            });
            await until(() => !!document.querySelector('.detail-grid'), '玉魄详情');
            // 只看属性区：详情里的「识别原文」也含「灵尘等级」，拿整个弹窗断言会假阳性。
            // 仓库弹窗里每行也有 `.eq-props`，所以限定在详情的属性区里取。
            const detailText = await read(
                () => document.querySelector('.detail-grid .eq-props')?.textContent || '',
            );
            assert.ok(/灵尘/.test(detailText), '详情里能看到灵尘等级');
            assert.ok(/开光/.test(detailText), '详情里能看到开光孔');
            assert.ok(/奇袭/.test(detailText), '详情里能看到奇袭法术');
            // 关掉详情，再关掉仓库——后面回到页面上的其它弹窗，层不能留着。
            const closeTop = () =>
                read(() => {
                    const modal = [...document.querySelectorAll('.modal')].at(-1);
                    [...modal.querySelectorAll('.btn')]
                        .find((button) => button.textContent.trim() === '关闭')
                        .click();
                });
            await closeTop();
            await until(() => !document.querySelector('.detail-grid'), '详情已关闭');
            await closeTop();
            await until(() => !document.querySelector('.modal'), '仓库已收起');

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
