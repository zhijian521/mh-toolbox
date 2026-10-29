<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EquipmentDraft, EquipmentProfile } from '../../app/types';
import { useApplication } from '../../stores/application';
import BaseModal from '../../components/BaseModal.vue';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import { splitEquipmentBlocks } from './import-text';

/**
 * 粘贴文本导入。
 *
 * 解析、建档、校验全部由领域负责（`parseEquipmentText` / `equipmentImportError` /
 * `importEquipment`），这里只做两件事：切块（一件一块）和让人核对。
 *
 * 核对这一步不能省：识别不出的部分会留空，部位猜错会写成别的装备，而批量入库是
 * 一次事务——一条非法就让整批回滚，所以入库前先把每一条的错误摆出来。
 *
 * V1 的入口是截图 OCR，V2 没有识别通道，先做文本粘贴：游戏里复制装备属性再贴进来，
 * 格式与 OCR 结果是同一套文本，等引擎接回来时这个核对界面可以原样复用。
 */
const props = defineProps<{ profile: EquipmentProfile }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();

const text = ref('');
const rows = ref<Array<{ draft: EquipmentDraft; error: string }>>([]);
const plan = ref('');
const error = ref('');
const dirty = computed(() => !!text.value.trim() || rows.value.length > 0);
const limit = rules.equipmentImportLimits.count;
/** 导入要求落到具体部位：`其他`没有词条规则，批量建档也判断不了该穿哪个格子。 */
const slotOptions = computed(() =>
    rules.slots.filter((slot) => slot !== '其他').map((slot) => ({ value: slot, label: slot })),
);
/** 玉魄没有装备等级，填了也会被领域置空，干脆不显示这一栏。 */
const jadeSlot = (slot: string) => rules.isJade(slot);
const planOptions = computed(() => [
    { value: '', label: '只入库，不自动穿戴' },
    ...props.profile.equipmentSets.map((set, index) => ({
        value: String(index),
        label: set.name,
    })),
]);
const broken = computed(() => rows.value.filter((row) => row.error).length);
const canSubmit = computed(() => rows.value.length > 0 && broken.value === 0 && !app.busy);

