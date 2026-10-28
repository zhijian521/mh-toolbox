<script setup lang="ts">
defineProps<{ value: number | string | null | undefined; unit?: string }>();

/**
 * 数字展示入口：最多两位小数。
 *
 * 领域里不少值是算出来的（目标进度按角色平均、时长按秒折算），直接交给
 * `toLocaleString()` 会带出 3 位小数甚至一长串尾巴，界面上统一收在这里。
 */
function show(value: number) {
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
</script>
<template>
    <span class="number-value" :class="{ unknown: value == null || value === '' }">
        <b>
            {{
                value == null || value === ''
                    ? '—'
                    : typeof value === 'number'
                      ? show(value)
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
    color: color-mix(in srgb, var(--muted) 78%, var(--paper));
}
.number-value.unknown b {
    font-weight: 400;
}
</style>
