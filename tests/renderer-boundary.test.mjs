import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 页面级错误边界的接线检查。
 *
 * 这不是行为测试：真正的行为（渲染失败 → 替代界面 → 恢复）由 Electron 集成测试
 * 在真窗口里验证过，但那次验证需要一条临时崩溃路由，不能常驻生产代码。所以这里只
 * 守住三件「一旦被顺手改掉就会静默失效」的接线：
 *
 *   1. `App.vue` 的 `RouterView` 必须处在 `ErrorBoundary` 之内，否则错误根本到不了边界；
 *   2. 边界里必须先上报再终止冒泡——`return false` 让全局 `errorHandler` 收不到该错误，
 *      漏掉上报就等于连日志都没有；
 *   3. 失败状态要按路由重置，否则用户切走再回来仍是替代界面。
 *
 * 断言只看结构，不比对文案，改文案不会误伤。
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('页面级错误边界保持接入：包裹路由视图、上报错误、按路由复位', () => {
    const app = read('src/renderer/app/App.vue');
    assert.match(app, /import ErrorBoundary from/, 'App.vue 应引入 ErrorBoundary');
    assert.match(
        app,
        /<ErrorBoundary[^>]*>[\s\S]*?<RouterView[\s\S]*?<\/ErrorBoundary>/,
        'RouterView 必须被 ErrorBoundary 包裹，否则页面抛错仍会白屏',
    );
    assert.match(app, /:reset-key=/, 'ErrorBoundary 需要按路由重置失败状态');

    const boundary = read('src/renderer/components/ErrorBoundary.vue');
    assert.match(boundary, /onErrorCaptured\(/, '错误边界必须捕获子树异常');
    assert.match(boundary, /return false/, '捕获后返回 false 才会终止向全局冒泡');
    assert.match(boundary, /reportRendererError\(/, '终止冒泡后错误不再进全局处理，必须自己上报');
    assert.match(boundary, /<slot v-if="!failure"/, '无失败时必须渲染插槽内容');
});

/**
 * 页面注册表：新增页面必须在两处登记（`navigation.ts` 的侧栏项、`main.ts` 的路由）。
 *
 * 少登记一处不会报错：路由有、导航没有，页面只能靠手输 hash 进去；导航有、路由没有，
 * 点进去是空白。这条测试把两边的 path 摆在一起比对。
 */
test('侧栏导航与路由表一一对应', () => {
    const nav = read('src/renderer/app/navigation.ts');
    const main = read('src/renderer/app/main.ts');
    const navPaths = new Set([...nav.matchAll(/path:\s*'(\/[^']*)'/g)].map((m) => m[1]));
    const routePaths = new Set(
        [...main.matchAll(/\{\s*path:\s*'(\/[^']*)',\s*component:/g)].map((m) => m[1]),
    );
    assert.ok(navPaths.size >= 8, '侧栏至少要有 8 个页面，解析失败时先检查 navigation.ts 的写法');
    assert.deepEqual(
        [...routePaths].filter((item) => !navPaths.has(item)).sort(),
        [],
        '这些路由没有对应的侧栏入口',
    );
    assert.deepEqual(
        [...navPaths].filter((item) => !routePaths.has(item)).sort(),
        [],
        '这些侧栏入口没有对应路由（点进去是空白页）',
    );
});

/**
 * 分层边界：渲染层不许直接碰 Electron / Node，也不许绕开 `services/desktop.ts` 拿网关。
 *
 * 现在实际是 0 违规，但这类越界通常从「临时用一下」开始：一旦有人 `import { ipcRenderer }`，
 * 沙箱与白名单就形同虚设，而构建仍然能过。这条守住进口。
 */
test('渲染层不经后门：无 electron / node 导入，网关只有唯一入口', () => {
    const rendererRoot = path.join(root, 'src/renderer');
    const offenders = [];
    let scanned = 0;
    const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!/\.(ts|js|vue)$/.test(entry.name)) continue;
            scanned += 1;
            const relative = path.relative(root, full).replace(/\\/g, '/');
            if (relative === 'src/renderer/services/desktop.ts') continue;
            if (relative === 'src/renderer/app/types.ts') continue;
            const text = fs.readFileSync(full, 'utf8');
            if (/from 'electron'|require\('electron'\)/.test(text))
                offenders.push(relative + ' → electron');
            if (/from 'node:/.test(text)) offenders.push(relative + ' → node:');
            if (/window\.mhV2/.test(text)) offenders.push(relative + ' → window.mhV2');
        }
    };
    walk(rendererRoot);
    // 扫描面太小说明遍历写错了，测试会变成永远绿的摆设。
    assert.ok(scanned > 80, '应扫到 80 个以上渲染层文件，实际 ' + scanned);
    assert.deepEqual(offenders, [], '渲染层只允许通过 services/desktop.ts 使用桌面能力');
});
