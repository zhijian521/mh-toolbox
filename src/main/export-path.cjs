const path = require('node:path');
function assertExportPath(file, appData, liveFile) {
    const target = path.resolve(file).toLowerCase();
    if (target === path.resolve(liveFile).toLowerCase())
        throw new Error('不能覆盖正在使用的数据文件');
    for (const profile of ['梦幻养老助手', 'mh-tool']) {
        const legacy = path.resolve(appData, profile).toLowerCase();
        if (target === legacy || target.startsWith(legacy + path.sep))
            throw new Error('请选择当前版本数据目录以外的位置导出备份');
    }
}
module.exports = { assertExportPath };
