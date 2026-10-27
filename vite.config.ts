import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
    base: './',
    plugins: [vue()],
    server: { host: '127.0.0.1', port: 5174, strictPort: true },
    build: { outDir: '../../dist/renderer', emptyOutDir: true },
});
