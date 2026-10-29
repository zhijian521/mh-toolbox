<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useApplication } from '../../stores/application';
import { U } from '../../domain/util.js';
import { POINTS_PER_HOUR } from '../../domain/online.js';
import BaseModal from '../../components/BaseModal.vue';
import BaseDate from '../../components/BaseDate.vue';
import BaseNumber from '../../components/BaseNumber.vue';

/**
 * 开始/加入计时、补记在线时长，以及把某一段的起点改到真实上线时间。
 *
 * 三个模式共用同一组输入（哪些号在线、点卡单价），区别只在落库方式：
 * 开始走 `startSessions`（每个号一段，已在线的跳过），补录写一条 `mode: 'duration'`
 * 的会话，调整起点走 `adjustSessionStart`（结束时间仍是现在）。
 *
 * **开始模式不再要求「没有正在计时的记录」**：已经开着的号在列表里显示为「在线中」
 * 且不可勾选，勾上的只会是这次新加的号。于是「先起一个、玩一会再加两个」这种错峰
 * 玩法不需要先全部结束。
 *
 * 点卡折算与校验都交给领域（`makeSession` / `sessionError`），页面不另算一遍，
 * 否则「6 点 / 小时 × 角色数 × 单价」的公式就有第二份实现。
 */
const props = defineProps<{
    mode: 'start' | 'backfill' | 'adjust';
    character?: string;
    sessionId?: string;
}>();
/** `saved` 带出受影响的那几天，页面据此把账号里的「游戏收益」重新同步一遍。 */
const emit = defineEmits<{ close: []; saved: [dates: string[]] }>();
const app = useApplication();
const rules = app.rules();
const quick = rules.state.quickSettings || { cardPrice: 15000 };
/** 正在计时的段；开始模式要跳过这些角色，调整模式要选其中一段。 */
const running = rules.runningSessions();
const onlineIds = new Set<string>();
running.forEach((session) => {
    rules.rosterOf(session).forEach((id) => onlineIds.add(String(id)));
});
/** 调整起点作用于哪一段：页面点的那一段，其次最早的一段。 */
const targetId = ref(String(props.sessionId || running[0]?.id || ''));
const target = computed(
    () => running.find((session) => String(session.id) === targetId.value) || running[0] || null,
);
const initial = new Date(Number(target.value?.startAt) || Date.now());

/** 补录：忘记点「开始游戏」后的补救。调整起点：计时已经开始，把起点往回拨。 */
const backfill = computed(() => props.mode === 'backfill');
/** 开始：只问这次几个号在线、点卡什么价，时长从现在开始算。 */
const starting = computed(() => props.mode === 'start');
/** 调整起点：多开时要能选中具体的号。 */
const adjusting = computed(() => props.mode === 'adjust');
const title = computed(() =>
    starting.value
        ? running.length
            ? '加入角色'
            : '开始游戏'
        : backfill.value
          ? '补记在线时长'
          : '调整开始时间',
);
/**
 * 在线角色：开始模式默认勾上还没在线的全部，补记保持全选。
 *
 * 已在计时的角色不参与勾选——同一角色叠出两段计时会让点卡按双份扣。
 */
const selected = ref<string[]>(
    starting.value
        ? app.characters.filter((item) => !onlineIds.has(item.id)).map((item) => item.id)
        : app.characters.map((item) => item.id),
);
const accounts = computed(() => selected.value.length);
/** 点卡流水挂在页面筛选的那个角色上；它被取消勾选时退回第一个选中的。 */
const characterId = computed(() =>
    props.character && props.character !== 'all' && selected.value.includes(props.character)
        ? props.character
        : selected.value[0] || '',
);
const date = ref(backfill.value ? U.today() : U.fmtDate(initial));
const hours = ref<number | string>(backfill.value ? 2 : initial.getHours());
const minutes = ref<number | string>(backfill.value ? 0 : initial.getMinutes());
const price = ref<number | string>(quick.cardPrice / 10000);
const note = ref('');
const dirty = ref(false);
const error = ref('');

/** 勾选顺序固定按角色页的排序，结算归属才稳定。 */
function toggle(id: string) {
    if (onlineIds.has(id)) return;
    const next = selected.value.includes(id)
        ? selected.value.filter((item) => item !== id)
        : [...selected.value, id];
    selected.value = app.characters.filter((item) => next.includes(item.id)).map((item) => item.id);
    dirty.value = true;
}
/** 换一个号调整起点时，日期与时刻要跟着那一段走。 */
watch(targetId, () => {
    const at = new Date(Number(target.value?.startAt) || Date.now());
    date.value = U.fmtDate(at);
    hours.value = at.getHours();
    minutes.value = at.getMinutes();
    dirty.value = true;
});

