import { onBeforeUnmount, ref } from 'vue';

/**
 * 拖动排序：角色卡片与技能行共用。
 * 调用方给出当前的键顺序与落位回调，这里只管拖动状态、插入提示与边缘自动滚动。
 * 回调同时拿到按下标的最终位置（to，可直接用于 splice）与相对位置（targetKey/position），
 * 便于写入「移动某项到某项前后」这类持久化接口。
 */
export type DropPosition = 'before' | 'after';

export interface SortMove {
    key: string;
    from: number;
    to: number;
    targetKey: string;
    position: DropPosition;
}

export function useDragSort(options: {
    keys: () => string[];
    onMove: (move: SortMove) => void;
    scroll?: () => HTMLElement | undefined;
    enabled?: () => boolean;
    /** 落位判定轴：纵向列表用 y，横向或双列网格用 x。 */
    axis?: 'x' | 'y';
    edge?: number;
    speed?: number;
}) {
    const dragging = ref(''),
        dropKey = ref(''),
        dropPosition = ref<DropPosition>('before');
    const edge = options.edge ?? 65,
        step = options.speed ?? 12,
        axis = options.axis ?? 'y';
    let speed = 0,
        frame = 0;

    function autoScroll() {
        if (!dragging.value) return;
        const box = options.scroll?.();
        if (box) box.scrollTop += speed;
        frame = requestAnimationFrame(autoScroll);
    }

    function start(key: string, event: DragEvent) {
        if ((options.enabled && !options.enabled()) || !event.dataTransfer) {
            event.preventDefault();
            return;
        }
        dragging.value = key;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', key);
        frame = requestAnimationFrame(autoScroll);
    }

    function over(key: string, event: DragEvent) {
        if (!dragging.value) return;
        event.preventDefault();
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
        dropKey.value = key;
        dropPosition.value =
            axis === 'x'
                ? event.clientX < bounds.left + bounds.width / 2
                    ? 'before'
                    : 'after'
                : event.clientY < bounds.top + bounds.height / 2
                  ? 'before'
                  : 'after';
        const box = options.scroll?.(),
            view = box?.getBoundingClientRect();
        speed = !view
            ? 0
            : event.clientY < view.top + edge
              ? -step
              : event.clientY > view.bottom - edge
                ? step
                : 0;
    }

    function end() {
        dragging.value = '';
        dropKey.value = '';
        speed = 0;
        cancelAnimationFrame(frame);
    }

    /** 最终下标按「先移除被拖项」的列表计算，正好等于移动完成后所在的位置。 */
    function resolve(key: string, targetKey: string, position: DropPosition) {
        const keys = options.keys(),
            from = keys.indexOf(key);
        if (from < 0 || key === targetKey) return null;
        const remaining = keys.filter((item) => item !== key),
            index = remaining.indexOf(targetKey);
        if (index < 0) return null;
        return { from, to: index + Number(position === 'after'), targetKey, position };
    }

    function drop(event?: DragEvent, key?: string) {
        event?.preventDefault();
        const source = dragging.value,
            targetKey = key ?? dropKey.value,
            position = dropPosition.value;
        end();
        if (!source || !targetKey || source === targetKey) return;
        const move = resolve(source, targetKey, position);
        if (move && move.to !== move.from) options.onMove({ key: source, ...move });
    }

    /** 方向键移动：换算成相对相邻项的落位，供键盘操作使用。 */
    function moveBy(key: string, offset: number) {
        const keys = options.keys(),
            from = keys.indexOf(key),
            to = from + offset;
        if (from < 0 || to < 0 || to >= keys.length) return;
        const remaining = keys.filter((item) => item !== key);
        options.onMove({
            key,
            from,
            to,
            targetKey: remaining[offset < 0 ? to : to - 1],
            position: offset < 0 ? 'before' : 'after',
        });
    }

    function state(key: string) {
        return {
            'is-dragging': dragging.value === key,
            'drop-before':
                dropKey.value === key && dragging.value !== key && dropPosition.value === 'before',
            'drop-after':
                dropKey.value === key && dragging.value !== key && dropPosition.value === 'after',
        };
    }

    onBeforeUnmount(end);
    return { dragging, dropKey, dropPosition, start, over, drop, end, moveBy, state };
}
