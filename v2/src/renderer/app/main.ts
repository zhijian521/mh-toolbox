import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import App from './App.vue';
import CharactersPage from '../features/characters/CharactersPage.vue';
import SettingsPage from '../features/settings/SettingsPage.vue';
import PendingPage from '../features/pending/PendingPage.vue';
import { sections } from './navigation';
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
        { path: '/settings', component: SettingsPage },
        { path: '/:pathMatch(.*)*', redirect: '/characters' },
    ],
});
createApp(App).use(createPinia()).use(router).mount('#app');
