/**
 * 角色页：新建、草稿放弃、保存失败重试、转门派、排序、重启与删除。
 *
 * 端到端是一条链：这一段结束时留下「一个角色、普陀山、攻击修炼 18」，后面的目标、
 * 账号、收益、总览都建立在它上面，所以各段必须按顺序跑，不能单独执行。
 */
module.exports = async function characters(env) {
    const { read, until, click, field, submit, openSelect, choose, disk, assert, state } = env;

    const fs = require('node:fs');
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
    assert.equal(await read(() => document.querySelector('[name="name"]').value), '未保存昵称');
    await click('取消');
    await until(() => !!document.querySelector('.discard-panel'), '再次确认');
    await click('放弃修改');
    await until(() => !document.querySelector('.modal'), '放弃草稿');
    assert.equal(disk().characters[0].name, '轻舟');

    await read(() => document.querySelector('button[aria-label^="修改攻击修炼"]').click());
    await until(() => !!document.querySelector('#quick-form'), '快捷编辑');
    await field('[name="value"]', '18');
    fs.mkdirSync(state.file + '.tmp');
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
    fs.rmdirSync(state.file + '.tmp');
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
            .dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfer, bubbles: true }));
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
        (name) => document.querySelector('.skill-row input:not([type="number"])').value === name,
        '技能拖动',
        order[1],
    );
    assert.deepEqual(await skillNames(), [order[1], order[2], order[0], ...order.slice(3)]);
    await read(() =>
        document
            .querySelector('.skill-row .drag-handle')
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    await until(
        (name) => document.querySelector('.skill-row input:not([type="number"])').value === name,
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
    assert.equal(await read(() => document.activeElement?.getAttribute('placeholder')), '技能名称');
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
            document.querySelector('.section-nav [aria-current="location"]')?.textContent.trim() ===
            '其他养成',
        '滚动到底部高亮其他养成',
    );
    await read(() => {
        document.querySelector('.modal-body').scrollTop = 0;
    });
    await until(
        () =>
            document.querySelector('.section-nav [aria-current="location"]')?.textContent.trim() ===
            '基础信息',
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
        (await read(() => document.querySelector('.modal').textContent)).includes('攻击修炼'),
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
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
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
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    await until(
        () => document.querySelector('.character-card h2')?.textContent === '轻舟',
        '恢复排序',
    );

    state.window.webContents.reload();
    await until(() => document.querySelectorAll('.character-card').length === 2, '重启恢复');
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
};
