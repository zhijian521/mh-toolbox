import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue';

/**
 * 弹层定位与关闭逻辑：下拉与日历共用。
 * 关闭键与 Tab 在 window 捕获阶段拦截，早于 BaseModal 的 Escape 处理，
 * 否则在弹窗内按 Escape 会先问「放弃未保存的修改」。
 */
export function usePopover(options: {
    trigger: Ref<HTMLElement | undefined>;
    popup: Ref<HTMLElement | undefined>;
    align?: () => 'left' | 'right';
    width?: () => number | undefined;
    minWidth?: number;
}) {
    const open = ref(false);

    function place() {
        const rect = options.trigger.value?.getBoundingClientRect();
        const element = options.popup.value;
        if (!rect || !element) return;
        const width = options.width?.() ?? Math.max(rect.width, options.minWidth ?? 148);
        element.style.width = width + 'px';
        const height = element.offsetHeight;
        const align = options.align?.() ?? 'left';
        let left = align === 'right' ? rect.right - width : rect.left;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        let top = rect.bottom + 4;
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4);
        element.style.left = left + 'px';
        element.style.top = top + 'px';
    }

    function outside(event: MouseEvent) {
        const target = event.target as Node;
        if (options.popup.value?.contains(target) || options.trigger.value?.contains(target))
            return;
        close(false);
    }

    function intercept(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        } else if (event.key === 'Tab') {
            close(false);
            options.trigger.value?.focus();
        }
    }

    async function show(focusSelector = '.xitem.active') {
        if (open.value) return;
        open.value = true;
        await nextTick();
        place();
        const target =
            options.popup.value?.querySelector<HTMLElement>(focusSelector) || options.popup.value;
        target?.focus();
        document.addEventListener('mousedown', outside, true);
        window.addEventListener('keydown', intercept, true);
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
    }

    function close(restore = false) {
        if (!open.value) return;
        open.value = false;
        document.removeEventListener('mousedown', outside, true);
        window.removeEventListener('keydown', intercept, true);
        window.removeEventListener('resize', place);
        window.removeEventListener('scroll', place, true);
        if (restore) options.trigger.value?.focus();
    }

    onBeforeUnmount(() => close(false));
    return { open, show, close, place };
}
