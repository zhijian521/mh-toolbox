import { nextTick, onBeforeUnmount, ref, type Ref } from 'vue';
import { tabbable } from './focus';

/**
 * 弹层定位与关闭逻辑：下拉与日历共用。
 * 关闭键与 Tab 在 window 捕获阶段拦截，早于 BaseModal 的 Escape 处理，
 * 否则在弹窗内按 Escape 会先问「放弃未保存的修改」。
 *
 * Tab 的语义是「收起弹层并继续前进一格」，与原生下拉一致：焦点直接落到触发器后面
 * 那个控件上，不经过触发器本身。
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

    /**
     * 把焦点交给「触发器后面（Shift 时为前面）那一个可聚焦元素」。
     *
     * 弹层 Teleport 到 body，在文档顺序里落在整个应用之后，浏览器默认的 Tab 会从
     * 这里直接跳出界面，落到哪里还取决于弹层卸载的时机，所以必须自己接管。
     * 这里也不再先聚焦触发器：一次按键只移动一次焦点，读屏用户不会先听到触发器
     * 再被带走。越过两端时不自己绕回——焦点留在触发器上，由 BaseModal 的循环处理。
     */
    function stepFocus(backwards: boolean) {
        const trigger = options.trigger.value;
        if (!trigger) return;
        const items = tabbable().filter((element) => !options.popup.value?.contains(element));
        const index = items.indexOf(trigger);
        const target = index < 0 ? trigger : items[index + (backwards ? -1 : 1)];
        (target ?? trigger).focus();
    }

    function intercept(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        } else if (event.key === 'Tab') {
            // 必须先挡掉默认行为：弹层是 Teleport 到 body 的，默认 Tab 从被卸载的
            // 节点出发，实际落点是「页面第一个可聚焦元素」这种不可预测的位置。
            event.preventDefault();
            close(false);
            stepFocus(event.shiftKey);
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
