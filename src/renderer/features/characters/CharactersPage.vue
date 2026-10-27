<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { Character } from '../../app/types';
import { useApplication } from '../../stores/application';
import { plain } from '../../services/desktop';
import CharacterCard from './CharacterCard.vue';
import CharacterEditor from './CharacterEditor.vue';
import QuickEditor from './QuickEditor.vue';
import CharacterHistory from './CharacterHistory.vue';
import BaseModal from '../../components/BaseModal.vue';
import AppIcon from '../../components/AppIcon.vue';
import PageHeader from '../../components/PageHeader.vue';
import { useDragSort } from '../../components/drag-sort';
const app = useApplication();
const content = ref<HTMLElement>(),
    addButton = ref<HTMLButtonElement>();
const editing = ref<{ character?: Character } | null>(null);
const quick = ref<{ id: string; category: string; key: string } | null>(null);
const historyId = ref<string | null>(null),
    deleting = ref<Character | null>(null),
    deleteError = ref('');
// Mirrors domain.removeCharacter: owned records plus equipment logs (including logs of this
// character's equipment) and the active session are all dropped with the character.
const relatedCount = computed(() => {
    const target = deleting.value;
    if (!target || !app.data) return 0;
    const data = app.data as any;
    const owned = ['transactions', 'sessions', 'goals', 'equipment'].reduce(
        (sum, key) =>
            sum + (data[key] as any[]).filter((item) => item.characterId === target.id).length,
        0,
    );
    const equipmentIds = new Set(
        (data.equipment as any[])
            .filter((item) => item.characterId === target.id)
            .map((item) => item.id),
    );
    const logs = (data.gearLogs as any[]).filter(
        (log) => log.characterId === target.id || equipmentIds.has(log.equipmentId),
    ).length;
    const active = data.activeSession?.characterId === target.id ? 1 : 0;
    return owned + logs + active;
});
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
const sort = useDragSort({
    keys: () => app.characters.map((character) => character.id),
    scroll: () => content.value,
    enabled: () => !app.busy,
    onMove: ({ key, targetKey, position }) => void move(key, targetKey, position),
});
function keyboardMove(id: string, offset: number) {
    sort.moveBy(id, offset);
}
</script>
<template>
    <PageHeader title="角色" description="角色档案 · 技能修炼 · 养成记录">
        <template #actions>
            <button class="btn" :disabled="app.busy" @click="historyId = 'all'">养成记录</button>
            <button ref="addButton" class="btn primary" :disabled="app.busy" @click="editing = {}">
                ＋ 添加角色
            </button>
        </template>
    </PageHeader>
    <div ref="content" class="page-content" @dragend="sort.end()" @drop="sort.end()">
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
                :class="sort.state(character.id)"
                @dragover="sort.over(character.id, $event)"
                @drop.stop="sort.drop($event, character.id)"
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
                    @drag="sort.start(character.id, $event)"
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
            条相关记录（收益、在线、账号账本、目标、装备）与装备变更日志会一并删除，且无法恢复。
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

<style scoped>
.character-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
    gap: 20px;
    align-items: start;
    justify-content: start;
}
.card-wrapper {
    position: relative;
    min-width: 420px;
    max-width: 520px;
}
@media (max-width: 750px) {
    .character-grid {
        grid-template-columns: minmax(420px, 520px);
    }
}
</style>
