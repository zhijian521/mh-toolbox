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
}, 60000);
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
            await until(() => !!document.querySelector('.delete-confirm'), '删除记录确认');
            await click('确认删除');
            await until(() => !document.querySelector('.record-row.manual'), '删除记录完成');
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
            await click('取消');
            await until(() => !document.querySelector('#account-form'), '关闭购买点卡');

            // 收入扣手续费：200 - 10 = 190。
            await click('＋ 记一笔');
            await until(() => !!document.querySelector('#account-form'), '记一笔弹窗');
            await choose('收支分类', '游戏币卖出');
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

            await click('查看全部记录');
            await until(() => !!document.querySelector('.record-head'), '全部记录');
            assert.equal(await read(() => document.querySelectorAll('.record-row').length), 3);
            await choose('收支方向筛选', '收入 / 卖出');
            await until(() => document.querySelectorAll('.record-row').length === 1, '只看收入');
            await click('删除');
            await until(() => !!document.querySelector('.delete-confirm'), '删除确认条');
            await click('确认删除');
            await until(() => !document.querySelector('.record-row'), '筛选结果已清空');
            assert.equal(disk().transactions.filter((item) => item.ledger === 'account').length, 2);
            await click('重置');
            await until(() => document.querySelectorAll('.record-row').length === 2, '重置筛选');
            await click('关闭');
            await until(() => !document.querySelector('.modal'), '关闭账号记录');

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
                'PASS Electron: isolation, character CRUD, drafts, rollback, school change, history, ordering, restart, goals, accounts, import/export/wipe',
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
