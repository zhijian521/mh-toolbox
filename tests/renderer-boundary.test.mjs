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
