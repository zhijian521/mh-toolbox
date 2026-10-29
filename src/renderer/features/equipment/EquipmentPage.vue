<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EquipmentItem, EquipmentProfile } from '../../app/types';
import { plain } from '../../services/desktop';
import { useApplication } from '../../stores/application';
import AppIcon from '../../components/AppIcon.vue';
import BaseModal from '../../components/BaseModal.vue';
import PageHeader from '../../components/PageHeader.vue';
import EquipmentBoard from './EquipmentBoard.vue';
import EquipmentDetail from './EquipmentDetail.vue';
import EquipmentEditor from './EquipmentEditor.vue';
import EquipmentImportDialog from './EquipmentImportDialog.vue';
import EquipmentPickDialog from './EquipmentPickDialog.vue';
import EquipmentPlanDialog from './EquipmentPlanDialog.vue';
import EquipmentScreenshotDialog from './EquipmentScreenshotDialog.vue';
import EquipmentWarehouse from './EquipmentWarehouse.vue';
import GearLogDialog from './GearLogDialog.vue';
import SoulJadeDialog from './SoulJadeDialog.vue';

/**
 * 装备页。
 *
 * 一个角色一套装备栏，角色用顶部的卡片切换：「搭配」是页面本体，看这套穿了什么；
 * 仓库是盖在上面的弹窗，看这个人拥有什么。两边都只动当前角色的档案。
 *
 * 以前角色是下拉框、仓库是同层标签：角色一多就要先展开列表找名字，换完装还得切回
 * 「搭配」看一眼结果。现在角色卡片直接摆在最上面，一屏能看到的角色数就是切换成本。
 * 卡片上还带一条 12 格的穿戴进度，谁还缺几格不用点进去看。
 *
 * 三套方案共用同一批档案：同一件装备可以同时挂在方案一和方案二里，所以栏里看到的是
 * 「方案 → 装备 ID」的引用，仓库里才是档案本身。删除与售出会清空所有引用，账本流水
 * 只解除关联不删除——记过的钱不因为装备没了就消失。
 */
const app = useApplication();
const rules = app.rules();

const character = ref(app.characters[0]?.id || '');
const warehouseOpen = ref(false);
const picking = ref<{ index: number; slot: string } | null>(null);
const detail = ref<EquipmentItem | null>(null);
const logTarget = ref<EquipmentItem | null>(null);
const editor = ref<{
    eq: EquipmentItem | null;
    context: { index: number; slot: string } | null;
} | null>(null);
const removing = ref<EquipmentItem | null>(null);
const removeError = ref('');
const soulOpen = ref(false);
/** 改名 / 复制：都作用于「正在查看的那一套」，入口在方案标签旁边。 */
const planDialog = ref<'rename' | 'copy' | null>(null);
const importOpen = ref(false);
const shotOpen = ref(false);
/**
 * 从空位点进来的截图识别：记住是哪一套，入库后默认穿到那一套。
 * 工具栏的「截图识别」留 null，识别完只入库、不动搭配。
 */
const shotIndex = ref<number | null>(null);

/** 角色被删掉后标签还指着旧 ID 时回落到第一个，避免整页抛「角色不存在」。 */
watch(
    () => app.characters.map((item) => item.id).join(','),
    () => {
        if (!app.characters.some((item) => item.id === character.value))
            character.value = app.characters[0]?.id || '';
    },
);
/**
 * 当前角色的装备档案快照。
 *
 * 必须先 `void app.data` 再 `plain()`：领域里的 `equipmentProfile` 返回的是 state 里的
 * 那个角色对象，引用永远不变，computed 会认为值没变、组件拿到旧数据——换方案之后栏里
 * 的格子不动就是这个原因。深拷贝一次，引用变了，响应式才成立。
 */
const profile = computed(() => {
    void app.data;
    if (!character.value || !app.characters.some((item) => item.id === character.value))
        return null;
    return plain(rules.equipmentProfile(character.value)) as EquipmentProfile;
});
const archiveCount = computed(() => {
    void app.data;
    return (app.data?.equipment || []).filter((item) => item.characterId === character.value)
        .length;
});
/** 一个角色身上一共能穿几件，角色卡上的进度条按这个数分格。 */
const slotTotal = Object.values(rules.equipmentGroups).reduce(
    (sum, group) => sum + group.slots.length,
    0,
);
/**
 * 角色卡的数据：名字、等级门派，外加「在用那套穿了几格」。
 *
 * 穿了几格取 `activeEquipmentSet` 而不是 `viewedEquipmentSet`——后者是「上次看到哪」，
 * 每个人不一样，卡片上摆别人的浏览位置没有意义。切换角色时卡片要立刻反映新状态，
 * 所以同样先 `void app.data` 再深拷贝。
 */
