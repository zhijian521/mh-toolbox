/**
 * 总览：三块聚合、14 天趋势，以及口径与明细页一致。
 */
module.exports = async function overview(env) {
    const { read, until, assert } = env;
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
};
