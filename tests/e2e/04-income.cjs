/**
 * 收益页：物品速记、单价表、在线计时（含错峰与补记）、账号收益实时同步。
 */
module.exports = async function income(env) {
    const { read, until, click, field, disk, untilDisk, assert } = env;
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
    await until(() => document.querySelectorAll('.loot-row').length === 1, '金币出现在收益记录');
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
                document.querySelector('[data-item="100"]').querySelectorAll('.item-price').length,
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
        await read(() => document.querySelector('.price-preview').textContent.replace(/\s+/g, '')),
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
    await untilDisk(() => Math.abs(settleRows()[0].amount - 1230) < 0.05, '补记后账号金额扣掉点卡');

    // ---- 收益记录弹窗：区间继承、物品与点卡行都能删 ----
    await click('查看全部');
    await until(() => !!document.querySelector('.record-head'), '收益记录弹窗');
    assert.equal(
        await read(() => document.querySelectorAll('.record-row').length),
        6,
        '三条速记 + 三段在线点卡',
    );
    assert.equal(
        await read(() => document.querySelector('.record-filters .seg-btn.on')?.textContent.trim()),
        '本日',
        '收益记录继承页面区间',
    );
    assert.equal(
        await read(() => document.querySelectorAll('.record-filters [role="combobox"]').length),
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
    await until(() => document.querySelectorAll('.record-row').length === 5, '收益记录减少');
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
                (element) => element.querySelector('h2')?.textContent.trim() === '删除点卡记录',
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
                (element) => element.querySelector('h2')?.textContent.trim() === '删除物品记录',
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
};
