<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import type { Character } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import CharacterCard from './CharacterCard.vue';
import CharacterEditor from './CharacterEditor.vue';
import QuickEditor from './QuickEditor.vue';
import CharacterHistory from './CharacterHistory.vue';
import BaseModal from '../../components/BaseModal.vue';
import AppIcon from '../../components/AppIcon.vue';
const app = useApplication();
const content = ref<HTMLElement>(),
    addButton = ref<HTMLButtonElement>();
const editing = ref<{ character?: Character } | null>(null);
const quick = ref<{ id: string; category: string; key: string } | null>(null);
const historyId = ref<string | null>(null),
    deleting = ref<Character | null>(null),
    deleteError = ref('');
const relatedCount = computed(() =>
    deleting.value && app.data
        ? ['transactions', 'sessions', 'goals', 'equipment'].reduce(
              (sum, key) =>
                  sum +
                  (app.data![key] as any[]).filter(
                      (item) => item.characterId === deleting.value!.id,
                  ).length,
              0,
          )
        : 0,
);
async function saved(id: string) {
    editing.value = null;
    await nextTick();
    content.value
        ?.querySelector<HTMLButtonElement>(
            `[data-character-id="${CSS.escape(id)}"] button[aria-label="编辑档案"]`,
        )
        ?.focus({ preventScroll: true });
}
async function remove() {
    if (!deleting.value || app.busy) return;
    try {
        await app.execute((domain) => domain.removeCharacter(deleting.value!.id));
        deleting.value = null;
        app.notify('角色已删除');
        await nextTick();
        addButton.value?.focus();
    } catch (error) {
        deleteError.value = error instanceof Error ? error.message : String(error);
    }
}
async function move(id: string, targetId: string, position: 'before' | 'after') {
    if (app.busy || id === targetId) return;
    try {
        await app.execute((domain) => domain.saveCharacterOrder(id, { targetId, position }));
        app.notify('角色顺序已保存');
        await nextTick();
        content.value
            ?.querySelector<HTMLButtonElement>(
                `[data-character-id="${CSS.escape(id)}"] .drag-handle`,
            )
            ?.focus({ preventScroll: true });
    } catch (error) {
        app.notify(error instanceof Error ? error.message : String(error), true);
    }
}
function keyboardMove(id: string, offset: number) {
    const index = app.characters.findIndex((character) => character.id === id),
        target = app.characters[index + offset];
    if (target) void move(id, target.id, offset < 0 ? 'before' : 'after');
}
const dragging = ref(''),
    dropId = ref(''),
    dropPosition = ref<'before' | 'after'>('before');
let scrollSpeed = 0,
    scrollFrame = 0;
function scrollTick() {
    if (!dragging.value) return;
    if (content.value) content.value.scrollTop += scrollSpeed;
    scrollFrame = requestAnimationFrame(scrollTick);
}
function startDrag(id: string, event: DragEvent) {
    if (app.busy || !event.dataTransfer) {
        event.preventDefault();
        return;
    }
    dragging.value = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    scrollFrame = requestAnimationFrame(scrollTick);
}
function dragOver(id: string, event: DragEvent) {
    if (!dragging.value) return;
    event.preventDefault();
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropId.value = id;
    dropPosition.value = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    const viewport = content.value!.getBoundingClientRect();
    scrollSpeed =
        event.clientY < viewport.top + 65 ? -12 : event.clientY > viewport.bottom - 65 ? 12 : 0;
}
function endDrag() {
    dragging.value = '';
    dropId.value = '';
    scrollSpeed = 0;
    cancelAnimationFrame(scrollFrame);
}
function drop(event: DragEvent) {
    event.preventDefault();
    const id = dragging.value,
        target = dropId.value,
        position = dropPosition.value;
    endDrag();
    if (id && target) void move(id, target, position);
}
onBeforeUnmount(endDrag);
</script>
<template>
    <header class="page-header">
        <div>
            <h1>角色</h1>
            <p>角色档案 · 技能修炼 · 养成记录</p>
        </div>
        <div class="actions">
            <button class="btn" :disabled="app.busy" @click="historyId = 'all'">养成记录</button>
            <button ref="addButton" class="btn primary" :disabled="app.busy" @click="editing = {}">
                ＋ 添加角色
            </button>
        </div>
    </header>
    <div ref="content" class="page-content" @dragend="endDrag" @drop="endDrag">
        <div v-if="!app.characters.length" class="empty">
            <AppIcon name="user" :size="38" />
            <h2>从一个角色开始</h2>
            <p>为每个角色建立档案，记录技能和修炼。</p>
            <button class="btn" @click="editing = {}">添加第一个角色</button>
        </div>
        <div v-else class="character-grid">
            <div
                v-for="character in app.characters"
                :key="character.id"
                class="card-wrapper"
                :class="{
                    'is-dragging': dragging === character.id,
                    'drop-before':
                        dropId === character.id &&
                        dragging !== character.id &&
                        dropPosition === 'before',
                    'drop-after':
                        dropId === character.id &&
                        dragging !== character.id &&
                        dropPosition === 'after',
                }"
                @dragover="dragOver(character.id, $event)"
                @drop.stop="drop"
            >
                <CharacterCard
                    :character="character"
                    :busy="app.busy"
                    @edit="editing = { character: plain(character) }"
                    @history="historyId = character.id"
                    @delete="
                        deleting = character;
                        deleteError = '';
                    "
                    @quick="(category, key) => (quick = { id: character.id, category, key })"
                    @move="keyboardMove(character.id, $event)"
                    @drag="startDrag(character.id, $event)"
                />
            </div>
        </div>
    </div>
    <CharacterEditor
        v-if="editing"
        :character="editing.character"
        @close="editing = null"
        @saved="saved"
    />
    <QuickEditor
        v-if="quick"
        :id="quick.id"
        :category="quick.category"
        :metric-key="quick.key"
        @close="quick = null"
        @saved="quick = null"
    />
    <CharacterHistory
        v-if="historyId !== null"
        :character-id="historyId"
        @close="historyId = null"
    />
    <BaseModal v-if="deleting" title="删除角色" :busy="app.busy" @close="deleting = null">
        <p>确定删除角色「{{ deleting.name }}」吗？</p>
        <p>
            技能养成档案、养成变更记录及名下
            {{ relatedCount }}
            条相关记录（收益、在线、账号账本、目标、装备）会一并删除，且无法恢复。
        </p>
        <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn danger" :disabled="app.busy" @click="remove">
                {{ app.busy ? '删除中…' : '确认删除' }}
            </button>
        </template>
    </BaseModal>
</template>
