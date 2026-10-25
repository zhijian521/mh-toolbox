'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let ocr = null;
let sharp = null;
const progress = (value) => process.parentPort.postMessage({ type: 'progress', progress: value });
const unpacked = (file) => file.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');

async function initialize() {
  // ESM、ONNX 与图像原生库从真实解包路径加载，模型全部随包离线提供。
  const { default: Ocr } = await import(pathToFileURL(unpacked(require.resolve('@gutenye/ocr-node'))).href);
  ({ default: sharp } = await import(pathToFileURL(unpacked(require.resolve('sharp'))).href));
  const modelRoot = path.join(path.dirname(unpacked(require.resolve('@gutenye/ocr-models/node'))), 'assets');
  ocr = await Ocr.create({
    models: {
      detectionPath: path.join(modelRoot, 'ch_PP-OCRv4_det_infer.onnx'),
      recognitionPath: path.join(modelRoot, 'ch_PP-OCRv4_rec_infer.onnx'),
      dictionaryPath: path.join(modelRoot, 'ppocr_keys_v1.txt'),
    },
    onnxOptions: { executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1 },
  });
}

process.parentPort.on('message', async ({ data }) => {
  try {
    progress(0.05);
    if (!ocr) await initialize();
    progress(0.25);
    const image = sharp(Buffer.from(data.image), { limitInputPixels: 16 * 1024 * 1024 });
    const { width, height } = await image.metadata();
    const scale = Math.min(3, 1600 / width, 2600 / height);
    const pixels = await image.resize({ width: Math.max(1, Math.round(width * scale)) }).ensureAlpha()
      .raw().toBuffer({ resolveWithObject: true });
    progress(0.4);
    const { texts } = await ocr.detect({ data: pixels.data, width: pixels.info.width, height: pixels.info.height });
    const lines = texts.filter((line) => line.text.trim());
    progress(0.95);
    process.parentPort.postMessage({ type: 'result', text: lines.map((line) => line.text).join('\n'),
      confidence: lines.length ? 100 * lines.reduce((sum, line) => sum + line.mean, 0) / lines.length : 0 });
  } catch (error) { process.parentPort.postMessage({ type: 'error' }); }
});
