/**
 * 渲染层错误落盘。
 *
 * 主进程无法直接看到渲染进程的异常，而打包后的应用没有控制台。这里把未捕获的
 * 异常与未处理的 Promise 拒绝转成一条保存请求打进日志，出问题时至少有据可查。
 * 记录失败必须静默——诊断手段不能反过来打断业务。
 *
 * 页面内的渲染异常由 `components/ErrorBoundary.vue` 捕获后调用这里：它还负责
 * 把失败页面换成替代界面并终止冒泡，一旦终止，`app.config.errorHandler` 就收不到
 * 同一个错误，所以上报必须在边界里主动做一次。
 */
import { desktopOrNull } from '../services/desktop';

export function reportRendererError(message: string, detail: unknown) {
    try {
        const error = detail instanceof Error ? detail : new Error(String(detail));
        const text =
            '[渲染进程] ' +
            message +
            '\n' +
            [error.message, error.stack].filter(Boolean).join('\n') +
            '\n位置：' +
            window.location.hash;
        // 复用 saveData 通道会污染数据；改为写一条诊断请求交给主进程记录。
        // 浏览器预览没有网关，`desktopOrNull` 返回 null，这里静默跳过。
        void desktopOrNull()?.logError(text);
    } catch {
        /* 诊断失败静默放弃。 */
    }
}
