<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const paths: Record<string, string> = {
    user: 'M20 21v-2a7 7 0 0 0-14 0v2M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    book: 'M4 3h13l3 3v15H4zM8 8h7M8 12h8M8 16h5',
    chart: 'M4 3v17h17M8 16v-5m5 5V6m5 10v-7',
    bolt: 'm13 2-9 12h7l-1 8 10-13h-7z',
    target: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l9-9m-5 0h5v5',
    /*
     * 只留一把剑：装备空状态页那张大图标还在用。部位小图标已经整体换成了
     * 头像式的方块（名字首字 + 部位角印），这里不再需要 12 个部位剪影。
     */
    sword: 'M20.5 3.5 21 8l-8.4 8.4-2.1-2.1L18.9 6zM7.6 13.6l2.8 2.8M9 15l-4 4M5 19h.01',
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
    // 外部链接：方框缺口处引出一支箭头，13px 下也能读出「会跳出去」。
    external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
    /*
     * 导入导出：一支箭头 + 一道落盘短线，两笔就说完。
     * 之前是「纸 + 折角 + 箭头」，16px 下折角糊成一团黑点；托盘造型又只剩一根横线，
     * 读起来像排序。现在箭头占满高度、短线短而居中，两枚只差方向，成对看就是进出。
     */
    download: 'M12 3.5v10m-4.5-4.5 4.5 4.5 4.5-4.5M5 19.5h14',
    upload: 'M12 16.5V6m-4.5 4.5L12 6l4.5 4.5M5 19.5h14',
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
