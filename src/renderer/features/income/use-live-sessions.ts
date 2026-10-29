import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Domain } from '../../app/types';
import { U } from '../../domain/util.js';
import type { useApplication } from '../../stores/application';

type AppStore = ReturnType<typeof useApplication>;

/** 刚结束的一段计时，用来在提示里报时长与点卡。 */
export interface StoppedSession {
    characterId: string;
    startAt: number;
    endAt: number;
    minutes: number;
    cost: number;
}

/** 顶部那条「谁在线、各自多久」的一行。 */
export interface LiveEntry {
    id: string;
    characterId: string;
    name: string;
    elapsed: string;
}

/**
 * 收益页的计时部分：谁在线、各自多久、起停与结算。
 *
 * 单独抽出来不是为了少几行代码，而是因为这几件事共享同一份时钟状态：秒表每秒钟
 * 走一次、统计每十秒算一次、开始与结束的瞬间两者都要立刻对一次。留在页面里它们
 * 会和速记、筛选、统计口径穿插在一起，改一处得先读完六百行。页面只留接线。
 *
 * `syncAccount` / `remember` / `restore` 由页面传入：它们同时服务于速记侧，而且
 * 焦点回落要知道页面上还有哪些入口。
 */
export function useLiveSessions(options: {
    app: AppStore;
    rules: Domain;
    syncAccount: (dates: string[]) => Promise<void>;
    remember: () => void;
    restore: () => void;
}) {
    const { app, rules, syncAccount, remember, restore } = options;

    /** 正在计时的会话；秒表与统计分别按自己的节拍刷新。 */
    const actives = computed(() => {
        void app.data;
        return rules.runningSessions();
    });
    /** 秒表用的时钟：只让「00:12:34」走字，不触发任何统计计算。 */
    const now = ref(Date.now());
    /** 统计节拍：`earningsStats` 要遍历全部流水与会话，每秒跑一遍纯属浪费，十秒一次足够。 */
    const statTick = ref(Date.now());
    let clock: ReturnType<typeof setInterval> | null = null;
    let statClock: ReturnType<typeof setInterval> | null = null;
    onMounted(() => {
        clock = setInterval(() => {
            if (actives.value.length) now.value = Date.now();
        }, 1000);
        statClock = setInterval(() => {
            if (actives.value.length) statTick.value = Date.now();
        }, 10000);
    });
    onBeforeUnmount(() => {
        if (clock) clearInterval(clock);
        if (statClock) clearInterval(statClock);
    });
    watch(actives, () => {
        // 开始/结束计时的瞬间要立刻对一次，不能等下一个十秒。
        now.value = Date.now();
        statTick.value = Date.now();
    });

    const pad2 = (value: number) => String(value).padStart(2, '0');
    function elapsedOf(startAt?: number) {
        const start = Number(startAt) || 0;
        if (!start) return '00:00:00';
        const diff = Math.max(0, now.value - start);
        return (
            pad2(Math.floor(diff / 3600000)) +
            ':' +
            pad2(Math.floor(diff / 60000) % 60) +
            ':' +
            pad2(Math.floor(diff / 1000) % 60)
        );
    }
    /**
     * 顶部那条「谁在线、各自多久」。
     *
     * 错峰计时下每个号一段，所以这里是一个列表而不是一个秒表：先起一个号、中途再加
     * 两个号、最后分两次退出，全都在这条上直接操作。
     */
    const liveList = computed<LiveEntry[]>(() =>
        actives.value.map((session) => ({
            id: String(session.id),
            characterId: String(session.characterId || ''),
            name: rules.charName(String(session.characterId || '')),
            elapsed: elapsedOf(Number(session.startAt)),
        })),
    );

    const onlineMode = ref<'start' | 'backfill' | 'adjust' | null>(null);
    /** 调整开始时间时，改的是哪一段计时。 */
    const adjustingId = ref('');

    /**
     * 开始游戏 / 加入角色：先问这次上哪几个号、点卡什么价。
     *
     * 已经有号在计时时也能打开——弹窗只列出还没在线的角色，这正是「中途加两个号」。
     * 以前这里用 `if (active) return` 直接挡掉，于是只能是「一批同起同落」。
     */
    function startGame() {
        if (app.busy) return;
        remember();
        onlineMode.value = 'start';
    }
    /** 调整某一段的开始时间：点顶部那个号的时间，或者按钮默认调最早的一段。 */
    function openAdjust(id?: string) {
        if (app.busy || !actives.value.length) return;
        remember();
        adjustingId.value = id || String(actives.value[0].id);
        onlineMode.value = 'adjust';
    }
    /** 结束一个号：只结算这一段，其余角色继续各自计时。 */
    async function stopOne(id: string) {
        await stopSessions([id]);
    }
    /** 全部结束：一次结算所有在跑的段（同一批提交，失败整体回滚）。 */
    async function stopAll() {
        await stopSessions(actives.value.map((session) => String(session.id)));
    }
    /**
     * 结算若干段计时。
     *
     * 不再一段一个请求：`stopSessions` 在领域里一次 commit，退三个号要么都成功、
     * 要么整体回滚，不会出现「退了两个、第三个失败」之后账上只剩一半。
     */
    async function stopSessions(ids: string[]) {
        if (!ids.length || app.busy) return;
        try {
            const done = (await app.execute((domain) =>
                domain.stopSessions(ids),
            )) as unknown as StoppedSession[];
            const dates = new Set<string>();
            done.forEach((item) =>
                dayList(Number(item.startAt), Number(item.endAt)).forEach((date) =>
                    dates.add(date),
                ),
            );
            await syncAccount(Array.from(dates));
            app.notify(stopText(done));
        } catch (failure) {
            app.notify(failure instanceof Error ? failure.message : String(failure), true);
        }
    }
    /** 结算提示：单段点名报时长，多段只报合计，不足 1 分钟的段单独说清楚。 */
    function stopText(done: StoppedSession[]) {
        if (!done.length) return '这段不足 1 分钟，未产生点卡，计时已取消';
        const minutes = done.reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
        const cost = done.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
        const tail = ' · 点卡 −' + U.fmtMoney(cost) + '，账号收益已更新';
        if (done.length === 1)
            return (
                rules.charName(String(done[0].characterId)) +
                ' 在线 ' +
                U.fmtMinutes(Number(done[0].minutes)) +
                tail
            );
        return done.length + ' 段已结算 · 合计在线 ' + U.fmtMinutes(minutes) + tail;
    }
    /** 一段计时覆盖的日期，跨夜时拆成多天；上限 8 天纯粹是防坏数据。 */
    function dayList(from: number, to: number) {
        const list: string[] = [];
        let cursor = U.fmtDate(new Date(from || Date.now()));
        const end = U.fmtDate(new Date(to || Date.now()));
        while (cursor <= end && list.length < 8) {
            list.push(cursor);
            cursor = U.addDays(cursor, 1);
        }
        return list;
    }
    /** 补记在线时长、回拨开始时间之后，涉及的那几天都要重新同步。 */
    async function onlineSaved(dates: string[]) {
        const wasStart = onlineMode.value === 'start';
        onlineMode.value = null;
        if (wasStart) now.value = Date.now();
        await syncAccount(dates || []);
        await nextTick();
        restore();
    }

    return {
        statTick,
        liveList,
        onlineMode,
        adjustingId,
        startGame,
        openAdjust,
        stopOne,
        stopAll,
        onlineSaved,
    };
}
