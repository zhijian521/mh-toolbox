import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import electron from 'electron';
import { fileURLToPath } from 'node:url';

// Electron runs one scenario file per process, so every tests/*.electron.cjs is executed in its
// own run and the worst exit code wins. `inspect.electron.cjs` is a manual, interactive session
// and is skipped here.
const root = fileURLToPath(new URL('..', import.meta.url));
const files = readdirSync(`${root}tests`)
    .filter((name) => name.endsWith('.electron.cjs') && !name.startsWith('inspect.'))
    .sort()
    .map((name) => `tests/${name}`);

if (!files.length) {
    console.error('没有找到 tests/*.electron.cjs');
    process.exitCode = 1;
} else {
    for (const file of files) {
        console.log(`\n=== ${file} ===`);
        const code = await run(file);
        if (code !== 0) process.exitCode = code || 1;
    }
}

function run(file) {
    return new Promise((resolve) => {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        // The scenario file becomes Electron's entry point; it requires src/main/main.cjs
        // itself. Passing '.' as well would boot the real app and hang the run.
        const child = spawn(electron, [file], {
            cwd: root,
            env,
            stdio: ['inherit', 'pipe', 'pipe'],
            windowsHide: false,
        });
        child.stdout.setEncoding('utf8').pipe(process.stdout);
        child.stderr.setEncoding('utf8').pipe(process.stderr);
        child.on('error', (error) => {
            console.error(error);
            resolve(1);
        });
        child.on('exit', (code) => resolve(code ?? 1));
    });
}
