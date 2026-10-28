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
 * 一个角色一套装备栏，角色用顶部的名字签切换：「搭配」是页面本体，看这套穿了什么；
 * 仓库是盖在上面的弹窗，看这个人拥有什么。两边都只动当前角色的档案。
 *
 * 以前角色是下拉框、仓库是同层标签：角色一多就要先展开列表找名字，换完装还得切回
 * 「搭配」看一眼结果。现在名字签直接摆在最上面，一屏能看到的角色数就是切换成本。
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
    warehouseOpen.value = true;
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
                @click="shotOpen = true"
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
                        v-for="item in app.characters"
                        :key="item.id"
                        type="button"
                        class="eq-char"
                        :class="{ on: item.id === character }"
                        role="tab"
                        :aria-selected="item.id === character"
                        @click="switchCharacter(item.id)"
                    >
                        <span class="eq-char-name">{{ item.name }}</span>
                        <span class="eq-char-sub">
                            {{ item.level ? item.level + ' 级' : '未填等级' }} ·
                            {{ item.school }}
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
        @close="shotOpen = false"
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
 * 角色名字签：一屏之内看得到几个号就能直接点几个号。
 * 选中的一枚在行下那道横线上压一段金线，其余只有名字——一排框会把注意力
 * 分给五个同样重的方块，而这里只有「我在看谁」需要被强调。
 */
.eq-toolbar {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--line);
}
.eq-chars {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
}
.eq-chars::-webkit-scrollbar {
    height: 0;
}
.eq-char {
    display: flex;
    flex-direction: column;
    flex: none;
    gap: 1px;
    max-width: 11em;
    padding: 5px 13px 6px;
    /* 下边框压住行线（-1px），选中态的金线才会嵌在那条线上而不是浮在上方。 */
    margin-bottom: -1px;
    border: 0;
    border-bottom: 2px solid transparent;
    border-radius: 3px 3px 0 0;
    background: none;
    color: var(--muted);
    text-align: left;
    transition:
        color 120ms ease,
        border-color 120ms ease,
        background-color 120ms ease;
}
.eq-char:hover:not(:disabled) {
    background: color-mix(in srgb, var(--paper) 62%, transparent);
    color: var(--ink);
}
.eq-char.on {
    border-bottom-color: var(--gold);
    color: var(--ink);
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
    font-size: 10.5px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.eq-toolbar-side {
    display: flex;
    align-items: center;
    flex: none;
    gap: 8px;
    padding-bottom: 5px;
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
