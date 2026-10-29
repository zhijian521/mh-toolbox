/**
 * 设置页：拒绝未来版本、导入备份、导出、清空，以及旧版本目录不被碰。
 */
module.exports = async function backup(env) {
    const {
        read,
        until,
        click,
        disk,
        assert,
        state,
        importFile,
        exportFile,
        legacyFile,
        legacyBytes,
    } = env;

    const fs = require('node:fs');
    const path = require('node:path');

    await read(() => document.querySelector('a[href="#/settings"]').click());
    await until(() => !!document.querySelector('.settings-page'), '设置页面');
    /*
     * 使用帮助顶部的「打开教程」：左目录点哪一节，正文要真的滚到那一节。
     * 目录与正文是两份数据拼出来的（`manualSections` 一处生成），
     * 写漏一节不会报错，只会让目录里多一颗点了没反应的按钮。
     */
    await click('打开教程');
    await until(() => !!document.querySelector('.guide-body'), '使用教程弹窗');
    const guide = await read(() => {
        const tabs = [...document.querySelectorAll('.guide-tab')];
        const body = document.querySelector('.guide-body');
        return {
            tabs: tabs.length,
            sections: document.querySelectorAll('.guide-section').length,
            scrollable: body.scrollHeight > body.clientHeight + 4,
            first: tabs[0] && tabs[0].textContent.trim(),
            last: tabs[tabs.length - 1] && tabs[tabs.length - 1].textContent.trim(),
        };
    });
    assert.ok(guide.tabs >= 10, '教程至少十节');
    assert.equal(guide.tabs, guide.sections, '目录与正文章节数一致');
    assert.equal(guide.first, '快速开始', '首节是快速开始');
    assert.equal(guide.last, '常见问题', '末节是常见问题');
    assert.ok(guide.scrollable, '正文能滚');
    await read(() => document.querySelectorAll('.guide-tab')[5].click());
    // 平滑滚动要等落位，直接断言 offset 会读到半途的值。
    await until(() => {
        const body = document.querySelector('.guide-body');
        const active = document.querySelector('.guide-tab.on');
        if (!active) return false;
        const section = [...document.querySelectorAll('.guide-section')].find(
            (el) => el.querySelector('h3').textContent.trim() === active.textContent.trim(),
        );
        if (!section) return false;
        const offset = section.getBoundingClientRect().top - body.getBoundingClientRect().top;
        return offset >= -2 && offset < 40;
    }, '目录跳章把正文滚到该节开头');
    await click('知道了');
    await until(() => !document.querySelector('.guide-body'), '教程已关闭');
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
    await until(() => document.querySelector('.toast')?.textContent.includes('已导出'), '备份导出');
    assert.deepEqual(JSON.parse(fs.readFileSync(exportFile, 'utf8')), disk());
    await click('清空 V2 数据');
    await until(() => !!document.querySelector('.modal'), '清空确认');
    await click('确认清空');
    await until(() => !document.querySelector('.modal'), '清空完成');
    assert.equal(disk().characters.length, 0);
    assert.ok(
        fs.readdirSync(path.dirname(state.file)).filter((name) => name.endsWith('.bak')).length >=
            2,
    );
    assert.equal(fs.readFileSync(legacyFile, 'utf8'), legacyBytes);
};
