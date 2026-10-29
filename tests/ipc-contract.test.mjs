import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 主进程 ↔ preload ↔ 渲染层的通道契约。
 *
 * 三处各写一遍通道名（`main/ipc.cjs` 注册、`preload.cjs` 暴露、`app/types.ts` 声明），
 * 任何一处写错都不会在类型检查或端到端里立刻暴露：少注册是运行时报「没有 handler」，
 * 少暴露是界面上某个按钮永远没反应，多暴露是一条没人用的死通道。这里把三份清单
 * 摆在一起比对，改一处忘了另一处会直接红。
 *
 * 只做静态文本解析，不启动 Electron —— 通道名是字面量，正则足够可靠。
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

/** 主进程注册的 invoke 通道：`handle('x'` 与 `guarded('x'` 两种写法。 */
function registeredChannels() {
    const text = read('src/main/ipc.cjs');
    return new Set([...text.matchAll(/(?:handle|guarded)\('([\w.]+)'/g)].map((match) => match[1]));
}

/** 主进程发回渲染层的推送事件。 */
function pushedChannels() {
    const files = ['src/main/main.cjs', 'src/main/ipc.cjs', 'src/main/equipment-ocr.cjs'];
    const channels = new Set();
    for (const file of files)
        for (const match of read(file).matchAll(/send\('mhv2:([\w.]+)'/g)) channels.add(match[1]);
    return channels;
}

/** preload 暴露给渲染层的成员名：解析 `const api = { ... }` 那个字面量。 */
function preloadMembers() {
    const text = read('src/preload/preload.cjs');
    const start = text.indexOf('const api = {');
    assert.ok(start > 0, 'preload.cjs 必须把所有通道收在一个 api 对象里再交给 contextBridge');
    assert.match(
        text,
        /contextBridge\.exposeInMainWorld\('mhV2', api\)/,
        'api 必须交给 exposeInMainWorld',
    );
    const end = text.indexOf('\n};', start);
    return new Set([...text.slice(start, end).matchAll(/^\s{4}(\w+):/gm)].map((match) => match[1]));
}

/** preload 里 invoke 的通道名与订阅的事件名。 */
function preloadChannels() {
    const text = read('src/preload/preload.cjs');
    return {
        invoke: new Set([...text.matchAll(/invoke\('mhv2:([\w.]+)'/g)].map((m) => m[1])),
        events: new Set([...text.matchAll(/on\('mhv2:([\w.]+)'/g)].map((m) => m[1])),
    };
}

/** `interface DesktopGateway { ... }` 里声明的成员名。 */
function gatewayMembers() {
    const text = read('src/renderer/app/types.ts');
    const start = text.indexOf('export interface DesktopGateway');
    assert.ok(start > 0, 'types.ts 必须有 DesktopGateway 声明');
    const body = text.slice(start, text.indexOf('\n}', start));
    return new Set([...body.matchAll(/^\s{4}(\w+)[?]?[:(]/gm)].map((match) => match[1]));
}

test('preload 暴露的成员与 DesktopGateway 声明一一对应', () => {
    const exposed = preloadMembers();
    const declared = gatewayMembers();
    assert.deepEqual(
        [...exposed].filter((name) => !declared.has(name)).sort(),
        [],
        '这些成员 preload 暴露了但 types.ts 没声明',
    );
    assert.deepEqual(
        [...declared].filter((name) => !exposed.has(name)).sort(),
        [],
        '这些成员 types.ts 声明了但 preload 没暴露（界面调用会拿到 undefined）',
    );
});

test('preload 调的通道都有主进程 handler，注册的通道也都有人调', () => {
    const registered = registeredChannels();
    const { invoke, events } = preloadChannels();
    assert.deepEqual(
        [...invoke].filter((name) => !registered.has(name)).sort(),
        [],
        '这些通道 preload 在调，但 ipc.cjs 没有注册（运行时报 No handler registered）',
    );
    assert.deepEqual(
        [...registered].filter((name) => !invoke.has(name)).sort(),
        [],
        '这些通道主进程注册了，但 preload 从没调用（死通道）',
    );
    assert.deepEqual(
        [...events].sort(),
        [...pushedChannels()].sort(),
        'preload 订阅的推送事件必须与主进程 send 的那几条一致',
    );
});

test('preload 保持最小暴露面：只允许 contextBridge + 白名单方法', () => {
    const text = read('src/preload/preload.cjs');
    assert.match(text, /contextBridge\.exposeInMainWorld\('mhV2'/, '只暴露 mhV2 一个命名空间');
    assert.doesNotMatch(text, /exposeInMainWorld\([^)]*require/, '不要把 require 暴露给渲染层');
    assert.doesNotMatch(text, /nodeIntegration/, 'preload 不应打开 nodeIntegration');
});
