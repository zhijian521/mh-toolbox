import { spawn } from 'node:child_process';
import electron from 'electron';
import { fileURLToPath } from 'node:url';
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, process.argv.slice(2), {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: false,
});
child.stdout.setEncoding('utf8').pipe(process.stdout);
child.stderr.setEncoding('utf8').pipe(process.stderr);
child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
});
child.on('exit', (code) => {
    process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
