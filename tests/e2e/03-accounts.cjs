/**
 * 账号页：快捷记账、双币种汇总、编辑、筛选与删除，以及「游戏收益」的只读展示。
 */
module.exports = async function accounts(env) {
    const { read, until, click, field, submit, choose, disk, assert } = env;
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
        await read(() => document.querySelector('[aria-label="记账币种"]').textContent.trim()),
        '梦幻币 · 万',
        '购买点卡应预设为梦幻币',
    );
    assert.equal(
        await read(() => document.querySelector('[aria-label="交易渠道"]').textContent.trim()),
        '游戏内',
        '购买点卡应预设为游戏内渠道',
    );
    assert.equal(
        await read(() => document.querySelector('[aria-label="收支分类"]').textContent.trim()),
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
    await until(() => !!document.querySelector('#account-form .form-error'), '空金额被拦下');
    assert.equal(
        await read(() => document.querySelector('#account-form .form-error').textContent.trim()),
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
        await read(() => document.querySelector('[aria-label="记账币种"]').textContent.trim()),
        '梦幻币 · 万',
        '点卡购买应带出梦幻币',
    );
    assert.equal(
        await read(() => document.querySelector('[aria-label="交易渠道"]').textContent.trim()),
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
    const recentId = await read(() => document.querySelector('.recent-row')?.dataset.record);
    await read(() => document.querySelector('.recent-row').click());
    await until(() => !!document.querySelector('#account-form'), '编辑账号记录');
    await field('[name="amount"]', '600');
    await submit('#account-form');
    await until(() => !document.querySelector('#account-form'), '保存账号编辑');
    assert.equal(disk().transactions.find((item) => item.id === recentId).amount, 600);

    await click('查看记录');
    await until(() => !!document.querySelector('.record-head'), '全部记录');
    assert.equal(
        await read(() => document.querySelector('.record-filters .seg-btn.on')?.textContent.trim()),
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
    await read(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    await until(() => document.querySelectorAll('.modal').length === 1, 'Escape 只关确认弹窗');
    assert.ok(await read(() => !!document.querySelector('.record-head')), 'Escape 后记录列表仍在');
    await click('删除');
    await until(() => document.querySelectorAll('.modal').length === 2, '再次打开确认弹窗');
    await click('确认删除');
    await until(() => !document.querySelector('.record-row'), '筛选结果已清空');
    assert.equal(disk().transactions.filter((item) => item.ledger === 'account').length, 2);
    await click('重置');
    await until(() => document.querySelectorAll('.record-row').length === 2, '重置筛选');
    await click('关闭');
    await until(() => !document.querySelector('.modal'), '关闭账号记录');
};
