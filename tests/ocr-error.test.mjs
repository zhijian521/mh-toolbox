import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/**
 * 识别失败时的用户提示。
 *
 * 这里锁的是「别再把缺运行库说成裁剪问题」：那类错误以前统一显示成
 * 「识别未完成，请重试或裁剪到装备属性区域」，排查时被它带偏过一次。
 */
const require = createRequire(import.meta.url);
const { explainOcrError, GENERIC } = require('../src/main/ocr-error.cjs');

test('缺 VC++ 运行库的两种语言报错都指向装运行库', () => {
    const english =
        'The specified module could not be found. \\\\?\\C:\\app\\resources\\app.asar.unpacked\\node_modules\\onnxruntime-node\\bin\\napi-v6\\win32\\x64\\onnxruntime_binding.node';
    const chinese =
        '找不到指定的模块。\nRequire stack:\n- C:\\app\\resources\\app.asar\\src\\main\\equipment-ocr-worker.cjs';
    for (const raw of [english, chinese]) {
        assert.match(explainOcrError(raw), /运行库/);
        assert.match(explainOcrError(raw), /C\+\+/);
    }
});

test('缺包（asarUnpack 漏解包）提示重装，而不是让用户去裁剪图片', () => {
    const raw =
        "Cannot find package '@techstark/opencv-js' imported from C:\\app\\resources\\app.asar.unpacked\\node_modules\\@gutenye\\ocr-common\\build\\backend\\splitIntoLineImages.js";
    assert.match(explainOcrError(raw), /重新安装/);
});

test('认不出的错误回落到原来的通用文案，不误导也不吓人', () => {
    assert.equal(explainOcrError(''), GENERIC);
    assert.equal(explainOcrError(undefined), GENERIC);
    assert.equal(explainOcrError('未识别到文字'), GENERIC);
    assert.equal(explainOcrError(new Error('some other failure')), GENERIC);
});
