'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * 把 VC++ 运行库复制到 `onnxruntime_binding.node` 同目录。
 *
 * 为什么不用 `extraFiles` / `extraResources`：Windows 解析 DLL 依赖时先看**加载它的那个
 * 模块所在目录**，安装目录根部那份不会被用上（把同目录的 vcruntime140.dll 换成垃圾文件，
 * 加载立刻报 `not a valid Win32 application`；换成根目录则照常工作——2026-11-03 实测）。
 *
 * 为什么用 afterPack 而不是写死 `bin/napi-v6/win32/x64` 的 extraResources：
 * 那个目录名带 ABI 版本（napi-v3 / v6 …），onnxruntime-node 一升级路径就变，而 extraResources
 * 会静默把文件拷到不存在的目录里。这里改成扫 `bin/napi-<abi>/win32/x64`，找不到就**抛错中断打包**，
 * 不留一个「打包成功但识别才崩」的包。
 *
 * 运行库来源与许可见 `build/vcrt/README.md`。
 */
module.exports = async function afterPack(context) {
    const binRoot = path.join(
        context.appOutDir,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'onnxruntime-node',
        'bin',
    );
    if (!fs.existsSync(binRoot))
        throw new Error('打包后找不到 onnxruntime 的 bin 目录：' + binRoot);

    const targets = fs
        .readdirSync(binRoot)
        .filter((name) => /^napi-/.test(name))
        .map((name) => path.join(binRoot, name, 'win32', 'x64'))
        .filter((dir) => fs.existsSync(dir));
    if (!targets.length) throw new Error('bin 下没有 win32/x64 目录，推理库可能被打包规则排掉了');

    const source = path.join(__dirname, '..', 'build', 'vcrt');
    const files = fs.readdirSync(source).filter((name) => name.toLowerCase().endsWith('.dll'));
    if (files.length < 4)
        throw new Error('build/vcrt 里的运行库不全，期望 4 个，实际：' + files.join(', '));

    for (const dir of targets) {
        for (const file of files) fs.copyFileSync(path.join(source, file), path.join(dir, file));
    }
    console.log(
        `  • 已放入 ${files.length} 个 VC++ 运行库 → ${targets
            .map((dir) => path.relative(context.appOutDir, dir))
            .join(' , ')}`,
    );
};
