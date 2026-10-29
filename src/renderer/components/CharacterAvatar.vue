<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        name: string;
        /** sm 用在装备页顶部那排角色卡，md 是角色页名片。 */
        size?: 'sm' | 'md';
        /**
         * 右下角那枚小印的字。传空串就不画——28px 以下那枚印只剩一团墨，
         * 不如把位置让给首字。
         */
        seal?: string;
        /** 覆盖山水与小印的颜色；装备格子用它对齐「练到什么程度」的色调。 */
        tone?: string;
    }>(),
    { size: 'md', seal: '梦', tone: '' },
);

const initial = computed(() => Array.from(props.name.trim())[0] || '梦');
const palette = computed(() =>
    props.tone ? { '--avatar-ink': props.tone, '--avatar-seal': props.tone } : undefined,
);
</script>

<template>
    <span
        class="character-avatar"
        :class="['size-' + size, { 'has-seal': !!seal }]"
        :style="palette"
        :title="name"
        aria-hidden="true"
    >
        <svg class="avatar-landscape" viewBox="0 0 56 56" fill="none">
            <circle cx="39" cy="15" r="6" fill="currentColor" opacity="0.12" />
            <path
                d="M2 43 15 28l9 11 9-17 21 24M6 48l12-12 9 10 11-9 14 12"
                stroke="currentColor"
                stroke-width="1"
                stroke-linejoin="round"
                opacity="0.24"
            />
            <path d="M5 50h46" stroke="currentColor" opacity="0.18" />
        </svg>
        <span class="avatar-initial">{{ initial }}</span>
        <span v-if="seal" class="avatar-seal">{{ seal }}</span>
    </span>
</template>

<style scoped>
.character-avatar {
    /* 两个可覆盖的色：山水一笔与角印，装备格子按色调传进来，角色页保持金 + 红。 */
    --avatar-ink: var(--gold);
    --avatar-seal: var(--red);
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 52px;
    height: 52px;
    overflow: hidden;
    border: 1px solid var(--line-2);
    border-radius: 6px;
    color: var(--avatar-ink);
    background: var(--paper-2);
    box-shadow: inset 0 0 0 3px var(--paper);
}
.avatar-landscape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}
.avatar-initial {
    position: relative;
    margin-top: -6px;
    color: var(--ink);
    font-size: 26px;
    line-height: 1;
}
/*
 * 有角印时首字往左上让一让。53px 的框里，居中放的大字右下角正好压在印上——
 * 「黑」的那一捺与「盔」挤在一起，两团墨谁都不清楚。
 */
.has-seal .avatar-initial {
    margin-right: 5px;
}
.avatar-seal {
    position: absolute;
    right: 5px;
    bottom: 5px;
    display: grid;
    place-items: center;
    width: 13px;
    height: 15px;
    border: 1px solid var(--avatar-seal);
    border-radius: 2px;
    background: var(--paper);
    color: var(--avatar-seal);
    font-size: 10px;
    line-height: 1;
}
/* 28px 那档：去掉内描边那圈纸色、缩小首字，印留到 9px 才不至于糊成一团墨。 */
.character-avatar.size-sm {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 2px var(--paper);
}
.size-sm .avatar-initial {
    margin-top: -3px;
    font-size: 15px;
}
.size-sm.has-seal .avatar-initial {
    margin-right: 3px;
}
.size-sm .avatar-seal {
    right: 2px;
    bottom: 2px;
    width: 9px;
    height: 10px;
    border-radius: 1px;
    font-size: 7px;
}
@media (max-width: 1150px) {
    .character-avatar.size-md {
        width: 44px;
        height: 44px;
    }
    .size-md .avatar-initial {
        font-size: 24px;
    }
}
</style>