/** 同一个数字在两种模式下含义不同：补录是时长，调整起点是「几点几分」。 */
const span = computed(() => (Number(hours.value) || 0) * 60 + (Number(minutes.value) || 0));
const draft = computed(() =>
    rules.makeSession({
        id: 'draft',
        characterId: characterId.value,
        /* 勾选的角色就是这次的在线名单：点卡按人头乘，结算与速记也都按它分摊。 */
        roster: selected.value,
        mode: 'duration',
        date: date.value,
        minutes: span.value,
        accounts: accounts.value,
        cardPrice: U.wanToCash(price.value),
        note: note.value.trim(),
        source: 'manual',
    }),
);
const startAt = computed(() => U.parseDate(date.value).getTime() + span.value * 60000);
/** 开始模式下换算成「每小时花多少」，比让用户自己乘 6 点更直观。 */
const hourCost = computed(
    () =>
        rules.makeSession({
            id: 'draft',
            characterId: characterId.value || 'x',
            mode: 'duration',
            date: U.today(),
            minutes: 60,
            accounts: accounts.value,
            cardPrice: U.wanToCash(price.value),
            source: 'manual',
        }).cost,
);
const preview = computed(() => {
    if (starting.value) {
        if (!accounts.value) return '没有可加入的角色：勾上的号都已在计时中';
        return (
            '新增 ' +
            accounts.value +
            ' 个号 · 每小时 ' +
            POINTS_PER_HOUR * accounts.value +
            ' 点 · 约 ' +
            U.fmtMoney(hourCost.value) +
            ' / 小时'
        );
    }
    if (!backfill.value) {
        const elapsed = Math.max(0, Date.now() - startAt.value) / 60000;
        const name = target.value
            ? rules.charName(String(target.value.characterId || '')) + ' '
            : '';
        return name + '改后本次已在线 ' + (elapsed / 60).toFixed(2) + ' 小时';
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
    if (starting.value) {
        if (!accounts.value) {
            error.value = '没有可加入的角色：勾上的号都已在计时中';
            return;
        }
        const priceValue = U.wanToCash(price.value);
        if (!Number.isFinite(priceValue) || priceValue <= 0) {
            error.value = '请填写有效的点卡单价';
            return;
        }
        try {
            // 一次 execute 里先写参数再开始：`startSessions` 内部的 commit 会把参数一起落盘，
            // 分成两次就会出现「参数存了、计时没开」的中间态。
            const created = (await app.execute(async (domain) => {
                domain.setQuickSettings({ cardPrice: priceValue });
                return domain.startSessions(selected.value);
            })) as unknown as Array<{ id: string }>;
            app.notify(
                '开始计时 · 新增 ' +
                    created.length +
                    ' 个号' +
                    (onlineIds.size ? '，另有 ' + onlineIds.size + ' 个号继续计时' : ''),
            );
            // 刚开始没有点卡流水，不需要重算任何日期的收益。
            emit('saved', []);
        } catch (failure) {
            error.value = failure instanceof Error ? failure.message : String(failure);
        }
        return;
    }
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
    if (!target.value) {
        error.value = '没有正在计时的记录';
        return;
    }
    if (!Number.isFinite(startAt.value) || startAt.value >= Date.now()) {
        error.value = '开始时间需早于现在';
        return;
    }
    try {
        await app.execute((domain) =>
            domain.adjustSessionStart(startAt.value, String(target.value?.id || '')),
        );
        app.notify(
            '已把 ' +
                rules.charName(String(target.value.characterId || '')) +
                ' 的开始时间改到 ' +
                date.value +
                ' ' +
                timeText(),
        );
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
    <BaseModal :title="title" :busy="app.busy" :dirty="dirty" @close="emit('close')">
        <p class="hint">
            {{
                starting
                    ? '勾上这次新上线的号。点卡按每号每小时 ' +
                      POINTS_PER_HOUR +
                      ' 点分别计，之后每个号都能单独结束，不用等一起退。'
                    : backfill
                      ? '忘了点「开始游戏」时用这里补一段。点卡按每小时 ' +
                        POINTS_PER_HOUR +
                        ' 点 × 角色数折算，跨天请分两次补。'
                      : '只把这一段（或选中的那个号）的起点改到实际开始的时间，结束时间仍然是现在。'
            }}
        </p>
        <form id="online-form" class="online-form" @submit.prevent="save">
            <div v-if="backfill || starting" class="who">
                <span class="who-label">
                    {{ starting ? '这次加入哪些号' : '在线角色' }}
                    <small>{{ accounts }} 个</small>
                </span>
                <div class="who-chips">
                    <button
                        v-for="item in app.characters"
                        :key="item.id"
                        type="button"
                        class="who-chip"
                        :class="{
                            on: selected.includes(item.id),
                            'on-line': onlineIds.has(item.id),
                        }"
                        :aria-pressed="selected.includes(item.id)"
                        :disabled="app.busy || onlineIds.has(item.id)"
                        :title="onlineIds.has(item.id) ? '已在计时中，不用重复添加' : ''"
                        @click="toggle(item.id)"
                    >
                        {{ item.name }}
                        <template v-if="onlineIds.has(item.id)">· 在线中</template>
                    </button>
                </div>
            </div>
            <div v-if="adjusting && running.length > 1" class="who">
                <span class="who-label">
                    调整哪个号
                    <small>{{ running.length }} 个</small>
                </span>
                <div class="who-chips">
                    <button
                        v-for="item in running"
                        :key="item.id"
                        type="button"
                        class="who-chip"
                        :class="{ on: String(item.id) === targetId }"
                        :aria-pressed="String(item.id) === targetId"
                        :disabled="app.busy"
                        @click="targetId = String(item.id)"
                    >
                        {{ rules.charName(String(item.characterId || '')) }}
                    </button>
                </div>
            </div>
            <div v-if="!starting" class="online-row">
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
            <!-- 开始模式只要单价：备注与时长都还没发生，填了也没处落。 -->
            <div v-if="starting" class="online-row">
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
            </div>
            <div v-else-if="backfill" class="online-row two">
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
                {{ starting ? (running.length ? '加入' : '开始计时') : backfill ? '补记' : '保存' }}
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
    background: color-mix(in srgb, var(--red) 12%, var(--paper));
    color: var(--red);
    font-weight: 600;
}
/* 已在计时的号：留着可见但不可点，避免同一角色叠出两段计时。 */
.who-chip.on-line {
    border-style: dashed;
    opacity: 0.6;
    cursor: default;
}
.preview {
    margin: 14px 0 0;
    font-size: 12px;
}
</style>
