import { onBeforeUnmount, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';

/**
 * 分区导航：长表单弹窗（角色档案，以及后续按分区组织的编辑页）共用。
 *
 * 调用方只提供分区键，组合式函数负责三件事：`register(key)` 收回 `:ref` 回调、
 * `go(key)` 滚动到该分区并把标题 `h3` 聚焦（键盘用户按 Tab 能从这里继续），
 * `active` 供导航按钮标记 `aria-current`。`active` 同时跟随滚动：用户手动滚动
 * 到某个分区时高亮自动切过去，否则导航指向的位置和眼前内容会对不上。
 *
 * `register` 对同一 key 返回同一个闭包：模板每次重渲染都会重新求值 `:ref`，
 * 闭包身份不稳定会让 Vue 反复执行「先置空再赋值」的卸载/挂载流程。
 */
export function useSectionNav<T extends string>(keys: readonly T[], initial?: T) {
    const active = ref<T>((initial ?? keys[0]) as T);
    const elements = new Map<T, HTMLElement>();
    const handlers = new Map<T, (target: Element | ComponentPublicInstance | null) => void>();
    let host: HTMLElement | null = null;
    let listening = false;

    /** 找最近的可滚动祖先：弹窗里是 `.modal-body`，独立页面里可能是 window。 */
    function scrollHost(element: HTMLElement) {
        let node = element.parentElement;
        while (node) {
            if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
            node = node.parentElement;
        }
        return null;
    }

    /**
     * 惰性解析：首次 `register` 时元素可能还没挂到弹窗里，`parentElement` 是空的。
     * 因此每次跟踪都重试一次，直到拿到仍在文档中的宿主为止。
     */
    function resolveHost() {
        if (host?.isConnected) return host;
        const first = elements.values().next().value;
        host = first ? scrollHost(first) : null;
        return host;
    }

    /** 滚动时把高亮交给最靠近顶部锚点的分区；同顶（双列）取注册顺序靠前的那个。 */
    function track() {
        if (!elements.size) return;
        const root = resolveHost();
        const anchor = (root?.getBoundingClientRect().top ?? 0) + 64;
        let best = -Infinity;
        // 没有任何分区越过锚点时（刚打开、停在最顶部）应当落在第一段，而不是沿用旧值。
        let current = keys[0] ?? active.value;
        for (const [key, element] of elements) {
            const top = element.getBoundingClientRect().top;
            if (top <= anchor && top > best) {
                best = top;
                current = key;
            }
        }
        // 滚到底时最后一段可能永远够不到锚点，直接按到底处理。
        if (root && root.scrollHeight - root.scrollTop - root.clientHeight <= 2) {
            const last = keys[keys.length - 1];
            if (last) current = last;
        }
        if (current !== active.value) active.value = current;
    }

    function startTracking() {
        if (listening) return;
        listening = true;
        // scroll 不冒泡，但会走捕获阶段；挂在 window 上才能收到任意滚动容器的事件。
        window.addEventListener('scroll', track, { capture: true, passive: true });
    }

    function stopTracking() {
        if (!listening) return;
        listening = false;
        window.removeEventListener('scroll', track, true);
    }

    function register(key: T) {
        let handler = handlers.get(key);
        if (!handler) {
            handler = (target) => {
                if (target instanceof HTMLElement) {
                    elements.set(key, target);
                    startTracking();
                    track();
                } else {
                    elements.delete(key);
                    if (!elements.size) stopTracking();
                }
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
        stopTracking();
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
