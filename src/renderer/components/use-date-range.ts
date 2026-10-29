import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import type { DateRangeValue } from '../app/types';
import { U } from '../domain/util.js';

/** 会跟着「今天」走的预设；`custom`（手改过日期）与 `all` 保持原样。 */
const ROLLING = ['today', 'week', 'month', 'year'];

/**
 * 带预设的日期区间，跨过零点 / 跨周 / 跨月会自动跟上。
 *
 * 页面原本只在 setup 里算一次 `U.rangeFor`，桌面端常驻过夜之后「本日」还停在昨天：
 * 新记的速记按今天的日期落盘，界面却筛着昨天，看着像刚记的东西丢了；月初更明显，
 * 新月份的账在「本月」里查不到。这里每分钟对一次系统日期，只在预设区间真的变了
 * （跨天、跨周、跨月、跨年）时才替换，用户手改过日期（`preset === 'custom'`）
 * 就完全不动，不会把正在看的区间跳走。
 *
 * 除了定时轮询还听 `visibilitychange` 与 `focus`：笔记本地合上盖子再打开，定时器
 * 可能被节流，回前台这一刻必须立刻对一次。
 *
 * @param preset 初始预设，与 `RangeFilter` 的取值一致（today / week / month / ...）
 */
export function useDateRange(preset: string): Ref<DateRangeValue> {
    const initial = U.rangeFor(preset);
    const range = ref<DateRangeValue>({ preset, from: initial.from, to: initial.to });
    function sync() {
        const key = String(range.value.preset || '');
        if (!ROLLING.includes(key)) return;
        const next = U.rangeFor(key);
        if (next.from === range.value.from && next.to === range.value.to) return;
        range.value = { preset: key, from: next.from, to: next.to };
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    const onForeground = () => {
        if (!document.hidden) sync();
    };
    onMounted(() => {
        timer = setInterval(sync, 60_000);
        document.addEventListener('visibilitychange', onForeground);
        window.addEventListener('focus', onForeground);
    });
    onBeforeUnmount(() => {
        if (timer) clearInterval(timer);
        document.removeEventListener('visibilitychange', onForeground);
        window.removeEventListener('focus', onForeground);
    });
    return range;
}
