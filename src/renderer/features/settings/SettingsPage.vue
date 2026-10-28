<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import PageHeader from '../../components/PageHeader.vue';
import { useApplication } from '../../stores/application';
import { desktop, plain } from '../../services/desktop';
import { loadTheme, setTheme, themePreference } from '../../services/theme';
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
 * 使用帮助：每页一句，只写「这页能干什么」，不复述界面上的按钮。
 * 说得太长就没人看，八条各控制在 26 字以内。
 */
const helpItems = [
    { page: '总览', text: '双账本合计、14 天趋势与目标进度' },
    { page: '收益', text: '物品速记与在线计时，按天分账' },
    { page: '账号', text: '人民币与梦幻币分开记，含买卖进出' },
    { page: '目标', text: '长期目标与每次进度记录' },
    { page: '装备', text: '装备栏与仓库，可粘贴或截图导入' },
    { page: '角色', text: '档案、门派与养成进度' },
    { page: '物价', text: '物品价格卡片与历史流水' },
    { page: '设置', text: '备份、外观与这份帮助' },
];
const helpTips = [
    '数据只在本机，换机或重装前先导出备份。',
    '收益页记的日常产出会同步成账号页里的「游戏收益」那条，不用再记一遍。',
];
/*
 * 外观：偏好存在主进程（建窗口前就要知道），所以只能经桌面通道读写。
 * 状态放在 services/theme.ts 里与侧栏共用——各存一份的话，侧栏切完再进设置页
 * 会看到旧的选中项。
 */
