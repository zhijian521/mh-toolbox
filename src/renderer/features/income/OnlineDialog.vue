<script setup lang="ts">
import { computed, ref } from 'vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import BaseModal from '../../components/BaseModal.vue';
import BaseDate from '../../components/BaseDate.vue';
import BaseNumber from '../../components/BaseNumber.vue';

/**
 * 补记在线时长，以及把正在计时那一段的起点改到真实上线时间。
 *
 * 两个模式填的是同一组东西（哪天、几点 / 多久），区别只在落库方式：
 * 补录写一条 `mode: 'duration'` 的会话；调整起点走 `adjustSessionStart`，结束时间仍是现在。
 *
 * 在线角色是多选：勾了几个就按几个结算点卡，「同时在线角色数」不再是单独一个输入框。
 *
 * 点卡折算与校验都交给领域（`makeSession` / `sessionError`），页面不另算一遍，
 * 否则「6 点 / 小时 × 角色数 × 单价」的公式就有第二份实现。
 */
const props = defineProps<{ mode: 'backfill' | 'adjust'; character?: string }>();
/** `saved` 带出受影响的那几天，页面据此把账号里的「游戏收益」重新同步一遍。 */
const emit = defineEmits<{ close: []; saved: [dates: string[]] }>();
const app = useApplication();
const rules = app.rules();
const quick = rules.state.quickSettings || { accounts: 5, cardPrice: 15000 };
const active = rules.state.activeSession;
const started = new Date(Number(active?.startAt) || Date.now());

/** 补录：忘记点「开始游戏」后的补救。调整起点：计时已经开始，把起点往回拨。 */
const backfill = computed(() => props.mode === 'backfill');
/** 在线角色：默认全选，勾了几个就按几个算点卡。 */
const selected = ref<string[]>(app.characters.map((item) => item.id));
const accounts = computed(() => selected.value.length);
/** 点卡流水挂在页面筛选的那个角色上；它被取消勾选时退回第一个选中的。 */
const characterId = computed(() =>
    props.character && props.character !== 'all' && selected.value.includes(props.character)
        ? props.character
        : selected.value[0] || '',
);
const date = ref(backfill.value ? U.today() : U.fmtDate(started));
const hours = ref<number | string>(backfill.value ? 2 : started.getHours());
const minutes = ref<number | string>(backfill.value ? 0 : started.getMinutes());
const price = ref<number | string>(quick.cardPrice / 10000);
const note = ref('');
const dirty = ref(false);
const error = ref('');

/** 勾选顺序固定按角色页的排序，结算归属才稳定。 */
function toggle(id: string) {
    const next = selected.value.includes(id)
        ? selected.value.filter((item) => item !== id)
        : [...selected.value, id];
    selected.value = app.characters.filter((item) => next.includes(item.id)).map((item) => item.id);
    dirty.value = true;
}

/** 同一个数字在两种模式下含义不同：补录是时长，调整起点是「几点几分」。 */
const span = computed(() => (Number(hours.value) || 0) * 60 + (Number(minutes.value) || 0));
const draft = computed(() =>
    rules.makeSession({
        id: 'draft',
        characterId: characterId.value,
        mode: 'duration',
        date: date.value,
        minutes: span.value,
        accounts: accounts.value,
        cardPrice: Math.round((Number(price.value) || 0) * 10000),
        note: note.value.trim(),
        source: 'manual',
    }),
);
const startAt = computed(() => U.parseDate(date.value).getTime() + span.value * 60000);
const preview = computed(() => {
    if (!backfill.value) {
        const elapsed = Math.max(0, Date.now() - startAt.value) / 60000;
        return '改后本次已在线 ' + (elapsed / 60).toFixed(2) + ' 小时';
    }
    const record = draft.value;
    if (!(record.minutes > 0)) return '填写时长后预览点卡费用';
    return (
        '补记 ' +
        (record.minutes / 60).toFixed(2) +
        ' 小时 · ' +
        accounts.value +
        ' 角色 · 点卡 ' +
        U.fmtMoney(record.cost) +
        (spansToday() ? '' : ' · 跨天请分两次补')
    );
});
/** 补录的时长是「一段」不是「一段时间」，超过当天剩余时间就没法按天分摊地记。 */
function spansToday() {
    return span.value <= 1440;
}

