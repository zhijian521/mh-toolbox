import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import electron from 'electron';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
});
await server.listen();
server.printUrls();
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
let child,
    timer,
    closing = false;
function launch() {
    console.log('[V2] 正在启动 Electron 桌面应用；上方地址用于前端热更新。');
    child = spawn(electron, ['.', '--dev', ...process.argv.slice(2)], {
        cwd: root,
        env,
        stdio: ['inherit', 'pipe', 'pipe'],
        windowsHide: false,
    });
    child.stdout.setEncoding('utf8').pipe(process.stdout);
    child.stderr.setEncoding('utf8').pipe(process.stderr);
    child.on('error', async (error) => {
        console.error(error);
        await stop(1);
    });
    child.on('exit', async (code) => {
        if (!closing && !timer) await stop(code ?? 1);
    });
}
const watchers = ['main', 'preload'].map((dir) =>
    watch(fileURLToPath(new URL('../src/' + dir, import.meta.url)), { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const old = child;
            old.removeAllListeners('exit');
            if (old.exitCode !== null || old.signalCode !== null) {
                timer = null;
                if (!closing) launch();
                return;
            }
            old.once('exit', () => {
                timer = null;
                if (!closing) launch();
            });
            old.kill();
        }, 150);
    }),
);
async function stop(code = 0) {
    if (closing) return;
    closing = true;
    clearTimeout(timer);
    watchers.forEach((watcher) => watcher.close());
    if (child && child.exitCode === null) child.kill();
    await server.close();
    process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
launch();
