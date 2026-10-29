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
