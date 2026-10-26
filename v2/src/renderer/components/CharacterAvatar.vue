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
