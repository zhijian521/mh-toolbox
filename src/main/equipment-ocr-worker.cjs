const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { planPasses, orphanCount, pickPass } = require('./equipment-ocr-scale.cjs');

/**
 * 装备识别子进程：只做「图片 → 文本」。
 *
 * 放在 utility 进程里跑：ONNX 推理会长时间占满 CPU，模型与原生库也都是按进程加载的。
 * 与主进程之间只走两条消息：进度与结果，不认识任何业务概念（部位、词条都由渲染层解析）。
 */

let ocr = null;
let sharp = null;

const progress = (value) => process.parentPort.postMessage({ type: 'progress', progress: value });
/** 打包后原生库与模型都在 app.asar.unpacked 下，ESM 只能从真实路径加载。 */
const unpacked = (file) => file.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

async function initialize() {
    const { default: Ocr } = await import(
        pathToFileURL(unpacked(require.resolve('@gutenye/ocr-node'))).href
    );
    ({ default: sharp } = await import(pathToFileURL(unpacked(require.resolve('sharp'))).href));
    const modelRoot = path.join(
        path.dirname(unpacked(require.resolve('@gutenye/ocr-models/node'))),
        'assets',
    );
    ocr = await Ocr.create({
        models: {
            detectionPath: path.join(modelRoot, 'ch_PP-OCRv4_det_infer.onnx'),
            recognitionPath: path.join(modelRoot, 'ch_PP-OCRv4_rec_infer.onnx'),
            dictionaryPath: path.join(modelRoot, 'ppocr_keys_v1.txt'),
        },
        // 只用 CPU：这台机器是 Windows 桌面，DirectML 首帧编译比整张图还慢。
        onnxOptions: { executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1 },
    });
}

/**
 * 跑一档缩放，产出一份「每框一行」的文本。
 *
 * `sharp` 的操作是排队累积的，同一个实例不能连着 resize 两次，所以每档都从原始
 * buffer 重新开一个。
 *
 * @param {Buffer} buffer 原始图片字节
 * @param {number} width 原图宽
 * @param {number} scale 缩放倍数
 */
async function recognizeAt(buffer, width, scale) {
    const pixels = await sharp(buffer, { limitInputPixels: 16 * 1024 * 1024 })
        .resize({ width: Math.max(1, Math.round(width * scale)) })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { texts } = await ocr.detect({
        data: pixels.data,
        width: pixels.info.width,
        height: pixels.info.height,
    });
    const kept = texts.filter((line) => line.text.trim());
    const lines = kept.map((line) => line.text);
    return {
        lines,
        orphans: orphanCount(lines),
        confidence: kept.length
            ? (100 * kept.reduce((sum, line) => sum + line.mean, 0)) / kept.length
            : 0,
    };
}

process.parentPort.on('message', async ({ data }) => {
    try {
        progress(0.05);
        if (!ocr) await initialize();
        progress(0.25);
        /**
         * 缩放后再识别。
         *
         * 游戏截图常见 2560 宽，原尺寸推理慢且对识别率没有帮助；上限 1600×2600 是
         * 在清晰度与耗时之间试出来的折中，小图不放大（scale 上限 3 是给小截图的）。
         *
         * 检测头对缩放相位敏感：同一张小图在 3 倍下可能把「魔法 +80 防御 +43」切成
         * 两个框、丢掉「魔法」，换 2 倍就完整。所以首档留下断框残段时换一档复跑，
         * 取更干净的那份——正常图仍然只跑一次。
         */
        const buffer = Buffer.from(data.image);
        const { width, height } = await sharp(buffer, {
            limitInputPixels: 16 * 1024 * 1024,
        }).metadata();
        const scales = planPasses(width, height);
        let best = null;
        for (const [index, scale] of scales.entries()) {
            best = pickPass(best, await recognizeAt(buffer, width, scale));
            // 一行都没认出来时也值得换一档再试：整张图无文字的情况少见，代价只是慢一倍。
            if (best.orphans === 0 && best.lines.length) break;
            if (index === 0 && scales.length > 1) progress(0.6);
        }
        progress(0.95);
        process.parentPort.postMessage({
            type: 'result',
            text: best.lines.join('\n'),
            confidence: best.confidence,
        });
    } catch (error) {
        process.parentPort.postMessage({
            type: 'error',
            error: (error && error.message) || String(error),
        });
    }
});