const characterCards = computed(() => {
    void app.data;
    return app.characters.map((item) => {
        const owner = plain(rules.equipmentProfile(item.id)) as EquipmentProfile;
        const slots = owner.equipmentSets[owner.activeEquipmentSet]?.slots || {};
        return {
            id: item.id,
            name: item.name,
            level: item.level,
            school: item.school,
            used: Object.values(slots).filter(Boolean).length,
            total: slotTotal,
        };
    });
});

function message(failure: unknown) {
    return failure instanceof Error ? failure.message : String(failure);
}
function openPick(slot: string) {
    if (!profile.value) return;
    picking.value = { index: profile.value.viewedEquipmentSet, slot };
}
function openEditor(
    eq: EquipmentItem | null = null,
    context: { index: number; slot: string } | null = null,
) {
    editor.value = { eq, context };
}
function addFromPick() {
    const target = picking.value;
    picking.value = null;
    if (target) openEditor(null, { index: target.index, slot: target.slot });
}
/**
 * 从选装弹窗直接截图识别：关掉选装、带着方案号打开截图弹窗。
 * 识别出的装备会入库；该部位空着就顺手穿上（领域 `importEquipment` 的行为）。
 */
function shotFromPick() {
    const target = picking.value;
    picking.value = null;
    shotIndex.value = target ? target.index : null;
    shotOpen.value = true;
}
function openShot() {
    // 工具栏的入口不接管搭配，也不该在选装弹窗之上再叠一层。
    picking.value = null;
    shotIndex.value = null;
    shotOpen.value = true;
}
/** 详情里点「配置到本套」或「卸下」：改的是引用，档案本身不动。 */
async function assign(slot: string, id: string) {
    if (!profile.value || app.busy) return;
    const index = profile.value.viewedEquipmentSet;
    try {
        await app.execute((domain) =>
            domain.commitEquipment(() =>
                domain.assignEquipment(profile.value!.id, index, slot, id),
            ),
        );
        detail.value = null;
        app.notify(id ? '已更新装备搭配' : '已卸下，档案保留在仓库');
    } catch (failure) {
        app.notify(message(failure), true);
    }
}
async function confirmRemove() {
    const eq = removing.value;
    if (!eq || app.busy) return;
    removeError.value = '';
    try {
        await app.execute((domain) => domain.commitEquipment(() => domain.removeEquipment(eq.id)));
        removing.value = null;
        detail.value = null;
        app.notify('装备档案已删除');
    } catch (failure) {
        removeError.value = message(failure);
    }
}
function cancelRemove() {
    removing.value = null;
    removeError.value = '';
}
/** 导入完直接把仓库弹窗打开：刚进来的几件就在列表顶上，不用自己找。 */
function imported() {
    importOpen.value = false;
    warehouseOpen.value = true;
}
function shotImported() {
    shotOpen.value = false;
    // 从空位进来时留在装备栏：刚穿上的那件就在眼前，不用再去仓库找。
    if (shotIndex.value === null) warehouseOpen.value = true;
    shotIndex.value = null;
}
/** 切角色时把仓库关掉：那一列档案属于上一个角色，留着会误点。 */
function switchCharacter(id: string) {
    if (id === character.value) return;
    character.value = id;
    warehouseOpen.value = false;
}
</script>

