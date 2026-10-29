import type { DesktopGateway } from '../app/types';

/**
 * 桌面网关。渲染层**只能**通过这里拿 `window.mhV2`。
 *
 * 在组件里直接写 `window.mhV2?.xxx()` 会让「浏览器预览」这条路各自处理一遍：有的静默
 * 跳过、有的报错、有的干脆崩。统一入口之后，可选能力走 {@link desktopOrNull}，
 * 必需能力走 {@link desktop}（直接给出可读的启动方式提示）。
 */
export function desktop(): DesktopGateway {
    if (!window.mhV2)
        throw new Error('请通过 npm run dev 或构建后的桌面应用启动 V2。浏览器预览不连接本地数据。');
    return window.mhV2;
}

/** 可选能力用：浏览器预览下返回 null，由调用方决定降级方式。 */
export function desktopOrNull(): DesktopGateway | null {
    return window.mhV2 || null;
}
// JSON round trip deliberately strips Vue proxies before Electron structured cloning.
export function plain<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