function refresh(row: { draft: EquipmentDraft; error: string }) {
    // 空名称先按「没填」处理，避免用户还在打字时就把整行标红。
    row.error = rules.equipmentImportError(row.draft, props.profile.id);
}
function parse() {
    error.value = '';
    const blocks = splitEquipmentBlocks(text.value);
    if (!blocks.length) {
        error.value = '请先把装备属性粘贴进来';
        rows.value = [];
        return;
    }
    if (blocks.length > limit) {
        error.value = '一次最多 ' + limit + ' 件，请分批粘贴';
        rows.value = [];
        return;
    }
    rows.value = blocks.map((block) => {
        const draft = rules.parseEquipmentText(block) as EquipmentDraft;
        return { draft, error: rules.equipmentImportError(draft, props.profile.id) };
    });
}
async function submit() {
    if (!canSubmit.value) return;
    error.value = '';
    try {
        const result = await app.execute((domain) =>
            domain.importEquipment(
                rows.value.map((row) => row.draft),
                {
                    characterId: props.profile.id,
                    index: plan.value === '' ? null : Number(plan.value),
                },
            ),
        );
        const parts = ['新建 ' + result.created + ' 件'];
        if (result.reused) parts.push('已存在 ' + result.reused + ' 件');
        if (result.equipped) parts.push('穿戴 ' + result.equipped + ' 件');
        else if (result.stored) parts.push('入库 ' + result.stored + ' 件');
        app.notify(parts.join('，'));
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal title="粘贴导入装备" medium :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="hint">
            在游戏里打开装备详情，复制属性文本后整段贴进来。空行或「名称：」开头的行会被当作新的一件，一次最多
            {{ limit }} 件。
        </p>
        <form id="import-form" class="import-form" @submit.prevent="parse">
            <textarea
                v-model="text"
                name="paste"
                rows="5"
                placeholder="名称：霜寒&#10;等级：120&#10;伤害 +480&#10;命中 +530"
            ></textarea>
            <div class="import-tools">
                <button class="btn" type="submit" :disabled="app.busy || !text.trim()">
                    解析文本
                </button>
                <span v-if="rows.length" class="hint">
                    识别出 {{ rows.length }} 件
                    <span v-if="broken">· {{ broken }} 件待补齐</span>
                </span>
            </div>
        </form>

        <ul v-if="rows.length" class="items">
            <li v-for="(row, index) in rows" :key="index" class="item" :class="{ bad: row.error }">
                <div class="item-head">
                    <b>{{ row.draft.name || '（未识别名称）' }}</b>
                    <span class="hint">
                        {{ row.draft.slot || '部位未识别' }}
                        <template v-if="row.draft.level !== ''">
                            · {{ row.draft.level }} 级
                        </template>
                        <template
                            v-if="row.draft.slot === '玉魄·阳' || row.draft.slot === '玉魄·阴'"
                        >
                            · 灵尘 {{ row.draft.dustLevel === '' ? '—' : row.draft.dustLevel }} ·
                            {{ row.draft.holes === '' ? '未开光' : row.draft.holes + ' 孔' }}
                        </template>
                    </span>
                    <button
                        class="btn compact danger"
                        type="button"
                        :aria-label="'移除第 ' + (index + 1) + ' 件'"
                        @click="rows.splice(index, 1)"
                    >
                        移除
                    </button>
                </div>
                <div class="item-fields">
                    <label>
                        名称
                        <input
                            :value="row.draft.name"
                            type="text"
                            :name="'item-name-' + index"
                            placeholder="必填"
                            @input="
                                (event) => {
                                    row.draft.name = (event.target as HTMLInputElement).value;
                                    refresh(row);
                                }
                            "
                        />
                    </label>
                    <label>
                        部位
                        <BaseSelect
                            :model-value="row.draft.slot"
                            :options="slotOptions"
                            label="装备部位"
                            @update:model-value="
                                (value) => {
                                    row.draft.slot = value;
                                    refresh(row);
                                }
                            "
                        />
                    </label>
                    <label v-if="!jadeSlot(row.draft.slot)">
                        等级
                        <BaseNumber
                            :model-value="row.draft.level"
                            :min="0"
                            :max="999"
                            placeholder="可不填"
                            @update:model-value="
                                (value) => {
                                    row.draft.level = value;
                                    refresh(row);
                                }
                            "
                        />
                    </label>
                </div>
                <p v-if="row.draft.attributes" class="item-attrs">{{ row.draft.attributes }}</p>
                <p v-if="row.draft.special" class="item-attrs">{{ row.draft.special }}</p>
                <p v-if="row.error" class="error item-error" role="alert">{{ row.error }}</p>
                <!--
                    玉魄的结构化属性（基础、两条附加、灵尘与开光）没法在这张核对表里补齐，
                    所以不能只丢一句报错让人干瞪眼：明确告诉用户去装备编辑器里新增。
                -->
                <p v-if="row.error && jadeSlot(row.draft.slot)" class="hint item-hint">
                    玉魄这三条属性与灵尘、开光要在装备编辑器里填。这一条先移除，入库后在仓库里「＋
                    新增装备」选玉魄。
                </p>
            </li>
        </ul>

        <div v-if="rows.length" class="import-plan">
            <label>
                入库后
                <BaseSelect v-model="plan" label="入库后是否穿戴" :options="planOptions" />
            </label>
            <p class="hint">只在目标方案该部位还是空的时候才穿，已有的格子不会被顶掉。</p>
        </div>

        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="button" :disabled="!canSubmit" @click="submit">
                {{ app.busy ? '入库中…' : '入库 ' + rows.length + ' 件' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.import-form {
    margin-top: 12px;
}
.import-form textarea {
    font-family: var(--font-mono, inherit);
    line-height: 1.7;
}
.import-tools {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
}
.items {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
}
.item {
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--paper-2);
}
.item.bad {
    border-color: color-mix(in srgb, var(--red) 45%, var(--line));
}
.item-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.item-head b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
}
.item-head .hint {
    margin-right: auto;
    font-size: 11.5px;
}
.item-fields {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 0.8fr);
    gap: 8px;
    margin-top: 8px;
}
.item-fields label {
    display: block;
    min-width: 0;
    color: var(--muted);
    font-size: 11.5px;
}
.item-fields input {
    margin-top: 3px;
}
.item-attrs {
    margin: 8px 0 0;
    color: var(--muted);
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre-line;
}
.item-error {
    margin: 6px 0 0;
    font-size: 11.5px;
}
.item-hint {
    margin: 4px 0 0;
    font-size: 11.5px;
}
.import-plan {
    margin-top: 14px;
}
.import-plan label {
    display: block;
    font-size: 12.5px;
}
.import-plan .hint {
    margin-top: 6px;
    font-size: 11.5px;
}
</style>