<template>
    <PageHeader title="装备" description="三套搭配 · 命魂之玉 · 全部档案">
        <template #actions>
            <button
                class="btn"
                type="button"
                :disabled="app.busy || !app.characters.length"
                title="粘贴游戏里的装备属性文本，一次可导入多件"
                @click="importOpen = true"
            >
                粘贴导入
            </button>
            <button
                class="btn"
                type="button"
                :disabled="app.busy || !app.characters.length"
                title="从装备属性截图本地识别，可一次放多张"
                @click="openShot"
            >
                截图识别
            </button>
            <button
                class="btn primary"
                type="button"
                :disabled="app.busy || !app.characters.length"
                @click="openEditor()"
            >
                ＋ 新增装备
            </button>
        </template>
    </PageHeader>
    <div class="page-content">
        <div v-if="!app.characters.length" class="empty">
            <AppIcon name="sword" :size="38" />
            <h2>先创建角色</h2>
            <p>装备挂在角色身上，有了角色才能配置三套搭配。</p>
            <RouterLink class="btn" to="/characters">去角色页</RouterLink>
        </div>
        <template v-else-if="profile">
            <div class="eq-toolbar">
                <div class="eq-chars" role="tablist" aria-label="装备角色">
                    <button
                        v-for="item in characterCards"
                        :key="item.id"
                        type="button"
                        class="eq-char"
                        :class="{ on: item.id === character }"
                        role="tab"
                        :aria-selected="item.id === character"
                        :title="`${item.name} · 在用那套已穿 ${item.used} / ${item.total} 格`"
                        @click="switchCharacter(item.id)"
                    >
                        <span class="eq-char-head">
                            <span class="eq-char-seal" aria-hidden="true">
                                {{ item.name.slice(0, 1) }}
                            </span>
                            <span class="eq-char-text">
                                <span class="eq-char-name">{{ item.name }}</span>
                                <span class="eq-char-sub">
                                    {{ item.level ? item.level + ' 级' : '未填等级' }} ·
                                    {{ item.school }}
                                </span>
                            </span>
                        </span>
                        <span class="eq-char-foot">
                            <span class="eq-char-meter" aria-hidden="true">
                                <i
                                    v-for="index in item.total"
                                    :key="index"
                                    :class="{ full: index <= item.used }"
                                />
                            </span>
                            <span class="eq-char-count">{{ item.used }}/{{ item.total }}</span>
                        </span>
                    </button>
                </div>
                <div class="eq-toolbar-side">
                    <span class="eq-toolbar-hint">{{ archiveCount }} 件档案</span>
                    <button
                        class="btn eq-warehouse-btn"
                        type="button"
                        :disabled="app.busy"
                        :title="`查看「${profile.name}」的全部装备档案`"
                        @click="warehouseOpen = true"
                    >
                        <AppIcon name="archive" :size="15" />
                        仓库
                    </button>
                </div>
            </div>
            <EquipmentBoard
                :profile="profile"
                @pick="openPick"
                @detail="detail = $event"
                @soul="soulOpen = true"
                @plan="planDialog = $event"
            />
        </template>
    </div>
    <EquipmentPickDialog
        v-if="picking && profile"
        :profile="profile"
        :index="picking.index"
        :part="picking.slot"
        @close="picking = null"
        @saved="picking = null"
        @add="addFromPick"
        @shot="shotFromPick"
    />
    <EquipmentWarehouse
        v-if="warehouseOpen && profile"
        :profile="profile"
        @close="warehouseOpen = false"
        @detail="detail = $event"
        @edit="openEditor($event)"
        @log="logTarget = $event"
        @remove="removing = $event"
        @add="openEditor()"
    />
    <EquipmentDetail
        v-if="detail && profile"
        :eq="detail"
        :profile="profile"
        :index="profile.viewedEquipmentSet"
        @close="detail = null"
        @edit="openEditor(detail)"
        @log="logTarget = detail"
        @remove="removing = detail"
        @assign="assign"
    />
    <SoulJadeDialog
        v-if="soulOpen && profile"
        :character-id="profile.id"
        @close="soulOpen = false"
        @saved="soulOpen = false"
    />
    <GearLogDialog
        v-if="logTarget"
        :eq="logTarget"
        @close="logTarget = null"
        @saved="logTarget = null"
    />
    <EquipmentEditor
        v-if="editor && profile"
        :eq="editor.eq"
        :profile="profile"
        :context="editor.context"
        @close="editor = null"
        @saved="editor = null"
    />
    <EquipmentPlanDialog
        v-if="planDialog && profile"
        :profile="profile"
        :mode="planDialog"
        @close="planDialog = null"
        @saved="planDialog = null"
    />
    <EquipmentImportDialog
        v-if="importOpen && profile"
        :profile="profile"
        @close="importOpen = false"
        @saved="imported"
    />
    <EquipmentScreenshotDialog
        v-if="shotOpen && profile"
        :profile="profile"
        :index="shotIndex"
        @close="
            shotOpen = false;
            shotIndex = null;
        "
        @saved="shotImported"
    />
    <BaseModal v-if="removing" title="删除装备档案" :busy="app.busy" @close="cancelRemove">
        <p>确定删除「{{ removing.name }}」吗？</p>
        <p v-if="rules.equipmentReferences(removing.id).length" class="hint">
            会清空「{{
                rules
                    .equipmentReferences(removing.id)
                    .map((item) => item.name)
                    .join('、')
            }}」里的这一格。
        </p>
        <p class="hint">装备变动记录一并删除；账号账本里的收支保留，只解除与这件装备的关联。</p>
        <p v-if="removeError" class="error" role="alert">{{ removeError }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn danger" :disabled="app.busy" @click="confirmRemove">
                {{ app.busy ? '删除中…' : '删除' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
/*
 * 角色卡片：一屏之内看得到几个号就能直接点几个号。
 *
 * 每张卡里是「名字章 + 昵称/等级门派 + 一条 12 格的穿戴进度」。进度条不是装饰：
 * 换号的动机十次有八次是「去看那个还没配齐的小号」，一眼看出谁缺几格，比逐个点开快。
 * 只有选中的那张变金边、名字加粗、进度条转金；未选中的卡保持纸色描边，
 * 一排里只强调「我在看谁」。
 */
.eq-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
}
.eq-chars {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    gap: 8px;
    /* 卡片自带边框与底色，横向滚动时不能把它们裁掉半条边。 */
    padding: 1px;
    overflow-x: auto;
    scrollbar-width: none;
}
.eq-chars::-webkit-scrollbar {
    height: 0;
}
.eq-char {
    display: flex;
    flex-direction: column;
    /*
     * 卡片随这一行分配宽度，但卡在 208：再放宽，上半行只剩「名字章 + 名字」两条，
     * 右边空出一大块，反而不像卡；176 以下进度条又挤成一串小点。号多时横向滚动。
     */
    flex: 1 1 0;
    min-width: 176px;
    max-width: 208px;
    gap: 8px;
    padding: 9px 11px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
    color: var(--muted);
    text-align: left;
    transition:
        color 120ms ease,
        border-color 120ms ease,
        background-color 120ms ease;
}
.eq-char-head {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
}
/*
 * 名字章：取昵称首字，别处不用惦记头像。
 * 用圆角方章而不是圆形——圆形在卡片里像一枚头像占位，方章更像盖上去的号牌。
 */
.eq-char-seal {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border: 1px solid var(--line-2);
    border-radius: 5px;
    background: var(--paper-2);
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1;
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        color 120ms ease;
}
.eq-char-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}
.eq-char-foot {
    display: flex;
    align-items: center;
    gap: 8px;
}
.eq-char-meter {
    display: flex;
    flex: 1 1 auto;
    gap: 3px;
    min-width: 0;
}
/*
 * 空槽压到 26% 才分得清：一格 5px 高，空与满都取 --line-2 时整排读起来是一条虚线，
 * 「12/12」和「0/12」看着差不多。满槽用 --ink-2，选中那张再转金。
 */
.eq-char-meter i {
    flex: 1 1 0;
    height: 5px;
    border-radius: 2.5px;
    background: color-mix(in srgb, var(--line-2) 26%, transparent);
}
.eq-char-meter i.full {
    background: var(--muted);
}
.eq-char-count {
    flex: none;
    color: var(--muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
}
.eq-char:hover:not(:disabled) {
    border-color: var(--line-2);
    background: var(--paper-2);
    color: var(--ink);
}
.eq-char:hover:not(:disabled) .eq-char-seal {
    border-color: color-mix(in srgb, var(--gold) 62%, var(--line-2));
    color: var(--gold);
}
.eq-char.on {
    border-color: var(--gold);
    background: var(--paper-2);
    color: var(--ink);
}
.eq-char.on .eq-char-seal {
    border-color: var(--gold);
    background: var(--gold);
    color: var(--on-accent);
    font-weight: 600;
}
.eq-char.on .eq-char-meter i.full {
    background: var(--gold);
}
.eq-char-name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.eq-char.on .eq-char-name {
    font-weight: 600;
}
.eq-char-sub {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.eq-toolbar-side {
    display: flex;
    align-items: center;
    flex: none;
    gap: 8px;
}
.eq-toolbar-hint {
    color: var(--muted);
    font-size: 11.5px;
}
/* 仓库是「另一个视图」而不是主操作，用图标 + 文字，别再给主色。 */
.eq-warehouse-btn {
    gap: 6px;
}
</style>
