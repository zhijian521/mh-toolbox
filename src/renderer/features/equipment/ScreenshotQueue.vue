<script setup lang="ts">
import type { ShotItem } from './use-ocr-queue';

/**
 * 已加入队列的截图：一排缩略图，正在看的那张描金边，识别失败的描红。
 *
 * 角标直接写在图上（识别中 62% / 等待识别 / 识别失败 / 待补充），一眼扫过去就知道
 * 整批里哪张还要处理，不用逐张点开。
 */
defineProps<{ items: ShotItem[]; selectedId: string }>();
const emit = defineEmits<{
    select: [id: string];
    remove: [item: ShotItem];
    drop: [event: DragEvent];
}>();
</script>

<template>
    <ul class="shot-queue" @dragover.prevent @drop="emit('drop', $event)">
        <li
            v-for="(item, index) in items"
            :key="item.id"
            class="shot-thumb"
            :class="{ on: item.id === selectedId, bad: item.status === 'error' }"
        >
            <button
                type="button"
                class="shot-pick"
                :aria-label="'查看第 ' + (index + 1) + ' 张截图'"
                @click="emit('select', item.id)"
            >
                <img :src="item.image" alt="" />
                <span v-if="item.status === 'running'" class="shot-badge">
                    识别中 {{ item.progress }}%
                </span>
                <span v-else-if="item.status === 'queued'" class="shot-badge">等待识别</span>
                <span v-else-if="item.status === 'error'" class="shot-badge bad">识别失败</span>
                <span v-else-if="item.error" class="shot-badge warn">待补充</span>
            </button>
            <button
                type="button"
                class="shot-remove"
                :aria-label="'移除第 ' + (index + 1) + ' 张截图'"
                @click="emit('remove', item)"
            >
                ×
            </button>
        </li>
    </ul>
</template>

<style scoped>
.shot-queue {
    display: flex;
    gap: 8px;
    margin: 14px 0 0;
    padding: 0 0 4px;
    list-style: none;
    overflow-x: auto;
}
.shot-thumb {
    position: relative;
    flex: none;
    width: 108px;
}
.shot-pick {
    position: relative;
    display: block;
    width: 100%;
    height: 72px;
    padding: 0;
    border: 1px solid var(--line-2);
    border-radius: 3px;
    overflow: hidden;
    background: var(--panel-3);
}
.shot-thumb.on .shot-pick {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
}
.shot-thumb.bad .shot-pick {
    border-color: color-mix(in srgb, var(--red) 55%, var(--line-2));
}
.shot-pick img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top left;
}
/*
 * 这几处底色故意不跟主题：角标和删除按钮叠在用户的游戏截图上看，
 * 截图本身的明暗不可控，浮层只有固定深底浅字才保证在任何截图上都读得出来。
 */
.shot-badge {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 1px 4px;
    background: #2f2a24bf;
    color: #f6f1e7;
    font-size: 10.5px;
    text-align: center;
}
.shot-badge.bad {
    background: #a4342bbf;
}
.shot-badge.warn {
    background: #8a6d1fbf;
}
.shot-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: #2f2a24b3;
    color: #f6f1e7;
    font-size: 13px;
    line-height: 1;
}
.shot-remove:hover {
    background: var(--red);
}
</style>
