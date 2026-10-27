import type { DesktopGateway } from '../app/types';
export function desktop(): DesktopGateway {
    if (!window.mhV2)
        throw new Error('请通过 npm run dev 或构建后的桌面应用启动 V2。浏览器预览不连接本地数据。');
    return window.mhV2;
}
// JSON round trip deliberately strips Vue proxies before Electron structured cloning.
export function plain<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
