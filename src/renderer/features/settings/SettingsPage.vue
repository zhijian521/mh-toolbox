<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import BaseModal from '../../components/BaseModal.vue';
import PageHeader from '../../components/PageHeader.vue';
import { useApplication } from '../../stores/application';
import { desktop, plain } from '../../services/desktop';
import type { AppData, ThemePreference } from '../../app/types';
const app = useApplication();
const importCandidate = ref<AppData | null>(null),
    confirmWipe = ref(false),
    localBusy = ref(false),
    error = ref('');
const busy = computed(() => app.busy || localBusy.value);
const counts = computed(() => [
    ['角色', app.data?.characters.length],
    ['收支记录', app.data?.transactions.length],
    ['目标', app.data?.goals.length],
    ['装备', app.data?.equipment.length],
]);
/*
 * 外观：偏好存在主进程（建窗口前就要知道），所以只能经桌面通道读写。
 * 切换后渲染层的 prefers-color-scheme 立刻变，light-dark() 跟着翻，页面不用重载。
 */
const theme = ref<ThemePreference>('auto');
const themeOptions: Array<{ value: ThemePreference; label: string }> = [
    { value: 'auto', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
];
onMounted(async () => {
    try {
        theme.value = (await desktop().getTheme()).theme;
    } catch {
        // 浏览器预览没有桌面通道，保留默认档即可，不做提示。
    }
});
async function chooseTheme(next: ThemePreference) {
    if (busy.value || theme.value === next) return;
    const previous = theme.value;
    // 先落到界面上：失败了再退回去，避免点了没反应的观感。
    theme.value = next;
    try {
        const state = await desktop().setTheme(next);
        theme.value = state.theme;
    } catch (failure) {
        theme.value = previous;
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
async function chooseImport() {
    if (busy.value) return;
    localBusy.value = true;
    error.value = '';
    try {
        const result = await desktop().importData();
        if (result.canceled) return;
        if (!result.ok) throw new Error(result.error);
        app.rules().validateBackup(result.data);
        importCandidate.value = app.rules().normalize(result.data);
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    } finally {
        localBusy.value = false;
    }
}
async function importBackup() {
    if (!importCandidate.value || busy.value) return;
    try {
        await app.execute((domain) => domain.replaceState(plain(importCandidate.value), 'import'));
        importCandidate.value = null;
        app.notify('备份已导入 V2');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
async function exportBackup() {
    if (busy.value) return;
    localBusy.value = true;
    try {
        const result = await desktop().exportData(plain(app.data!));
        if (!result.canceled) {
            if (!result.ok) throw new Error(result.error);
            app.notify('备份已导出');
        }
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    } finally {
        localBusy.value = false;
    }
}
async function wipe() {
    if (busy.value) return;
    try {
        await app.execute((domain) =>
            domain.replaceState({ characters: [], transactions: [] }, 'wipe'),
        );
        confirmWipe.value = false;
        app.notify('V2 数据已清空');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>
<template>
    <PageHeader title="设置" description="数据备份、导入与关于" />
    <div class="page-content settings-page">
        <section class="paper-section">
            <h2>外观</h2>
            <p>跟随系统时会随 Windows 的浅色 / 深色设置自动切换。</p>
            <div class="theme-choices" role="group" aria-label="外观主题">
                <button
                    v-for="option in themeOptions"
                    :key="option.value"
                    class="btn"
                    :class="{ selected: theme === option.value }"
                    :aria-pressed="theme === option.value"
                    :disabled="busy"
                    @click="chooseTheme(option.value)"
                >
                    {{ option.label }}
                </button>
            </div>
            <p class="hint">深色模式仍在逐页适配，个别页面可能还是浅色底。</p>
        </section>
        <section class="paper-section">
            <h2>数据概览</h2>
            <dl class="data-counts">
                <div v-for="[title, count] in counts" :key="title">
                    <dt>{{ title }}</dt>
                    <dd>{{ count }}</dd>
                </div>
            </dl>
        </section>
        <section class="paper-section">
            <h2>备份与恢复</h2>
            <p>数据仅保存在本机。可以导入当前版本导出的完整 JSON 备份，或导出 V2 数据留存。</p>
            <p class="hint">导入会替换 V2 当前数据，并在替换前自动保留本地副本。</p>
            <div class="actions">
                <button class="btn primary" :disabled="busy" @click="exportBackup">
                    导出 JSON 备份
                </button>
                <button class="btn" :disabled="busy" @click="chooseImport">导入 JSON 备份</button>
            </div>
        </section>
        <section class="paper-section">
            <h2>应用信息</h2>
            <dl class="info-list">
                <div>
                    <dt>版本</dt>
                    <dd>{{ app.info?.version }}</dd>
                </div>
                <div>
                    <dt>数据版本</dt>
                    <dd>{{ app.data?.schemaVersion }}</dd>
                </div>
                <div>
                    <dt>本地数据</dt>
                    <dd class="data-path">{{ app.info?.dataFile }}</dd>
                </div>
            </dl>
            <p class="hint">V2 使用独立数据目录，与当前版本分别保存。</p>
        </section>
        <section class="paper-section">
            <h2>清空数据</h2>
            <p>清空 V2 的角色及全部相关记录，建议先导出备份。</p>
            <button
                class="btn danger"
                :disabled="busy"
                @click="
                    confirmWipe = true;
                    error = '';
                "
            >
                清空 V2 数据
            </button>
        </section>
    </div>
    <BaseModal
        v-if="importCandidate"
        title="确认导入备份"
        :busy="busy"
        @close="importCandidate = null"
    >
        <p>
            将导入 {{ importCandidate.characters.length }} 个角色、{{
                importCandidate.transactions.length
            }}
            条收支记录、{{ importCandidate.equipment.length }} 件装备。
        </p>
        <p>这会替换 V2 当前数据。原备份文件保持完整。</p>
        <p v-if="importCandidate.activeSession" class="hint">
            备份包含未结束的在线计时，将保留记录，待收益模块迁移后处理。
        </p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="busy" @click="close">取消</button>
            <button class="btn primary" :disabled="busy" @click="importBackup">
                {{ busy ? '导入中…' : '确认导入 V2' }}
            </button>
        </template>
    </BaseModal>
    <BaseModal v-if="confirmWipe" title="清空 V2 数据" :busy="busy" @close="confirmWipe = false">
        <p>确定清空 V2 的全部角色、收益、在线记录、账号账本、目标及装备吗？</p>
        <p>操作前会在 V2 数据目录保留本地副本。</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="busy" @click="close">取消</button>
            <button class="btn danger" :disabled="busy" @click="wipe">
                {{ busy ? '清空中…' : '确认清空' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.settings-page {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    align-content: start;
    align-items: start;
}
.paper-section {
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper);
    min-width: 0;
}
.paper-section h2 {
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.paper-section h2:before {
    content: '';
    width: 3px;
    height: 14px;
    background: var(--red);
    flex: none;
}
.paper-section p {
    margin-bottom: 12px;
}
.paper-section .actions {
    margin-top: 18px;
}
.theme-choices {
    display: flex;
    gap: 8px;
    margin: 4px 0 12px;
}
.data-counts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-top: 20px;
}
.data-counts dt {
    font-size: 12px;
    color: var(--muted);
}
.data-counts dd {
    font-size: 27px;
    color: var(--gold);
    margin-top: 7px;
    font-variant-numeric: tabular-nums;
}
.info-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 15px;
}
.info-list > div {
    display: grid;
    grid-template-columns: 70px 1fr;
    gap: 8px;
}
.info-list dt {
    color: var(--muted);
}
.data-path {
    overflow-wrap: anywhere;
    font-size: 12px;
}
@media (max-width: 1150px) {
    .settings-page {
        grid-template-columns: 1fr;
    }
}
</style>
