<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const paths: Record<string, string> = {
    user: 'M20 21v-2a7 7 0 0 0-14 0v2M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    book: 'M4 3h13l3 3v15H4zM8 8h7M8 12h8M8 16h5',
    chart: 'M4 3v17h17M8 16v-5m5 5V6m5 10v-7',
    bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
    target: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l9-9m-5 0h5v5',
    sword: 'm4 20 3-3m-4-3 7 7m-3-7L17 3h4v4L10 18',
    coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 7v9M9 9.5 12 12.5l3-3M9 13.5h6',
    pet: 'M6.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4M10.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4M14.5 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18.5 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4M12 20c2.8 0 5-1.8 5-4 0-1.7-2-3-5-3s-5 1.3-5 3c0 2.2 2.2 4 5 4',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-5 0v6',
    edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14z',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    calendar: 'M4 5h16v16H4zM8 2v6m8-6v6M4 10h16m-12 4h2m4 0h2m-8 3h2',
    grip: 'M9 4h.01M15 4h.01M9 9h.01M15 9h.01M9 14h.01M15 14h.01M9 19h.01M15 19h.01',
    'panel-expand': 'M3 4h18v16H3zM9 4v16M13 9l3 3-3 3',
    'panel-collapse': 'M3 4h18v16H3zM9 4v16M16 9l-3 3 3 3',
    'window-minimize': 'M5 12h14',
    'window-maximize': 'M5 5h14v14H5z',
    'window-restore': 'M8 8h11v11H8zM5 15V5h10',
    'window-close': 'M5 5l14 14M5 19 19 5',
    close: 'm6 6 12 12M6 18 18 6',
    'chevron-down': 'm6 9 6 6 6-6',
    'chevron-up': 'm18 15-6-6-6 6',
    'chevron-left': 'm14 5-7 7 7 7',
    'chevron-right': 'm10 5 7 7-7 7',
    check: 'm4 12 6 6L20 6',
};
</script>
<template>
    <svg
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="name === 'grip' ? 3 : 1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path :d="paths[name] || paths.book" />
    </svg>
</template>
