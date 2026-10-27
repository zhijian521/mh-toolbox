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

<style scoped>
.page-header {
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    padding: 10px 20px;
    flex-wrap: wrap;
    background: var(--paper);
    border-bottom: 1px solid var(--line);
    flex: none;
}
.page-header-heading {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    min-width: 0;
}
.page-header h1 {
    line-height: 1.4;
    flex: none;
}
.page-header-description {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.4;
    min-width: 0;
    padding-bottom: 2px;
}
.page-header-actions {
    margin-left: auto;
}
</style>
