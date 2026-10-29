<script setup lang="ts">
import type { LiveEntry } from './use-live-sessions';

defineProps<{ sessions: LiveEntry[]; busy: boolean }>();
const emit = defineEmits<{
    start: [];
    backfill: [];
    adjust: [id?: string];
    stopOne: [id: string];
    stopAll: [];
}>();

/** 「调整开始时间」这颗按钮调的是最早那一段，带 id 的才是某一颗号。 */
const adjustAll = () => emit('adjust');
</script>

<template>
    <ul v-if="sessions.length" class="live-list">
        <li v-for="item in sessions" :key="item.id" class="live">
            <span class="dot" aria-hidden="true"></span>
            <button
                type="button"
                class="live-name"
                :disabled="busy"
                title="调整这个号的开始时间"
                @click="emit('adjust', item.id)"
            >
                {{ item.name }}
            </button>
            <span class="live-time">{{ item.elapsed }}</span>
            <button
                type="button"
                class="live-stop"
                :disabled="busy"
                :aria-label="'结束 ' + item.name + ' 的计时'"
                :title="'结束 ' + item.name + '，其余角色继续计时'"
                @click="emit('stopOne', item.id)"
            >
                ✕
            </button>
        </li>
    </ul>
    <button class="btn" :disabled="busy" @click="emit('backfill')">补在线时长</button>
    <button v-if="sessions.length" class="btn" :disabled="busy" @click="adjustAll">
        调整开始时间
    </button>
    <button class="btn primary" :disabled="busy" @click="emit('start')">
        {{ sessions.length ? '＋ 加入角色' : '▶ 开始游戏' }}
    </button>
    <button v-if="sessions.length" class="btn danger" :disabled="busy" @click="emit('stopAll')">
        ■ 全部结束
    </button>
</template>

<style scoped>
/*
 * 多根节点：这几颗按钮要直接落在页头的 `.actions` 里，跟着它一起换行与排布。
 * 套一层容器会多出一层 flex，间距与换行位置都会变。
 */
.live-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}
.live {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 5px 3px 8px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: var(--paper-2);
    color: var(--muted);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
}
.live .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--red);
    animation: live-pulse 1.6s ease-in-out infinite;
}
/* 名字就是「改这个号的开始时间」的入口：按时长挨着放，点哪个改哪个。 */
.live-name {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: color 110ms ease;
}
.live-name:hover:not(:disabled) {
    color: var(--gold);
}
.live-time {
    color: var(--muted);
}
.live-stop {
    padding: 0 3px;
    border: 0;
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
    transition: color 110ms ease;
}
.live-stop:hover:not(:disabled) {
    color: var(--red);
}
@keyframes live-pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.25;
    }
}
</style>
