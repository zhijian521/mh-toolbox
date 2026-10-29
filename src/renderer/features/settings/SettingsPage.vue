<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import PageHeader from '../../components/PageHeader.vue';
import { useApplication } from '../../stores/application';
import { desktop, plain } from '../../services/desktop';
import { loadTheme, setTheme, themePreference } from '../../services/theme';
import type { AppData, ThemePreference, UpdateCheck } from '../../app/types';
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
 * 使用帮助：每个页面一条，收起时只留「页名 + 一句概述」，展开才看具体操作。
 *
 * 概述那一句只回答「这页能干什么」，不超过 26 字；展开的步骤写「怎么操作」，
 * 一条一个动作，按实际点击顺序排。步骤只写界面上真实存在的入口，
 * 改了界面就要回来改这里——它比文档更容易被用户当真。
 *
 * 账务口径也要写进来：归属怎么定、多开怎么分摊、点卡开关影响什么。这些在界面上
 * 只有一个词（「记给」「不计点卡」），不解释就只能靠猜，猜错就是一条错账。
 * 口子只有这一处，别指望用户翻文档。
 */
const helpItems = [
    {
        page: '总览',
        text: '收益、账号与目标的状态一览',
        steps: [
            '页头的角色筛选同时作用于下面三块板。',
            '收益板默认看今天、账号板默认看本月，各自点开右侧按钮改区间，互不影响。',
            '趋势图固定看截至区间结束的 14 天，切范围只挪窗口不换口径。',
            '底部只列进行中的目标，完成的不显示。',
            '这里只读：记账去收益页与账号页，记进度去目标页。',
        ],
    },
    {
        page: '收益',
        text: '物品速记与在线计时，按天分账',
        steps: [
            '「▶ 开始游戏」勾选这次上线的号，一个号起一段计时；中途再加号点「＋ 加入角色」。',
            '速记标题右侧的「记给」决定这笔记给谁：「跟计时」记给正在计时的号，也可以选「全部」或某一个号。',
            '多开时点卡按在线号数各记一条；「跟计时」下金币也按人数均分，物品整条记给第一个号。',
            '点物品图标记一条。固定价直接记，右键卡片改价；不固定价的每次弹窗填单价。',
            '卡片右下角「单价表」两颗图标：先导出 CSV 批量改价，改完再导回来。留空不改、填 0 清除、单位是万。',
            '退某个号点它那格的 ✕，整批下线点「■ 全部结束」，各自按在线时长结算点卡。',
            '忘了计时点「补在线时长」；起点记错就点顶部那个号的名字，只改它这一段。',
            '「点卡 X/点」只设每点单价；旁边「计入点卡 / 不计点卡」关掉后，之后的计时不再扣，已入账的不回头改。',
            '记录行右侧 ✕ 删掉误记；日常产出会自动同步成账号页的「游戏收益」，一天一路角色一条。',
        ],
    },
    {
        page: '账号',
        text: '人民币与梦幻币分账，含买卖进出',
        steps: [
            '「＋ 记一笔」手填；下方「快捷记账」的入口类型与币种都已预设好。',
            '十一个快捷入口：装备/召唤兽买卖、点卡充值与购买、游戏币买卖、养成投入、游戏收益、其他收支。',
            '人民币与梦幻币分开统计，储备金并入梦幻币。',
            '收入扣手续费、支出加手续费，口径由领域统一算，页面不重算。',
            '装备买卖在装备页「记变动」里勾上「同时记入账号账本」，这里只读展示，不要重复记。',
            '当前区间没有记录但历史有时，点「查看全部时间」。',
        ],
    },
    {
        page: '目标',
        text: '长期目标与每次进度记录',
        steps: [
            '「＋ 新建目标」选类型：存钱、装备或养成；养成目标还能选「跟随角色档案」或「手动累计」。',
            '存钱与装备目标点卡片上的「＋ 记进度」记一笔增量，正数增加、负数减少，累计最低到 0。',
            '养成目标点「更新养成」批量填各角色当前值，会写回角色档案并留下养成记录。',
            '卡片上还能「标记完成」；历史入口养成目标叫「养成记录」，其余叫「进度历史」。',
            '状态、类型、角色与关键字都能筛，搜的是目标名、角色和备注。',
            '卡片可拖动调顺序，也能用方向键移动；完成后切到「已完成」查看或恢复。',
        ],
    },
    {
        page: '装备',
        text: '三套搭配、命魂之玉与全部档案',
        steps: [
            '顶部一排角色名字签就是切换，点谁看谁；右边的「仓库」按钮弹出这个角色的全部档案。',
            '点方案号签（1 / 2 / 3）换搭配：切到哪套，身上穿的就是哪套，没有额外的「设为在用」。',
            '方案签后面的「改名」与「复制方案」都作用于当前这套，复制是把格子照搬到另一套。',
            '点空格子选装；详情里「从本套卸下」只解除引用，档案仍留在仓库。',
            '玉魄那两格要先在「命魂之玉」里解锁并填属性与修炼等级，没解锁时点格子会直接跳过去。',
            '「＋ 新增装备」手填，「粘贴导入」贴游戏属性文本可一次多件，「截图识别」每张图一件、本地识别不上传。',
            '截图识别可勾「只填该部位的空白，已有装备保留」；图片只在内存里，关掉弹窗就没了。',
            '仓库能按类型、部位、状态筛，也能搜名称、属性与特技。',
            '详情里「记变动」选动作（购入 / 售出 / 打造 / 替换 / 镶嵌 / 开光 / 其他），勾上「同时记入账号账本」才写进账号；删除会清空所有方案里的引用。',
        ],
    },
    {
        page: '角色',
        text: '档案、技能修炼与养成记录',
        steps: [
            '「＋ 添加角色」填名字、门派与等级，其余属性逐项补。',
            '卡片上的等级、师门技能与辅助技能点一下就能改这一项，不用打开整张档案。',
            '右下三个小图标：编辑档案、查看养成记录、删除；拖卡片或按方向键调顺序。',
            '这个顺序就是各页角色筛选里的排列。',
            '顶部「养成记录」汇总全部角色的成长历史。',
            '删除前会列出联动影响（账本、装备、目标），确认后才删。',
        ],
    },
    {
        page: '物价',
        text: '物品价格卡片与历史流水',
        steps: [
            '「＋ 新建卡片」按物品建一张，分类可以选现成的，也能「＋ 新建类型」自己写。',
            '卡片右下角「＋ 记价」记一条行情，同一天可以记多条。',
            '涨跌只跟「上一条不同日期」的记录比，同一天记几条也不会算成涨跌；迷你走势由历史自动画。',
            '「历史」看完整价格流水；左下两个小图标可编辑或删除这张卡。',
            '物价是独立集合，和角色、账本、装备都不关联。',
        ],
    },
    {
        page: '设置',
        text: '外观、备份与这份帮助',
        steps: [
            '外观三选一：跟随系统、浅色、深色，改完立即生效；侧栏底部的太阳 / 月亮也能直接对调。',
            '「数据」里能看到角色、收支、目标、装备各有多少条，以及数据文件存在哪。',
            '导出 JSON 备份给自己留底；导入会先校验再替换当前数据，替换前自动留一份本地副本。',
            '同一栏底部的「清空 V2 数据」不可撤销，执行前有二次确认并先留一份本地副本。',
            '关于里有版本、检查更新、许可范围与源码地址。',
            '有新版本时点「打开下载页」去 GitHub 下载，装上新包即可——数据不在安装目录，升级不会丢。',
        ],
    },
];
const helpTips = [
    '数据只在本机，换机或重装前先导出备份。',
    '收益页记的日常产出会同步成账号页里的「游戏收益」那条，不用再记一遍。',
    '多开时点卡与收益都按在线号数分摊，先把「记给」选对，各号的账才对得上。',
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
/** 更新检查的结果；null 表示还没查过（界面显示「看有没有新版本」而不是「已是最新」）。 */
const updateInfo = ref<UpdateCheck | null>(null),
    checkingUpdate = ref(false);
onMounted(() => {
    void loadTheme();
    // 进设置页静默查一次：断网时什么都不说，别让人以为应用坏了。
    void refreshUpdate(false);
});
/*
 * 检查更新：只查 GitHub 上的最新正式版，不下载、不安装。
 *
 * `manual` 区分「用户点的」与「进页面自动跑的」——自动那次失败要把话咽下去，
 * 手动那次才提示；否则一进设置页就先挨一条红字，比不检查更烦人。
 * 结果是 `{ok:false,error}` 而不是异常，网络问题不会冒泡成未捕获错误。
 */
async function refreshUpdate(manual: boolean) {
    if (checkingUpdate.value) return;
    checkingUpdate.value = true;
    try {
        const result = await desktop().checkUpdate();
        updateInfo.value = result;
        if (manual && !result.ok) app.notify(result.error || '检查更新失败', true);
    } catch (failure) {
        if (manual) app.notify(failure instanceof Error ? failure.message : String(failure), true);
    } finally {
        checkingUpdate.value = false;
    }
}
/** 下载页交给系统浏览器：窗口把 window.open 与导航都拦着（外链白名单里有 github.com）。 */
async function openRelease() {
    const url = updateInfo.value?.url;
    if (!url) return;
    try {
        await desktop().openExternal(url);
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    }
}
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
                <!--
                    清空与备份同处一张卡，但用虚线隔开、按钮靠右：它得让人一眼看见在哪儿，
                    又不能紧挨最常用的「导出备份」——并排隔 8px 的两个按钮最容易点错。
                -->
                <div class="data-danger">
                    <p>清空会删除角色及全部记录，操作前自动保留本地副本。</p>
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
                </div>
            </section>
        </div>
        <div class="settings-column">
            <section class="paper-section">
                <h2>使用帮助</h2>
                <div class="help-list">
                    <details v-for="item in helpItems" :key="item.page" class="help-item">
                        <summary>
                            <span class="help-page">{{ item.page }}</span>
                            <span class="help-brief">{{ item.text }}</span>
                        </summary>
                        <ol class="help-steps">
                            <li v-for="step in item.steps" :key="step">{{ step }}</li>
                        </ol>
                    </details>
                </div>
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
                <!--
                    检查更新：一行状态 + 一颗按钮。有新版时状态转金、按钮换成「打开下载页」，
                    说明折叠起来——只看版本号的人不必被一整段更新日志挡住。
                -->
                <div class="update-row">
                    <span class="update-state" :class="{ fresh: updateInfo?.hasUpdate }">
                        <template v-if="checkingUpdate">正在检查…</template>
                        <template v-else-if="updateInfo?.hasUpdate">
                            有新版本 {{ updateInfo.latest }}（当前 {{ updateInfo.current }}）
                        </template>
                        <template v-else-if="updateInfo?.ok">已是最新</template>
                        <template v-else-if="updateInfo">{{ updateInfo.error }}</template>
                        <template v-else>看有没有新版本</template>
                    </span>
                    <button
                        v-if="updateInfo?.hasUpdate"
                        class="btn compact primary"
                        :disabled="busy"
                        @click="openRelease"
                    >
                        打开下载页
                    </button>
                    <button
                        v-else
                        class="btn compact"
                        :disabled="busy || checkingUpdate"
                        @click="refreshUpdate(true)"
                    >
                        检查更新
                    </button>
                </div>
                <details v-if="updateInfo?.hasUpdate && updateInfo.notes" class="update-notes">
                    <summary>这版改了什么</summary>
                    <p>{{ updateInfo.notes }}</p>
                </details>
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
        <p v-if="importCandidate.activeSessions.length" class="hint">
            备份包含
            {{ importCandidate.activeSessions.length }} 段未结束的在线计时，导入后照旧继续计时。
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
/*
 * 清空数据收在「数据」卡底部：虚线把「日常备份」与「不可撤销」分开，
 * 按钮靠右远离导出/导入；位置固定在这一栏，用户记得住它在哪。
 * 虚线用 `--line-2` 而不是 `--line`，也不是按比例稀释过的色：1px 虚线本来就比实线
 * 淡一档，深色下那两种写法几乎看不见，同一条规则会出现两种主题两种效果。
 * 继承的 `.paper-section p` 有 12px 下边距，这里要归零，否则文字与按钮基线错开。
 */
.data-danger {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 12px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px dashed var(--line-2);
}
.data-danger p {
    flex: 1 1 240px;
    min-width: 0;
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--muted);
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
 * 使用帮助：一个页面一条，收起时只留「页名 + 一句概述」，点开才看操作步骤。
 *
 * 用原生 <details>：键盘（Enter / Space）与读屏的展开状态都由浏览器给，
 * 不另存一份开关状态，也就不会出现「点开了但无障碍属性没跟上」这类问题。
 * 页名固定宽度，概述与步骤左对齐在同一列，竖着扫下来就对得上侧栏顺序。
 */
.help-list {
    display: flex;
    flex-direction: column;
    margin-bottom: 14px;
    border-top: 1px solid var(--line);
}
.help-item {
    border-bottom: 1px solid var(--line);
}
.help-item > summary {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 7px 2px;
    list-style: none;
    cursor: pointer;
    font-size: 12.5px;
}
/* 去掉 Safari / 旧 Edge 自带的三角，改用右侧细箭头。 */
.help-item > summary::-webkit-details-marker {
    display: none;
}
.help-item > summary::after {
    content: '';
    flex: none;
    align-self: center;
    margin-left: auto;
    width: 5px;
    height: 5px;
    border-right: 1.4px solid var(--muted);
    border-bottom: 1.4px solid var(--muted);
    transform: rotate(45deg);
    transition: transform 0.16s ease;
}
.help-item[open] > summary::after {
    transform: rotate(-135deg);
}
.help-item > summary:focus-visible {
    outline: 1px solid var(--gold);
    outline-offset: 2px;
}
.help-page {
    flex: none;
    width: 3.2em;
    color: var(--gold);
    letter-spacing: 0.3px;
}
.help-brief {
    font-size: 12px;
    line-height: 1.6;
    color: var(--muted);
}
/* 展开的那条把概述提亮一档，扫的时候能看出打开的是哪页。 */
.help-item[open] .help-brief,
.help-item > summary:hover .help-brief {
    color: var(--ink-2);
}
.help-steps {
    counter-reset: step;
    margin: 0;
    padding: 1px 2px 10px calc(3.2em + 10px);
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.help-steps li {
    position: relative;
    padding-left: 15px;
    font-size: 12px;
    line-height: 1.7;
    color: var(--muted);
    counter-increment: step;
}
/* 序号用赭金小字：步骤之间靠数字断开，比圆点更能看出先后顺序。 */
.help-steps li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    font-size: 10px;
    line-height: 2.05;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
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
/*
 * 检查更新：状态在左、按钮在右，与上面「版本」那一行同一条左对齐线。
 * 负的上边距把两行拉近——它俩说的是同一件事（现在是什么版本、有没有新的）。
 */
.update-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
    margin: -4px 0 12px;
}
.update-state {
    min-width: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--muted);
}
/* 有新版才转金：平时这句灰字不该抢「版本」那一行的注意力。 */
.update-state.fresh {
    color: var(--gold);
}
/* 更新说明限高滚动：它可能是一整篇更新日志，不能把「关于」撑成两屏。 */
.update-notes {
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--muted);
}
.update-notes summary {
    cursor: pointer;
    color: var(--ink-2);
}
.update-notes p {
    max-height: 160px;
    overflow: auto;
    margin: 8px 0 0;
    padding-left: 10px;
    border-left: 1px dashed var(--line-2);
    line-height: 1.65;
    white-space: pre-wrap;
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
     * 单列时用 display: contents 把「列」这层盒子抹掉，四张卡直接成为同一个
     * grid 的项。清空已收进「数据」卡底部，不再需要 order 把危险操作挪到最末——
     * 它跟着「数据」走，位置与双列时一致。
     */
    .settings-page {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
    }
    .settings-column {
        display: contents;
    }
}
</style>
