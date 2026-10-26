<script setup lang="ts">
defineProps<{ value: number | string | null | undefined; unit?: string }>();
</script>
<template>
    <span class="number-value" :class="{ unknown: value == null || value === '' }">
        <b>
            {{
                value == null || value === ''
                    ? '—'
                    : typeof value === 'number'
                      ? value.toLocaleString('zh-CN')
                      : value
            }}
        </b>
        <small v-if="value != null && value !== '' && unit">{{ unit }}</small>
    </span>
</template>
