'use strict';
const { app, nativeImage, utilityProcess } = require('electron');
const path = require('node:path');

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
const JOB_TIMEOUT = 45000;
const IDLE_TIMEOUT = 60000;
let child = null;
let pending = null;
let idleTimer = null;

function prepareImage(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_IMAGE_BYTES * 1.4 ||
    !/^data:image\/(?:png|jpeg|webp|bmp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error('请选择 PNG、JPG、WebP 或 BMP 图片，单张不超过 16 MB');
  }
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('图片超过 16 MB，请先截取装备属性区域');
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error('无法读取这张图片，请重新截图');
  const size = image.getSize();
  if (size.width < 16 || size.height < 16) throw new Error('图片过小，请重新截取装备属性');
  if (size.width * size.height > MAX_IMAGE_PIXELS) throw new Error('图片尺寸过大，请截取单件装备属性');
  // 保留原始彩色像素，半透明游戏背景不能靠整图灰度反色处理。
  return bytes;
}

function stopChild() {
  clearTimeout(idleTimer);
  const previous = child;
  child = null;
  if (previous) previous.kill();
}

function finish(error, result) {
  if (!pending) return;
  const job = pending;
  pending = null;
  clearTimeout(job.timer);
  job.sender.removeListener('destroyed', job.onDestroyed);
  job.sender.removeListener('did-start-navigation', job.onNavigation);
  if (error) { stopChild(); job.resolve({ ok: false, error }); }
  else {
    job.resolve({ ok: true, ...result });
    idleTimer = setTimeout(stopChild, IDLE_TIMEOUT);
  }
}

function startChild() {
  const current = utilityProcess.fork(path.join(__dirname, 'equipment-ocr-worker.js'), [], {
    serviceName: '装备截图识别', stdio: 'pipe',
  });
  child = current;
  current.stdout.resume();
  current.stderr.resume();
  current.on('message', (message) => {
    if (child !== current || !pending) return;
    if (message.type === 'progress') {
      if (!pending.sender.isDestroyed()) pending.sender.send('mh:equipmentOcrProgress', {
        id: pending.id, progress: message.progress,
      });
    } else if (message.type === 'result') {
      if (!message.text.trim()) finish('未识别到文字，请裁剪到装备文字区域后重试');
      else finish(null, { text: message.text, confidence: message.confidence });
    }
    else if (message.type === 'error') finish('识别未完成，请重试或裁剪到装备属性区域');
  });
  current.on('exit', () => {
    if (child !== current) return;
    child = null;
    finish('识别进程已退出，请重试');
  });
  current.on('error', () => { if (child === current) finish('识别进程发生错误，请重试'); });
  return current;
}

/** 只识别用户传入的图片；超时、取消及空闲时释放独立识别进程。 */
function recognizeEquipmentImage(sender, dataUrl, id) {
  if (typeof id !== 'string' || id.length > 80) return Promise.resolve({ ok: false, error: '无效的识别请求' });
  if (pending) return Promise.resolve({ ok: false, error: '上一张截图正在识别，请稍候' });
  let image;
  try { image = prepareImage(dataUrl); }
  catch (error) { return Promise.resolve({ ok: false, error: error.message }); }
  clearTimeout(idleTimer);
  return new Promise((resolve) => {
    const onDestroyed = () => finish('页面已关闭');
    const onNavigation = (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) finish('页面已刷新'); };
    pending = { id, sender, resolve, onDestroyed, onNavigation,
      timer: setTimeout(() => finish('识别超时，请裁剪属性区域后重试'), JOB_TIMEOUT) };
    sender.once('destroyed', onDestroyed);
    sender.on('did-start-navigation', onNavigation);
    try {
      const worker = child || startChild();
      worker.postMessage({ image });
    } catch (error) { finish('无法启动本地识别，请重新打开截图录入'); }
  });
}

function cancelEquipmentOcr(sender, id) {
  if (pending && pending.sender === sender && pending.id === id) finish('已取消识别');
}

app.on('before-quit', () => { finish('应用正在关闭'); stopChild(); });
module.exports = { recognizeEquipmentImage, cancelEquipmentOcr };
