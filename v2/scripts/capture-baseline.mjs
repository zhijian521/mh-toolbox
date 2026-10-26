// Explicit, one-time capture. It only reads v1 and refuses to overwrite a baseline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const v2 = fileURLToPath(new URL('..', import.meta.url));
const root = path.dirname(v2);
const destination = path.join(v2, 'migration/baseline');
if (fs.existsSync(destination))
    throw new Error('基线已存在，不允许自动覆盖；请使用 migration:status 查看差异');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const name = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(name) : [name];
    });
const sources = ['src', 'tests', 'scripts', 'docs']
    .flatMap((dir) => walk(path.join(root, dir)))
    .filter((name) => /\.(js|cjs|mjs|json|html|css|md|txt)$/.test(name));
sources.push(
    ...['package.json', 'package-lock.json', 'README.md', '.gitignore'].map((name) =>
        path.join(root, name),
    ),
);
const entries = sources.map((name) => ({
    relative: path.relative(root, name).replaceAll('\\', '/'),
    bytes: fs.readFileSync(name),
}));
for (const entry of entries) {
    if (sha(entry.bytes) !== sha(fs.readFileSync(path.join(root, entry.relative))))
        throw new Error('当前版本正在变化，请重试基线采集');
}
for (const { relative, bytes } of entries) {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
}
const manifest = {
    capturedAt: new Date().toISOString(),
    timezone: 'Asia/Shanghai',
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        encoding: 'utf8',
    }).trim(),
    workingTreeStatus: execFileSync('git', ['status', '--short', '--', '.', ':!v2'], {
        cwd: root,
        encoding: 'utf8',
    }),
    schemaVersion: Number(
        entries
            .find((item) => item.relative === 'src/renderer/js/core/data.js')
            .bytes.toString()
            .match(/schemaVersion:\s*(\d+)/)[1],
    ),
    files: entries.map(({ relative, bytes }) => ({
        path: relative,
        sha256: sha(bytes),
    })),
};
fs.writeFileSync(
    path.join(v2, 'migration/baseline.json'),
    JSON.stringify(manifest, null, 2) + '\n',
);
console.log(`已在 v2 内采集 ${entries.length} 个文本文件，schemaVersion=${manifest.schemaVersion}`);
