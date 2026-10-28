const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
         */
        const image = sharp(Buffer.from(data.image), { limitInputPixels: 16 * 1024 * 1024 });
        const { width, height } = await image.metadata();
        const scale = Math.min(3, 1600 / width, 2600 / height);
        const pixels = await image
            .resize({ width: Math.max(1, Math.round(width * scale)) })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        progress(0.4);
        const { texts } = await ocr.detect({
            data: pixels.data,
            width: pixels.info.width,
            height: pixels.info.height,
        });
        const lines = texts.filter((line) => line.text.trim());
        progress(0.95);
        process.parentPort.postMessage({
            type: 'result',
            text: lines.map((line) => line.text).join('\n'),
            confidence: lines.length
                ? (100 * lines.reduce((sum, line) => sum + line.mean, 0)) / lines.length
                : 0,
        });
    } catch (error) {
        process.parentPort.postMessage({
            type: 'error',
            error: (error && error.message) || String(error),
        });
    }
});
