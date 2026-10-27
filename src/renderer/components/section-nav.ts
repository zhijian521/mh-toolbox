import { onBeforeUnmount, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';

/**
 * 分区导航：长表单弹窗（角色档案，以及后续按分区组织的编辑页）共用。
 *
 * 调用方只提供分区键，组合式函数负责三件事：`register(key)` 收回 `:ref` 回调、
 * `go(key)` 滚动到该分区并把标题 `h3` 聚焦（键盘用户按 Tab 能从这里继续），
 * `active` 供导航按钮标记 `aria-current`。
 *
 * `register` 对同一 key 返回同一个闭包：模板每次重渲染都会重新求值 `:ref`，
 * 闭包身份不稳定会让 Vue 反复执行「先置空再赋值」的卸载/挂载流程。
 */
export function useSectionNav<T extends string>(keys: readonly T[], initial?: T) {
    const active = ref<T>((initial ?? keys[0]) as T);
    const elements = new Map<T, HTMLElement>();
    const handlers = new Map<T, (target: Element | ComponentPublicInstance | null) => void>();

    function register(key: T) {
        let handler = handlers.get(key);
        if (!handler) {
            handler = (target) => {
                if (target instanceof HTMLElement) elements.set(key, target);
                else elements.delete(key);
            };
            handlers.set(key, handler);
        }
        return handler;
    }

    function go(key: T) {
        active.value = key;
        const section = elements.get(key);
        section?.scrollIntoView({ block: 'start' });
        section?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
    }

    onBeforeUnmount(() => {
        elements.clear();
        handlers.clear();
    });

    return {
        register,
        go,
        /**
         * 当前分区键。这里用取值器而不是直接返回 ref：组合式函数的返回值是普通对象，
         * 模板不会自动解包嵌套的 ref，`nav.active === key` 会变成拿 Ref 比字符串。
         */
        get active() {
            return active.value;
        },
    };
}
