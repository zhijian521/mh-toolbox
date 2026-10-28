import { readonly, ref } from 'vue';
import type { ThemePreference } from '../app/types';
import { desktop } from './desktop';

/*
 * 外观偏好的唯一真值。
 *
 * 偏好存在主进程（建窗口前就要知道，首帧才不闪），渲染层只是读一份缓存。设置页的
 * 三档选择和侧栏的快速切换必须共用这份状态——各存一份的话，在侧栏切完再进设置页
 * 会看到旧的选中项。
 */
const preference = ref<ThemePreference>('auto');
/** 当前实际生效的是不是深色（`auto` 档下由系统决定，主进程算好告诉我们）。 */
const dark = ref(false);
let loading: Promise<void> | null = null;

/*
 * 系统主题在应用运行期间被改掉时，`auto` 档下的界面会自己翻（`light-dark()` 跟着
 * `prefers-color-scheme` 走），但侧栏按钮的图标不会——它读的是这个 ref。所以监听
 * 一次，省得界面是深色、按钮还画着太阳。
 */
let watching = false;
function watchSystem() {
    if (watching || typeof window.matchMedia !== 'function') return;
    watching = true;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', (event) => {
        dark.value = event.matches;
    });
}

/**
 * 读取偏好。多个页面都会在挂载时调用，实际只发一次 IPC。
 */
export function loadTheme(): Promise<void> {
    if (loading) return loading;
    watchSystem();
    loading = (async () => {
        try {
            const state = await desktop().getTheme();
            preference.value = state.theme;
            dark.value = state.dark;
        } catch {
            // 浏览器预览没有桌面通道：留在默认档，不打扰用户。
        }
    })();
    return loading;
}

/**
 * 切换档位。先落到界面上再等主进程，失败了退回去——点了没反应比闪一下更难受。
 */
export async function setTheme(next: ThemePreference): Promise<void> {
    if (preference.value === next) return;
    const previousPreference = preference.value;
    const previousDark = dark.value;
    preference.value = next;
    try {
        const state = await desktop().setTheme(next);
        preference.value = state.theme;
        dark.value = state.dark;
    } catch (failure) {
        preference.value = previousPreference;
        dark.value = previousDark;
        throw failure;
    }
}

/**
 * 在浅色与深色之间直接对调。
 *
 * `auto` 档点一下会变成明确的 `light` / `dark`——用户点的是「我要看深色」，
 * 而不是「把自动调成另一种自动」。想回到跟随系统去设置页选。
 */
export function toggleTheme(): Promise<void> {
    return setTheme(dark.value ? 'light' : 'dark');
}

export const themePreference = readonly(preference);
export const themeDark = readonly(dark);
