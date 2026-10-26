<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
    <header class="page-header">
        <div class="page-header-heading">
            <h1>{{ title }}</h1>
            <p v-if="description" class="page-header-description">{{ description }}</p>
        </div>
        <div v-if="$slots.actions" class="page-header-actions actions">
            <slot name="actions" />
        </div>
    </header>
</template>
