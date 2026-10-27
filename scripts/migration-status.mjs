import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('..', import.meta.url));
const root = path.join(project, 'migration/baseline');
const baseline = JSON.parse(fs.readFileSync(path.join(project, 'migration/baseline.json'), 'utf8'));
const walk = (dir) =>
    fs.existsSync(dir)
        ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
              const name = path.join(dir, entry.name);
              return entry.isDirectory() ? walk(name) : [name];
          })
        : [];
const known = new Set(baseline.files.map((entry) => entry.path));
let changes = 0;
for (const entry of baseline.files) {
    const file = path.join(root, entry.path);
    const hash = fs.existsSync(file)
        ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
        : null;
    if (hash !== entry.sha256) {
        console.log(`${hash ? '修改' : '删除'} ${entry.path}`);
        changes++;
    }
}
for (const file of ['src', 'tests', 'scripts', 'docs'].flatMap((dir) =>
    walk(path.join(root, dir)),
)) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (/\.(js|cjs|mjs|json|html|css|md|txt)$/.test(file) && !known.has(relative)) {
        console.log('新增 ' + relative);
        changes++;
    }
}
console.log(
    changes
        ? `共 ${changes} 项当前版本变化，未自动同步或写入任何文件。`
        : '当前版本文本文件与迁移基线一致。',
);
