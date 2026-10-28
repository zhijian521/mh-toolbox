<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const paths: Record<string, string> = {
    user: 'M20 21v-2a7 7 0 0 0-14 0v2M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    book: 'M4 3h13l3 3v15H4zM8 8h7M8 12h8M8 16h5',
    chart: 'M4 3v17h17M8 16v-5m5 5V6m5 10v-7',
    bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
    target: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l9-9m-5 0h5v5',
    sword: 'm4 20 3-3m-4-3 7 7m-3-7L17 3h4v4L10 18',
    // 装备部位：与 sword 同一套细线风格。18px 下靠外轮廓辨认，不画内部纹理。
    helmet: 'M4 15a8 8 0 0 1 16 0v3H4zM9 15v-3m6 3v-3',
    necklace: 'M5 4a9 9 0 0 0 14 0M12 13l3 4-3 4-3-4z',
    armor: 'M8 3 4 6v5l2 1v9h12v-9l2-1V6l-4-3-4 2z',
    belt: 'M3 8h18v8H3zM10 8v8M14 8v8',
    boots: 'M7 3v9l-3 3v6h9v-5l5-4V9',
    ring: 'M9 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10M9 9l3-6 3 6z',
    earring: 'M8 3a2.6 2.6 0 1 0 0 5.2A2.6 2.6 0 0 0 8 3M8 8.2V12a4 4 0 0 0 8 0',
    bracelet: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    pendant: 'M12 3v5M8 8h8l2 5-6 8-6-8z',
    'jade-yang':
        'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9M8 8l8 8',
    'jade-yin':
        'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9M7.5 12h9',
    archive: 'M3 7h18v4H3zM5 11v9h14v-9M9 15h6',
    // 铜钱：外圆内方，20px 下也能认出是「币」，不像字符笔画那样糊成一团。
    coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9.5 9.5h5v5h-5z',
    // 点卡：卡片轮廓 + 磁条。
    card: 'M3 6h18v12H3zM3 10h18M7 14.5h4',
    // 爪印：三个脚趾加掌垫，比四个小圆点更清楚。
    pet: 'M7.5 11a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4M12 9.4a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4M16.5 11a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4M12 20c2.7 0 4.8-1.8 4.8-3.9 0-1.8-2.1-3.1-4.8-3.1s-4.8 1.3-4.8 3.1c0 2.1 2.1 3.9 4.8 3.9',
    settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-5 0v6',
    edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14z',
    trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    calendar: 'M4 5h16v16H4zM8 2v6m8-6v6M4 10h16m-12 4h2m4 0h2m-8 3h2',
    grip: 'M9 4h.01M15 4h.01M9 9h.01M15 9h.01M9 14h.01M15 14h.01M9 19h.01M15 19h.01',
    'panel-expand': 'M3 4h18v16H3zM9 4v16M13 9l3 3-3 3',
    'panel-collapse': 'M3 4h18v16H3zM9 4v16M16 9l-3 3 3 3',
    // 明暗切换：太阳与月亮同一套细线，18px 下靠轮廓分辨，不画光晕之类的小细节。
    sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z',
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
