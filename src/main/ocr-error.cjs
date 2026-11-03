'use strict';

/**
 * 把识别子进程报上来的原始错误，翻译成用户能照做的一句话。
 *
 * 起因（2026-11-03）：朋友的机器上「应用能开、其它功能正常，一识别图片就失败」，
 * 因为 `onnxruntime_binding.node` 依赖 VCRUNTIME140 / MSVCP140，而干净 Windows 只自带
 * UCRT。界面当时只会说「识别未完成，请重试或裁剪到装备属性区域」——一句既不对症、
 * 又把人往「是不是我图截得不好」上带的话。
 *
 * 原始错误仍然进日志（`装备识别子进程报告失败：…`），这里只决定给用户看什么。
 */

/** 原生库加载不起来：缺 VC++ 运行库，或 dll 被安全软件隔离。 */
const NATIVE_LOAD =
    /specified module could not be found|找不到指定的模块|ERR_DLOPEN_FAILED|LoadLibrary|不是有效的 Win32 应用程序|is not a valid Win32 application/i;

/** 模块解析失败：包不完整（0.3.3 之前的 asarUnpack 问题就是这条）。 */
const MISSING_PACKAGE = /Cannot find package|Cannot find module|MODULE_NOT_FOUND/i;

/** 兜底：既不是缺运行库也不是缺包，多半是图太糊或没截到字。 */
const GENERIC = '识别未完成，请重试或裁剪到装备属性区域';

/**
 * @param {unknown} raw 子进程或主进程报上来的原始错误
 * @returns {string} 给用户看的一句话（原始错误另见日志）
 */
function explainOcrError(raw) {
    const text = String(raw || '');
    if (NATIVE_LOAD.test(text))
        return '识别组件缺少运行库，请安装「Microsoft Visual C++ 2015-2022 运行库（x64）」后重试';
    if (MISSING_PACKAGE.test(text)) return '识别组件不完整，请重新安装本程序';
    return GENERIC;
}

module.exports = { explainOcrError, GENERIC };
