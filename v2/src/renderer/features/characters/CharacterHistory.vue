<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { GrowthEntry } from '../../app/types';
import AppIcon from '../../components/AppIcon.vue';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import NumberValue from '../../components/NumberValue.vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
const props = defineProps<{ characterId: string }>();
const emit = defineEmits<{ close: [] }>();
const app = useApplication();
const selected = ref(props.characterId),
    preset = ref('all'),
    from = ref(''),
    to = ref(''),
    page = ref(1);
const range = computed(() =>
    preset.value === 'custom' ? { from: from.value, to: to.value } : U.rangeFor(preset.value),
);
const entries = computed(() => {
    void app.data;
    return app.rules().characterGrowthHistory(selected.value, range.value);
});
const pages = computed(() => Math.max(1, Math.ceil(entries.value.length / 12)));
// Deleting records (or another window's write) can shrink the result set below the current page,
// which would otherwise leave `page` past the end and render an empty list with a "3 / 1" label.
watch(pages, (total) => {
    if (page.value > total) page.value = total;
});
const visible = computed(() => entries.value.slice((page.value - 1) * 12, page.value * 12));
watch([selected, preset, from, to], () => {
    page.value = 1;
});
const labels: Record<string, string> = {
    added: '新增',
    removed: '移除',
    recorded: '补录',
    cleared: '清空',
    increase: '提升',
    decrease: '调低',
    changed: '调整',
};
const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((character) => ({ value: character.id, label: character.name })),
]);
const presetOptions = [
    { value: 'all', label: '全部' },
    { value: 'today', label: '本日' },
    { value: 'week', label: '本周' },
    { value: 'month', label: '本月' },
    { value: 'year', label: '本年' },
    { value: 'custom', label: '自定义' },
];
/* 备注与复制来源合并成一次记录上的说明，悬停图标查看，不再单占一行。 */
function contextOf(entry: GrowthEntry) {
    return [entry.source === 'copy' ? '复制自 ' + entry.sourceName : '', entry.note]
        .filter(Boolean)
        .join('\n');
}
</script>
<template>
    <BaseModal title="养成记录" wide @close="emit('close')">
        <div class="history-filters">
            <label class="filter-character">
                角色
                <BaseSelect v-model="selected" label="筛选角色" :options="characterOptions" />
            </label>
            <label class="filter-range">
                日期范围
                <BaseSelect v-model="preset" label="日期范围" :options="presetOptions" />
            </label>
            <template v-if="preset === 'custom'">
                <label class="filter-date">
                    开始日期
                    <BaseDate v-model="from" label="开始日期" :max="to || U.today()" />
                </label>
                <label class="filter-date">
                    结束日期
                    <BaseDate v-model="to" label="结束日期" :min="from" :max="U.today()" />
                </label>
            </template>
        </div>
        <p class="hint history-count">共 {{ entries.length }} 次变更</p>
        <div v-if="!entries.length" class="empty compact-empty">
            还没有养成记录。下次修改并保存养成数值后，会自动出现在这里。
        </div>
        <article
            v-for="entry in visible"
            :key="entry.id"
            class="history-entry"
            :aria-label="entry.characterName + '的养成变化'"
        >
            <ul>
                <li v-for="(change, index) in entry.changes" :key="index">
                    <time v-if="index === 0" class="history-date" :datetime="entry.date">
                        {{ entry.date }}
                    </time>
                    <span v-else class="history-date" aria-hidden="true"></span>
                    <span class="history-character" :title="entry.characterName">
                        {{ entry.characterName }}
                    </span>
                    <span class="history-label">
                        <small>{{ change.group }}</small>
                        {{ change.label }}
                    </span>
                    <span class="history-values">
                        <span v-if="change.kind === 'added'" class="hint">未添加</span>
                        <NumberValue
                            v-else
                            :value="change.from ?? '未记录'"
                            :unit="typeof change.from === 'number' ? change.unit : ''"
                        />
                        <span class="hint">→</span>
                        <span v-if="change.kind === 'removed'" class="hint">已移除</span>
                        <NumberValue
                            v-else
                            :value="change.to ?? '未记录'"
                            :unit="typeof change.to === 'number' ? change.unit : ''"
                        />
                    </span>
                    <span class="history-kind" :class="{ positive: change.kind === 'increase' }">
                        {{ labels[change.kind] || '调整' }}
                        <b v-if="change.kind === 'increase'">
                            +{{ Number(change.to) - Number(change.from) }}
                        </b>
                    </span>
                    <span v-if="index === 0 && contextOf(entry)" class="history-context">
                        <span
                            :title="contextOf(entry)"
                            tabindex="0"
                            role="img"
                            :aria-label="contextOf(entry)"
                        >
                            <AppIcon name="book" :size="13" />
                        </span>
                    </span>
                </li>
            </ul>
        </article>
        <div v-if="entries.length" class="pagination">
            <button class="btn compact" :disabled="page === 1" @click="page--">上一页</button>
            <span>{{ page }} / {{ pages }}</span>
            <button class="btn compact" :disabled="page === pages" @click="page++">下一页</button>
        </div>
        <template #footer="{ close }">
            <p class="hint footer-hint">保存档案时自动记录养成变化；首次建档作为起点。</p>
            <button class="btn" @click="close">关闭</button>
        </template>
    </BaseModal>
</template>

