import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { configureProfile } = require('../src/main/profile.cjs');
const { createDataStore } = require('../src/main/data-store.cjs');
const { assertExportPath } = require('../src/main/export-path.cjs');
const root = fileURLToPath(new URL('..', import.meta.url));

test('应用数据、Chromium 会话与日志均配置到独立 v2 目录', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-v2-isolation-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const paths = new Map([['appData', dir]]);
    let name, logs;
    const userData = configureProfile({
        setName(value) {
            name = value;
        },
        getPath(key) {
            return paths.get(key);
        },
        setPath(key, value) {
            paths.set(key, value);
        },
        setAppLogsPath(value) {
            logs = value;
        },
    });
    assert.equal(name, 'mh-tool-v2');
    assert.equal(userData, path.join(dir, 'mh-tool-v2'));
    assert.equal(paths.get('sessionData'), path.join(userData, 'session'));
    assert.equal(logs, path.join(userData, 'logs'));
    const legacy = path.join(dir, '梦幻养老助手');
    fs.mkdirSync(legacy);
    const oldFile = path.join(legacy, 'data.json'),
        oldBytes = '{"legacy":"keep"}';
    fs.writeFileSync(oldFile, oldBytes);
    const store = createDataStore(userData);
    assert.equal(store.save({ schemaVersion: 6, characters: [] }).ok, true);
    assert.equal(
        store.save({ schemaVersion: 6, characters: [{ id: 'c1' }] }, { backupReason: 'import' }).ok,
        true,
    );
    assert.equal(
        store.save({ schemaVersion: 6, characters: [] }, { backupReason: 'wipe' }).ok,
        true,
    );
    assert.equal(fs.readFileSync(oldFile, 'utf8'), oldBytes);
    assert.equal(fs.readdirSync(userData).filter((file) => file.endsWith('.bak')).length, 2);
    assert.throws(() => assertExportPath(oldFile, dir, store.file), /当前版本数据目录/);
    assert.throws(
        () => assertExportPath(path.join(dir, 'mh-tool', 'data.json'), dir, store.file),
        /当前版本数据目录/,
    );
    assert.throws(() => assertExportPath(store.file, dir, store.file), /正在使用/);
    assert.doesNotThrow(() => assertExportPath(path.join(dir, 'export.json'), dir, store.file));
});

test('保存异常不替换磁盘数据，较低 schema 不能覆盖已有较新版本', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-v2-write-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const store = createDataStore(dir),
        initial = { schemaVersion: 6, characters: [{ id: 'c1', name: '轻舟' }] };
    assert.equal(store.save(initial).ok, true);
    assert.equal(store.save({ schemaVersion: 5, characters: [] }).ok, false);
    assert.deepEqual(store.load().data, initial);
    fs.mkdirSync(store.file + '.tmp');
    assert.equal(store.save({ schemaVersion: 6, characters: [] }).ok, false);
    assert.deepEqual(store.load().data, initial);
});

test('运行源码不依赖当前版本目录或全局业务对象', () => {
    const walk = (directory) =>
        fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
            const file = path.join(directory, entry.name);
            return entry.isDirectory() ? walk(file) : [file];
        });
    for (const file of walk(path.join(root, 'src')).filter((file) =>
        /\.(js|ts|cjs|vue)$/.test(file),
    )) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /window\.(D|UI|Views|U)\b/, file);
        assert.doesNotMatch(source, /(?:from\s*|require\s*\()["'][^"']*(?:\.\.\/){3,}src\//, file);
    }
});
