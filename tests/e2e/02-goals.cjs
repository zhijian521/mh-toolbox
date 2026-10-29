/**
 * 目标页：跟随档案、批量更新、达成、手动累计与删除。
 */
module.exports = async function goals(env) {
    const { read, until, click, field, submit, choose, chooseStatus, disk, assert } = env;
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
        await read(() => document.querySelector('.record-row').textContent.includes('强身术')),
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
            document.querySelector('.goal-card .progress')?.getAttribute('aria-valuenow') === '25',
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
            document.querySelector('.goal-card .progress')?.getAttribute('aria-valuenow') === '50',
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
        await read(() => document.activeElement?.textContent?.includes('新建目标') ?? false),
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
    await until(() => document.querySelectorAll('.goal-card').length === 1, '恢复后离开已完成列表');

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
        handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await until(
        (first) =>
            [...document.querySelectorAll('.goal-card')].map((card) => card.dataset.goalId)[0] !==
            first,
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
};
