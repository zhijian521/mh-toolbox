import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import CharactersPage from '../features/characters/CharactersPage.vue';
import SettingsPage from '../features/settings/SettingsPage.vue';
import PendingPage from '../features/pending/PendingPage.vue';
import { sections } from './navigation';
import '../assets/styles.css';

/**
 * 渲染层错误落盘。
 *
 * 主进程无法直接看到渲染进程的异常，而打包后的应用没有控制台。这里把未捕获的
 * 异常与未处理的 Promise 拒绝转成一条保存请求打进日志，出问题时至少有据可查。
 * 记录失败必须静默——诊断手段不能反过来打断业务。
 */
function reportRendererError(message: string, detail: unknown) {
    try {
        const error = detail instanceof Error ? detail : new Error(String(detail));
        const text =
            '[渲染进程] ' +
            message +
            '\n' +
            [error.message, error.stack].filter(Boolean).join('\n') +
            '\n位置：' +
            window.location.hash;
        // 复用 saveData 通道会污染数据；改为写一条诊断请求交给主进程记录。
        window.mhV2?.logError?.(text);
    } catch {
        /* 诊断失败静默放弃。 */
    }
}

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', redirect: '/characters' },
        ...sections
            .filter((section) => section.pending)
            .map(({ path, title, icon }) => ({
                path,
                component: PendingPage,
                props: { title, icon },
            })),
        { path: '/characters', component: CharactersPage },
        { path: '/settings', component: SettingsPage },
        { path: '/:pathMatch(.*)*', redirect: '/characters' },
    ],
});

const app = createApp(App);
app.config.errorHandler = (error, _instance, info) => {
    reportRendererError('组件渲染异常（' + info + '）', error);
    console.error(error);
};
window.addEventListener('unhandledrejection', (event) => {
    reportRendererError('未处理的 Promise 拒绝', event.reason);
});
app.use(createPinia()).use(router).mount('#app');