const themeOptions: Array<{ value: ThemePreference; label: string }> = [
    { value: 'auto', label: '跟随系统' },
    { value: 'light', label: '浅色' },
    { value: 'dark', label: '深色' },
];
onMounted(loadTheme);
async function chooseTheme(next: ThemePreference) {
    if (busy.value || themePreference.value === next) return;
    try {
        await setTheme(next);
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
/*
 * 开源与许可。地址写死在这里；主进程只放行 github.com 与 polyformproject.org，
 * 所以哪怕将来拼错域名，也只会打不开，不会把任意地址交给系统浏览器。
 * 窗口把 window.open 与导航都拦着，`<a>` 走 @click.prevent + IPC 才点得动，
 * 保留 href 是为了右键能复制地址、悬停能看到真实 URL。
 */
const projectUrl = 'https://github.com/zhijian521/mh-toolbox';
const licenseUrl = 'https://polyformproject.org/licenses/noncommercial/1.0.0';
async function openLink(url: string) {
    try {
        await desktop().openExternal(url);
    } catch (failure) {
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
    <PageHeader title="设置" description="外观、使用帮助、数据与关于" />
    <!--
        两列各自堆叠，不用 grid 按行填：grid 里短卡下方会空出与长卡等高的空白，
        这正是上一版看着乱的原因。flex 列内卡片紧贴，列高只由自己决定。
    -->
    <div class="page-content settings-page">
        <div class="settings-column">
            <section class="paper-section">
                <h2>外观</h2>
                <div class="theme-choices" role="group" aria-label="外观主题">
                    <button
                        v-for="option in themeOptions"
                        :key="option.value"
                        class="btn"
                        :class="{ selected: themePreference === option.value }"
                        :aria-pressed="themePreference === option.value"
                        :disabled="busy"
                        @click="chooseTheme(option.value)"
                    >
                        {{ option.label }}
                    </button>
                </div>
                <p class="hint">
                    跟随系统时随 Windows 设置自动切换；侧栏底部的太阳 / 月亮也能随时对调。
                </p>
            </section>
            <section class="paper-section">
                <h2>数据</h2>
                <dl class="data-counts">
                    <div v-for="[title, count] in counts" :key="title">
                        <dt>{{ title }}</dt>
                        <dd>{{ count }}</dd>
                    </div>
                </dl>
                <!-- 文件路径归在「数据」里：找备份、想核对存哪儿的人会先来这看。 -->
                <dl class="info-list">
                    <div>
                        <dt>数据文件</dt>
                        <dd class="data-path">{{ app.info?.dataFile }}</dd>
                    </div>
                </dl>
                <p class="hint">
                    只保存在本机。换机或重装前先导出一份 JSON
                    备份；导入会替换当前数据，替换前自动留一份本地副本。
                </p>
                <div class="actions">
                    <button class="btn primary" :disabled="busy" @click="exportBackup">
                        导出 JSON 备份
                    </button>
                    <button class="btn" :disabled="busy" @click="chooseImport">
                        导入 JSON 备份
                    </button>
                </div>
            </section>
            <section class="paper-section danger-section">
                <h2>清空数据</h2>
                <p>删除角色及全部记录，清空前自动保留本地副本。</p>
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
        <div class="settings-column">
            <section class="paper-section">
                <h2>使用帮助</h2>
                <dl class="help-list">
                    <div v-for="item in helpItems" :key="item.page">
                        <dt>{{ item.page }}</dt>
                        <dd>{{ item.text }}</dd>
                    </div>
                </dl>
                <ul class="help-tips">
                    <li v-for="tip in helpTips" :key="tip">{{ tip }}</li>
                </ul>
            </section>
            <section class="paper-section">
                <h2>关于</h2>
                <dl class="info-list">
                    <div>
                        <dt>版本</dt>
                        <dd>{{ app.info?.version }} · 数据版本 {{ app.data?.schemaVersion }}</dd>
                    </div>
                </dl>
                <p>源码公开，可自行运行、修改与再发布。</p>
                <!--
                    强调不用行内 <strong>：prettier 会把它拆到单独一行，Vue 的空白压缩
                    就会在中文里塞进一个空格。改用左侧红条，视觉上同样有分量。
                -->
                <p class="license-notice">
                    它用的不是可以商用的开源许可，而是 PolyForm Noncommercial
                    1.0.0——任何以营利为目的的使用都不在授权范围内。
                </p>
                <dl class="license-terms">
                    <div class="allow">
                        <dt>可以</dt>
                        <dd>运行、修改、再发布</dd>
                    </div>
                    <div class="deny">
                        <dt>不可以</dt>
                        <dd>打包出售、收费分发等商业用途</dd>
                    </div>
                </dl>
                <div class="license-links">
                    <a :href="projectUrl" @click.prevent="openLink(projectUrl)">
                        <AppIcon name="external" :size="13" />
                        <span>github.com/zhijian521/mh-toolbox</span>
                    </a>
                    <a :href="licenseUrl" @click.prevent="openLink(licenseUrl)">
                        <AppIcon name="external" :size="13" />
                        <span>许可证全文</span>
                    </a>
                </div>
            </section>
        </div>
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
/*
 * 两列各自堆叠。用 grid 的话，同一行里短卡下方会空出与长卡等高的空白，
 * 上一版六张卡片参差不齐其实就是这个原因；flex 列内卡片紧贴，列高各算各的。
 */
.settings-page {
    display: flex;
    align-items: flex-start;
    gap: 18px;
}
.settings-column {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
}
.paper-section {
    padding: 18px 20px 20px;
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
    margin-bottom: 14px;
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
    margin-top: 14px;
}
/* 危险操作单独一张卡：和最常用的「导出备份」挤在一起最容易点错。 */
.danger-section {
    border-color: color-mix(in srgb, var(--red) 24%, var(--line));
}
.theme-choices {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}
.data-counts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin: 2px 0 14px;
}
.data-counts dt {
    font-size: 12px;
    color: var(--muted);
}
.data-counts dd {
    font-size: 24px;
    color: var(--gold);
    margin-top: 5px;
    font-variant-numeric: tabular-nums;
}
/*
 * 使用帮助：八页各一句，两列排。dt 用赭金当小标题，dd 收一档字号压成灰，
 * 扫的时候先看到页名，需要时再看那句解释。
 *
 * 按列填（左 1-4、右 5-8）而不是按行填：默认的行优先会排成
 * 「总览 / 收益 / 账号 / 目标」…读下来左列是 1、3、5、7，和侧栏顺序对不上。
 */
.help-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(4, auto);
    grid-auto-flow: column;
    gap: 11px 16px;
    margin-bottom: 14px;
}
.help-list dt {
    font-size: 12.5px;
    color: var(--gold);
    letter-spacing: 0.3px;
}
.help-list dd {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.65;
    color: var(--muted);
}
/* 要点用虚线隔开：它们不是第九、第十个页面，而是两句通用的提醒。 */
.help-tips {
    margin: 0;
    padding: 12px 0 0;
    border-top: 1px dashed color-mix(in srgb, var(--line-2) 55%, transparent);
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.help-tips li {
    position: relative;
    padding-left: 13px;
    font-size: 12px;
    line-height: 1.65;
    color: var(--muted);
}
.help-tips li::before {
    content: '·';
    position: absolute;
    left: 3px;
    color: var(--gold);
    font-weight: 700;
}
.info-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 14px;
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
/*
 * 「不是可商用的开源许可」这句是这张卡片唯一要人记住的话，给一道红条压住，
 * 不用行内加粗：prettier 拆行后中文会多出一个空格，改样式更稳。
 */
.license-notice {
    padding: 9px 12px;
    border-left: 2px solid color-mix(in srgb, var(--red) 55%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--red) 6%, var(--paper));
    color: color-mix(in srgb, var(--ink) 90%, var(--muted));
}
/*
 * 许可条款：左侧二字标签（可以 / 不可以）当作行首的判词，右侧跟具体内容。
 * 标签固定 48px 宽，两行内容的正文才能对齐成一条竖线，读起来像一张清单。
 */
.license-terms {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin: 2px 0 16px;
}
.license-terms > div {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 10px;
}
.license-terms dt {
    font-size: 12px;
    line-height: 21px;
    letter-spacing: 0.5px;
}
.license-terms dd {
    line-height: 21px;
}
.license-terms .allow dt {
    color: var(--green);
}
.license-terms .deny dt {
    color: var(--red);
}
.license-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 18px;
    margin-bottom: 12px;
}
/* 全局 a 去掉了下划线，这里用一道同色细线把「可点」说明白。 */
.license-links a {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding-bottom: 2px;
    color: var(--gold);
    border-bottom: 1px solid color-mix(in srgb, var(--gold) 38%, transparent);
    transition:
        color 120ms ease,
        border-color 120ms ease;
}
.license-links a:hover {
    color: var(--ink);
    border-bottom-color: color-mix(in srgb, var(--ink) 45%, transparent);
}
@media (max-width: 1150px) {
    /*
     * 单列时用 display: contents 把「列」这层盒子抹掉，五张卡直接成为同一个
     * grid 的项——这样才有机会用 order 把「清空数据」挪到最末。
     * 只改 flex-direction 的话，顺序仍是 外观、数据、清空、帮助、关于，
     * 危险操作夹在中间。
     */
    .settings-page {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
    }
    .settings-column {
        display: contents;
    }
    .danger-section {
        order: 1;
    }
}
</style>
