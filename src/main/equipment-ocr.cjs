const { app, nativeImage, utilityProcess } = require('electron');
const path = require('node:path');

/**
 * 装备截图识别（本地 OCR）。
 *
 * 图片只在内存里流转：渲染进程把 dataURL 交过来，这里解码校验后直接丢给独立的
 * utility 进程，识别完就把结果回传，全程不落盘、不出本机。
 *
 * 为什么要单独一个进程：ONNX 推理会长时间占满几个核，放在主进程里会卡住窗口消息
 * 与数据保存；而且原生库崩溃时只死一个子进程，主进程还能给用户一句可读的提示。
 *
 * 一次只认一张：模型加载与推理都吃内存，排队反而让「识别中」的进度条失真。
 */

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;
/** 单张超时：常规截图 1～3 秒，慢机器留足余量。 */
const JOB_TIMEOUT = 45000;
/** 空闲后释放子进程：模型常驻约 100 MB，用完不该一直占着。 */
const IDLE_TIMEOUT = 60000;

function createEquipmentOcr({ logger }) {
    let child = null;
    let pending = null;
    let idleTimer = null;

    /**
     * 校验并解码渲染进程传来的图片。
     *
     * 只认 dataURL 而不是文件路径：渲染进程没有文件系统访问权，路径形式的输入
     * 只会是伪造的；尺寸与像素上限则防止一张 4K 截图把推理拖到超时。
     */
    function prepareImage(dataUrl) {
        if (
            typeof dataUrl !== 'string' ||
            dataUrl.length > MAX_IMAGE_BYTES * 1.4 ||
            !/^data:image\/(?:png|jpeg|webp|bmp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)
        ) {
            throw new Error('请选择 PNG、JPG、WebP 或 BMP 图片，单张不超过 16 MB');
        }
        const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
        if (bytes.length > MAX_IMAGE_BYTES) throw new Error('图片超过 16 MB，请先截取装备属性区域');
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw new Error('无法读取这张图片，请重新截图');
        const size = image.getSize();
        if (size.width < 16 || size.height < 16) throw new Error('图片过小，请重新截取装备属性');
        if (size.width * size.height > MAX_IMAGE_PIXELS)
            throw new Error('图片尺寸过大，请截取单件装备属性');
        // 保留原始彩色像素：半透明游戏底图不能靠整图灰度反色处理。
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
        if (error) {
            logger.warn('装备识别未完成：' + error);
            stopChild();
            job.resolve({ ok: false, error });
            return;
        }
        job.resolve({ ok: true, ...result });
        idleTimer = setTimeout(stopChild, IDLE_TIMEOUT);
    }

    function startChild() {
        const current = utilityProcess.fork(path.join(__dirname, 'equipment-ocr-worker.cjs'), [], {
            serviceName: '装备截图识别',
            stdio: 'pipe',
        });
        child = current;
        current.stdout.resume();
        current.stderr.resume();
        current.on('message', (message) => {
            if (child !== current || !pending) return;
            if (message.type === 'progress') {
                if (!pending.sender.isDestroyed())
                    pending.sender.send('mhv2:equipmentOcrProgress', {
                        id: pending.id,
                        progress: message.progress,
                    });
            } else if (message.type === 'result') {
                if (!message.text.trim()) finish('未识别到文字，请裁剪到装备文字区域后重试');
                else finish(null, { text: message.text, confidence: message.confidence });
            } else if (message.type === 'error') {
                logger.warn('装备识别子进程报告失败：' + String(message.error || '').slice(0, 400));
                finish('识别未完成，请重试或裁剪到装备属性区域');
            }
        });
        current.on('exit', () => {
            if (child !== current) return;
            child = null;
            finish('识别进程已退出，请重试');
        });
        current.on('error', (error) => {
            logger.error('装备识别子进程异常', error);
            if (child === current) finish('识别进程发生错误，请重试');
        });
        return current;
    }

    /**
     * 识别一张图。
     *
     * 失败一律返回 `{ok:false,error}` 而不是抛异常：用户看到的应该是一句能照着做的
     * 提示（裁剪、重试），而不是「Error invoking remote method」这种栈。
     */
    function recognize(sender, dataUrl, id) {
        if (typeof id !== 'string' || id.length > 80)
            return Promise.resolve({ ok: false, error: '无效的识别请求' });
        if (pending) return Promise.resolve({ ok: false, error: '上一张截图正在识别，请稍候' });
        let image;
        try {
            image = prepareImage(dataUrl);
        } catch (error) {
            return Promise.resolve({ ok: false, error: error.message });
        }
        clearTimeout(idleTimer);
        return new Promise((resolve) => {
            const onDestroyed = () => finish('页面已关闭');
            /**
             * 只有真正的换页才取消。
             *
             * 应用用的是 hash 路由，切一次页面（`#/equipment` → `#/accounts`）也会派发
             * `did-start-navigation`，但 `isInPlace` 为真、文档其实没换。两者都当刷新的话，
             * 识别期间随手切个页就会把结果丢掉——用户看到的是「页面已刷新」。
             */
            const onNavigation = (_event, _url, isInPlace, isMainFrame) => {
                if (isMainFrame && !isInPlace) finish('页面已刷新');
            };
            pending = {
                id,
                sender,
                resolve,
                onDestroyed,
                onNavigation,
                timer: setTimeout(() => finish('识别超时，请裁剪属性区域后重试'), JOB_TIMEOUT),
            };
            sender.once('destroyed', onDestroyed);
            sender.on('did-start-navigation', onNavigation);
            try {
                const worker = child || startChild();
                worker.postMessage({ image });
            } catch (error) {
                logger.error('无法启动装备识别', error);
                finish('无法启动本地识别，请重新打开截图录入');
            }
        });
    }

    function cancel(sender, id) {
        if (pending && pending.sender === sender && pending.id === id) finish('已取消识别');
    }

    function dispose() {
        finish('应用正在关闭');
        stopChild();
    }

    // 退出时先解绑：子进程不杀干净会拖住进程退出。
    app.on('before-quit', dispose);
    return { recognize, cancel, dispose };
}

module.exports = { createEquipmentOcr };
