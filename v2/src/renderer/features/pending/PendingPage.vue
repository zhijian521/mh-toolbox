<script setup lang="ts">
import AppIcon from '../../components/AppIcon.vue';
defineProps<{ title: string; icon: string }>();
</script>

<template>
    <header class="page-header">
        <div>
            <h1>{{ title }}</h1>
            <p>此模块将在后续阶段迁移</p>
        </div>
        <span class="page-status">待迁移</span>
    </header>
    <section class="empty pending-page" :aria-label="title + '页面'">
        <div class="pending-page-icon"><AppIcon :name="icon" :size="30" /></div>
        <h2>功能迁移中</h2>
        <p>{{ title }}页面已预留，后续将在这里接入功能。</p>
    </section>
</template>