async function save() {
    if (app.busy) return;
    error.value = '';
    if (backfill.value) {
        if (!accounts.value) {
            error.value = '至少选一个在线角色';
            return;
        }
        const record = draft.value;
        const problem = rules.sessionError(record);
        if (problem) {
            error.value = String(problem);
            return;
        }
        try {
            await app.execute((domain) =>
                domain.saveSession({ ...record, id: U.uid() }, undefined),
            );
            app.notify(
                '已补记在线 ' +
                    (record.minutes / 60).toFixed(2) +
                    ' 小时，点卡 −' +
                    U.fmtMoney(record.cost),
            );
            emit('saved', [String(record.date || date.value)]);
        } catch (failure) {
            error.value = failure instanceof Error ? failure.message : String(failure);
        }
        return;
    }
    if (!Number.isFinite(startAt.value) || startAt.value >= Date.now()) {
        error.value = '开始时间需早于现在';
        return;
    }
    try {
        await app.execute((domain) => domain.adjustSessionStart(startAt.value));
        app.notify('已把开始时间改到 ' + date.value + ' ' + timeText());
        // 起点往回拨可能跨到昨天，那天的点卡（以及当天收益）也要跟着重算。
        emit('saved', daysFrom(startAt.value));
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
/** 起点到现在覆盖的日期，最多 8 天，纯属防坏数据。 */
function daysFrom(start: number) {
    const list: string[] = [];
    let cursor = U.fmtDate(new Date(start || Date.now()));
    const today = U.today();
    while (cursor <= today && list.length < 8) {
        list.push(cursor);
        cursor = U.addDays(cursor, 1);
    }
    return list;
}
function timeText() {
    const pad = (value: number) => String(value).padStart(2, '0');
    return pad(Number(hours.value) || 0) + ':' + pad(Number(minutes.value) || 0);
}
</script>
<template>
    <BaseModal
        :title="backfill ? '补记在线时长' : '调整开始时间'"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <p class="hint">
            {{
                backfill
                    ? '忘了点「开始游戏」时用这里补一段。点卡按每小时 6 点 × 角色数折算，跨天请分两次补。'
                    : '只把这一段的起点改到实际开始的时间，结束时间仍然是现在。'
            }}
        </p>
        <form id="online-form" class="online-form" @submit.prevent="save">
            <div v-if="backfill" class="who">
                <span class="who-label">
                    在线角色
                    <small>{{ accounts }} 个</small>
                </span>
                <div class="who-chips">
                    <button
                        v-for="item in app.characters"
                        :key="item.id"
                        type="button"
                        class="who-chip"
                        :class="{ on: selected.includes(item.id) }"
                        :aria-pressed="selected.includes(item.id)"
                        :disabled="app.busy"
                        @click="toggle(item.id)"
                    >
                        {{ item.name }}
                    </button>
                </div>
            </div>
            <div class="online-row">
                <label>
                    {{ backfill ? '日期' : '开始日期' }}
                    <BaseDate
                        v-model="date"
                        :label="backfill ? '补记日期' : '开始日期'"
                        :max="U.today()"
                    />
                </label>
                <label>
                    {{ backfill ? '小时' : '时' }}
                    <BaseNumber
                        v-model="hours"
                        name="hours"
                        :min="0"
                        :max="23"
                        @update:model-value="dirty = true"
                    />
                </label>
                <label>
                    {{ backfill ? '分钟' : '分' }}
                    <BaseNumber
                        v-model="minutes"
                        name="minutes"
                        :min="0"
                        :max="59"
                        @update:model-value="dirty = true"
                    />
                </label>
            </div>
            <div v-if="backfill" class="online-row two">
                <label>
                    点卡单价（万 / 点）
                    <BaseNumber
                        v-model="price"
                        name="price"
                        :min="0"
                        :step="0.01"
                        @update:model-value="dirty = true"
                    />
                </label>
                <label>
                    备注
                    <input
                        v-model="note"
                        name="note"
                        type="text"
                        placeholder="选填"
                        @input="dirty = true"
                    />
                </label>
            </div>
        </form>
        <p class="hint preview" aria-live="polite">{{ preview }}</p>
        <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="online-form" :disabled="app.busy">
                {{ backfill ? '补记' : '保存' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.online-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 14px;
}
.online-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 84px 84px;
    gap: 12px;
}
.online-row.two {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.who {
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.who-label {
    color: var(--muted);
    font-size: 13px;
}
.who-label small {
    margin-left: 5px;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
}
.who-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.who-chip {
    padding: 6px 12px;
    border: 1px solid var(--line-2);
    border-radius: 4px;
    background: var(--paper);
    color: var(--muted);
    font-family: inherit;
    font-size: 13px;
    transition:
        border-color 120ms ease,
        background 120ms ease,
        color 120ms ease;
}
.who-chip:hover:not(:disabled) {
    border-color: var(--gold);
}
.who-chip.on {
    border-color: var(--red);
    background: #f2e6d5;
    color: var(--red);
    font-weight: 600;
}
.preview {
    margin: 14px 0 0;
    font-size: 12px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
