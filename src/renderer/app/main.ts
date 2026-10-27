import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import CharactersPage from '../features/characters/CharactersPage.vue';
import GoalsPage from '../features/goals/GoalsPage.vue';
import SettingsPage from '../features/settings/SettingsPage.vue';
import PendingPage from '../features/pending/PendingPage.vue';
import { sections } from './navigation';
import { reportRendererError } from './error-reporting';
import '../assets/styles.css';

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
        { path: '/goals', component: GoalsPage },
        { path: '/settings', component: SettingsPage },
        { path: '/:pathMatch(.*)*', redirect: '/characters' },
    ],
});

const app = createApp(App);
// 页面内的渲染异常由 App.vue 的 ErrorBoundary 先一步接住（它会自己上报并终止冒泡），
// 能走到这里的是边界之外的部分：应用外壳、侧栏，以及边界自身的渲染。
app.config.errorHandler = (error, _instance, info) => {
    reportRendererError('组件渲染异常（' + info + '）', error);
    console.error(error);
};
window.addEventListener('unhandledrejection', (event) => {
    reportRendererError('未处理的 Promise 拒绝', event.reason);
});
app.use(createPinia()).use(router).mount('#app');
