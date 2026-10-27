<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ name: string }>();
const initial = computed(() => Array.from(props.name.trim())[0] || '梦');
</script>

<template>
    <span class="character-avatar" aria-hidden="true">
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
        <span class="avatar-seal">梦</span>
    </span>
</template>

<style scoped>
.character-avatar {
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
    color: var(--gold);
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
.avatar-seal {
    position: absolute;
    right: 5px;
    bottom: 5px;
    display: grid;
    place-items: center;
    width: 13px;
    height: 15px;
    border: 1px solid var(--red);
    border-radius: 2px;
    background: var(--paper);
    color: var(--red);
    font-size: 10px;
    line-height: 1;
}
@media (max-width: 1150px) {
    .character-avatar {
        width: 44px;
        height: 44px;
    }
    .avatar-initial {
        font-size: 24px;
    }
}
</style>
