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

<style scoped>
.number-value {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.number-value b {
    font-weight: 600;
}
.number-value small {
    color: var(--muted);
    font-weight: 400;
    font-size: 11.5px;
}
.number-value.unknown {
    color: #9a917e;
}
.number-value.unknown b {
    font-weight: 400;
}
</style>
