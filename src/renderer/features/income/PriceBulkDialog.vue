<script setup lang="ts">
import { ref } from 'vue';
import { useApplication } from '../../stores/application';
import { desktop } from '../../services/desktop';
import { quickItems } from '../../game-data/quick-items.js';
import BaseModal from '../../components/BaseModal.vue';

/**
 * 批量设价：把固定价物品的单价表导出成 CSV，在表格软件里一次改完再导回来。
 *
 * 存在的理由很实际：固定价组有四十个物品，逐个右键改价要开四十次弹窗。
 * 单价本身没有历史、没有关联，只是一张「物品 id → 参考价」的表，天然适合表格编辑。
 *
 * 规则只有两条，但都容易猜错，所以写在界面上：
 * 留空 = 这个物品不改（从导出文件里删掉几个数再导回来，不会把价抹掉）；
 * 填 0 = 清除这个物品的单价（回到「未设价」，下次点它时会先问价）。
 */
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();
const busy = ref(false);
const error = ref('');
const result = ref<{
    updated: number;
    cleared: number;
    skipped: number;
    problems: string[];
} | null>(null);

async function exportCsv() {
    if (busy.value || app.busy) return;
    error.value = '';
    busy.value = true;
    try {
        const today = new Date().toISOString().slice(0, 10);
        const saved = await desktop().saveTextFile(rules.itemPriceCsv(), {
            title: '导出单价表',
            defaultName: '物品单价-' + today + '.csv',
            filterName: 'CSV 表格',
            ext: 'csv',
        });
        if (saved.canceled) return;
        if (!saved.ok) error.value = saved.error || '导出失败';
        else app.notify('单价表已导出，用表格软件打开就能批量改');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    } finally {
        busy.value = false;
    }
}

async function importCsv() {
    if (busy.value || app.busy) return;
    error.value = '';
    result.value = null;
    busy.value = true;
    try {
        const picked = await desktop().openTextFile({
            title: '导入单价表',
            filterName: 'CSV 表格',
            ext: 'csv',
        });
        if (picked.canceled) return;
        if (!picked.ok) {
            error.value = picked.error || '读取失败';
            return;
        }
        const outcome = await app.execute((domain) =>
            domain.importItemPriceCsv(String(picked.text || '')),
        );
        result.value = outcome;
        if (outcome.updated || outcome.cleared) {
            app.notify(
                '单价已更新 ' +
                    outcome.updated +
                    ' 个' +
                    (outcome.cleared ? '、清除 ' + outcome.cleared + ' 个' : ''),
            );
            emit('saved');
        }
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    } finally {
        busy.value = false;
    }
}
</script>
<template>
    <BaseModal title="批量设价" :busy="app.busy || busy" @close="emit('close')">
        <p class="hint">
            固定价物品共 {{ quickItems.length }} 个，导出成 CSV 后在表格里一次改完，再导回来。
            只处理「固定价格」这一组——不固定价格的物品本来就每次现填，不存单价。
        </p>
        <ul class="rule-list">
            <li>
                <b>单价留空</b>
                ：这个物品保持原样，不会被清掉。
            </li>
            <li>
                <b>单价填 0</b>
                ：清除这个物品的单价，回到「未设价」。
            </li>
            <li>
                <b>单位是万</b>
                ：填
                <code>1.5</code>
                表示 1.5 万，和速记卡片上显示的一致。
            </li>
        </ul>
        <div class="bulk-actions">
            <button class="btn" type="button" :disabled="busy || app.busy" @click="exportCsv">
                导出单价表
            </button>
            <button class="btn" type="button" :disabled="busy || app.busy" @click="importCsv">
                导入单价表
            </button>
        </div>
        <div v-if="result" class="result" role="status">
            <p>
                已更新
                <b>{{ result.updated }}</b>
                个
                <template v-if="result.cleared">
                    · 清除
                    <b>{{ result.cleared }}</b>
                    个
                </template>
                <template v-if="result.skipped">
                    · 跳过
                    <b>{{ result.skipped }}</b>
                    行
                </template>
            </p>
            <ul v-if="result.problems.length" class="problem-list">
                <li v-for="line in result.problems" :key="line">{{ line }}</li>
            </ul>
        </div>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" @click="close">关闭</button>
        </template>
    </BaseModal>
</template>
<style scoped>
.rule-list {
    margin: 12px 0 14px;
    padding-left: 18px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.85;
}
.rule-list b {
    color: var(--ink);
    font-weight: 500;
}
.rule-list code {
    padding: 0 4px;
    border-radius: 3px;
    background: var(--paper-2);
    font-size: 12px;
}
.bulk-actions {
    display: flex;
    gap: 10px;
    margin-top: 4px;
}
.result {
    margin-top: 14px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
    font-size: 12.5px;
    color: var(--muted);
}
.result b {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
}
.problem-list {
    margin: 6px 0 0;
    padding-left: 18px;
    color: var(--red);
    font-size: 12px;
    line-height: 1.7;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
