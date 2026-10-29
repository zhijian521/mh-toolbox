<script setup lang="ts">
import { computed } from 'vue';
import { useApplication } from '../../stores/application';
import BaseNumber from '../../components/BaseNumber.vue';
import BaseSelect, { type SelectOption } from '../../components/BaseSelect.vue';
import type { DraftDetail, DraftRow } from './properties';

/**
 * 装备结构化属性编辑器。
 *
 * 分组与字段全部按部位派生（`equipmentRule`），而不是给每个部位写一套表单：
 * 武器有伤害命中、灵饰只有一条主属性、玉魄换成灵尘与奇袭，写在规则里就不会漏。
 *
 * 校验不在这里做。页面只负责把「用户想要的值」摆出来，能不能入库由
 * `validateEquipmentDetails` 判定——同一套规则也被导入与读取修复复用，界面再写一份
 * 必然会跟领域漂移（例如「永不磨损与坚固不能同时出现」这种跨字段约束）。
 *
 * 数值框发的是 `number | ''`，领域要 `number | null`：0 与「没填」在账面和校验上
 * 都是两件事，所以这里逐处转换，不做 `Number(value) || 0` 这种抹平。
 */
const detail = defineModel<DraftDetail>({ required: true });
const props = defineProps<{ part: string }>();
const app = useApplication();
const rules = app.rules();

const rule = computed(() => rules.equipmentRule(props.part));
const kind = computed(() => String(rule.value.kind));
const isGear = computed(() => kind.value === 'gear');
const isAccessory = computed(() => kind.value === 'accessory');
const isJade = computed(() => kind.value === 'jade');
/** 只有灵饰与玉魄的词条有「强化加成」这一栏，普通装备写了也不合法。 */
const boostable = computed(() => isAccessory.value || isJade.value);

const option = (value: string, text: string): SelectOption => ({ value, label: text });
const blank = option('', '未选择');
const label = (key: string) => rules.equipmentStats[key] || key;
const statOptions = (keys: string[]): SelectOption[] => [
    blank,
    ...keys.map((key) => option(key, label(key))),
];
const plainOptions = (list: string[], text?: string): SelectOption[] => [
    blank,
    ...list.map((item) => option(item, text ?? item)),
];

const asNumber = (value: number | '') => (value === '' ? null : value);
function setValue(row: DraftRow, value: number | '') {
    row.value = asNumber(value);
}
function setBoost(row: DraftRow, value: number | '') {
    row.boost = asNumber(value);
}

/* ---------- 主要属性：普通装备是固定的几条，灵饰与玉魄只有一条 ---------- */
function baseRow(key: string) {
    return detail.value.base.find((row) => row.key === key) || null;
}
function baseValue(key: string) {
    return baseRow(key)?.value ?? null;
}
function setBase(key: string, value: number | '') {
    const rest = detail.value.base.filter((row) => row.key !== key);
    if (value !== '') rest.push({ key, value, boost: null });
    // 按部位规则的顺序重排：详情与导出文本的先后不该随录入顺序变化。
    detail.value.base = rule.value.base
        .map((item: string) => rest.find((row) => row.key === item))
        .filter((row: DraftRow | undefined): row is DraftRow => !!row);
}
const baseSingle = computed(() => detail.value.base[0] || null);
const baseKey = computed(() => baseSingle.value?.key || '');
function setBaseKey(key: string) {
    if (!key) {
        detail.value.base = [];
        return;
    }
    detail.value.base = [
        {
            key,
            value: baseSingle.value?.value ?? null,
            boost: baseSingle.value?.boost ?? null,
        },
    ];
}
function setBaseValue(value: number | '') {
    const row = detail.value.base[0];
    if (!row) return;
    row.value = asNumber(value);
}
function setBaseBoost(value: number | '') {
    const row = detail.value.base[0];
    if (!row) return;
    row.boost = asNumber(value);
}

/* ---------- 附加 / 宝石增加 / 熔炼：都是「可增删的词条行」 ---------- */
type RowGroup = 'extra' | 'bonus' | 'melt';
function poolOf(group: RowGroup): string[] {
    if (group === 'bonus') return rule.value.bonus;
    if (group === 'melt') return [...rule.value.base, ...rule.value.extra];
    return rule.value.extra;
}
const extraMax = computed(() => (isAccessory.value ? 3 : 2));
const bonusMax = computed(() => rule.value.bonus.length as number);
const meltMax = computed(() => rule.value.base.length + rule.value.extra.length);
function rowsOf(group: RowGroup) {
    return detail.value[group];
}
function canAdd(group: RowGroup) {
    const max =
        group === 'bonus' ? bonusMax.value : group === 'melt' ? meltMax.value : extraMax.value;
    return rowsOf(group).length < max;
}
function addRow(group: RowGroup) {
    if (!canAdd(group)) return;
    const pool = poolOf(group);
    const used = rowsOf(group).map((row) => row.key);
    // 默认挑一条还没用过的：重复的 key 会被严格校验拦下，让人自己换一遍更费事。
    rowsOf(group).push({
        key: pool.find((key) => !used.includes(key)) || pool[0] || '',
        value: null,
        boost: null,
    });
}
function removeRow(group: RowGroup, index: number) {
    rowsOf(group).splice(index, 1);
}

/* ---------- 特技与特效 ---------- */
function toggleEffect(effect: string) {
    const list = detail.value.effects;
    detail.value.effects = list.includes(effect)
        ? list.filter((item) => item !== effect)
        : [...list, effect];
}

/* ---------- 宝石 / 钟灵石 / 精炼 ---------- */
function gemOf(type: string) {
    return detail.value.gems.find((gem) => gem.type === type) || null;
}
function toggleGem(type: string, event: Event) {
    const on = (event.target as HTMLInputElement).checked;
    const rest = detail.value.gems.filter((gem) => gem.type !== type);
    if (on) rest.push({ type, level: null });
    // 按部位允许的宝石顺序排，写入文本的顺序才是稳定的。
    detail.value.gems = (rule.value.gems as string[])
        .map((name) => rest.find((gem) => gem.type === name))
        .filter(
            (
                gem: { type: string; level: number | null } | undefined,
            ): gem is { type: string; level: number | null } => !!gem,
        );
}
function setGemLevel(type: string, value: number | '') {
    const gem = gemOf(type);
    if (gem) gem.level = asNumber(value);
}

/* ---------- 玉魄：灵尘与奇袭 ---------- */
const holeOptions = computed(() => [
    option('0', '未开光 / 未记录'),
    ...[1, 2, 3].map((count) => option(String(count), count + ' 个')),
]);
/**
 * 开光孔数决定要填几个孔位。
 *
 * 孔数一减就把多出来的孔位内容裁掉：留着不显示的旧文本会在下次加孔时「诈尸」，
 * 而且 `validateEquipmentDetails` 也不允许强化条数超过孔数。
 */
const holes = computed({
    get: () => String(detail.value.jade.holes ?? 0),
    set: (raw: string) => {
        const total = Number(raw);
        const list = detail.value.jade.enchantments.slice(0, total);
        while (list.length < total) list.push('');
        detail.value.jade.enchantments = list;
        detail.value.jade.holes = total;
    },
});
const holeLabel = computed(() => (props.part === '玉魄·阳' ? '灵契' : '祝符'));

/* ---------- 其他信息 ---------- */
const elementOptions = ['金', '木', '水', '火', '土'].map((item) => option(item, item));
const durabilityMax = computed(() => (isJade.value ? 300 : 999999));
</script>

<template>
    <div class="eq-fields">
        <section v-if="isGear" class="group">
            <h4>主要属性</h4>
            <div class="grid">
                <label v-for="key in rule.base" :key="key" class="fld">
                    {{ label(key) }}
                    <BaseNumber
                        :model-value="baseValue(key)"
                        :name="'eq-base-' + key"
                        :min="0"
                        placeholder="未记录"
                        @update:model-value="(value) => setBase(key, value)"
                    />
                </label>
            </div>
        </section>

        <section v-else-if="boostable" class="group">
            <h4>{{ isJade ? '基础属性' : '主要属性' }}</h4>
            <p class="hint">只能选一条，按游戏显示值填写。</p>
            <div class="grid">
                <label class="fld">
                    属性
                    <BaseSelect
                        :model-value="baseKey"
                        :options="statOptions(rule.base)"
                        label="主属性"
                        @update:model-value="setBaseKey"
                    />
                </label>
                <label class="fld">
                    数值
                    <BaseNumber
                        :model-value="baseSingle ? baseSingle.value : null"
                        name="eq-base-value"
                        :min="0"
                        :disabled="!baseSingle"
                        placeholder="未记录"
                        @update:model-value="setBaseValue"
                    />
                </label>
                <label v-if="isAccessory" class="fld">
                    强化加成
                    <BaseNumber
                        :model-value="baseSingle ? baseSingle.boost : null"
                        :min="0"
                        :disabled="!baseSingle"
                        placeholder="可不填"
                        @update:model-value="setBaseBoost"
                    />
                </label>
            </div>
        </section>

        <section v-if="rule.extra.length" class="group">
            <div class="group-head">
                <h4>附加属性</h4>
                <span class="hint">最多 {{ extraMax }} 条</span>
                <button
                    v-if="canAdd('extra')"
                    class="btn compact add"
                    type="button"
                    @click="addRow('extra')"
                >
                    ＋ 添加
                </button>
            </div>
            <p v-if="!detail.extra.length" class="hint">还没有填写附加属性。</p>
            <div
                v-for="(row, index) in detail.extra"
                :key="index"
                class="row"
                :class="{ 'row-boost': boostable }"
            >
                <BaseSelect v-model="row.key" :options="statOptions(rule.extra)" label="附加属性" />
                <BaseNumber
                    :model-value="row.value"
                    :min="isGear ? -99999 : 0"
                    placeholder="未记录"
                    @update:model-value="(value) => setValue(row, value)"
                />
                <BaseNumber
                    v-if="boostable"
                    :model-value="row.boost"
                    :min="0"
                    placeholder="强化加成"
                    @update:model-value="(value) => setBoost(row, value)"
                />
                <button
                    class="btn compact danger"
                    type="button"
                    :aria-label="'移除第 ' + (index + 1) + ' 条附加属性'"
                    @click="removeRow('extra', index)"
                >
                    移除
                </button>
            </div>
        </section>

        <section v-if="isGear && bonusMax" class="group">
            <div class="group-head">
                <h4>宝石增加的属性</h4>
                <span class="hint">最多 {{ bonusMax }} 条</span>
                <button
                    v-if="canAdd('bonus')"
                    class="btn compact add"
                    type="button"
                    @click="addRow('bonus')"
                >
                    ＋ 添加
                </button>
            </div>
            <p v-if="!detail.bonus.length" class="hint">镶嵌宝石后才有的额外属性。</p>
            <div v-for="(row, index) in detail.bonus" :key="index" class="row">
                <BaseSelect v-model="row.key" :options="statOptions(rule.bonus)" label="宝石属性" />
                <BaseNumber
                    :model-value="row.value"
                    :min="0"
                    placeholder="未记录"
                    @update:model-value="(value) => setValue(row, value)"
                />
                <button
                    class="btn compact danger"
                    type="button"
                    :aria-label="'移除第 ' + (index + 1) + ' 条宝石属性'"
                    @click="removeRow('bonus', index)"
                >
                    移除
                </button>
            </div>
        </section>

        <section v-if="isGear" class="group">
            <h4>特技与特效</h4>
            <label class="fld">
                特技
                <BaseSelect
                    v-model="detail.technique"
                    :options="plainOptions(rules.equipmentTechniques)"
                    label="特技"
                    searchable
                />
            </label>
            <div class="checks">
                <span class="checks-label">特效（可多选）</span>
                <div class="chips">
                    <label v-for="effect in rule.effects" :key="effect" class="chip">
                        <input
                            type="checkbox"
                            :checked="detail.effects.includes(effect)"
                            @change="toggleEffect(effect)"
                        />
                        <span>{{ effect }}</span>
                    </label>
                </div>
            </div>
        </section>

        <section v-if="isGear || isAccessory" class="group">
            <h4>{{ isAccessory ? '精炼与钟灵石' : '宝石镶嵌' }}</h4>
            <div class="grid">
                <label class="fld">
                    {{ isAccessory ? '精炼等级' : '锻炼等级' }}
                    <BaseNumber
                        :model-value="detail.forge"
                        name="eq-forge"
                        :min="0"
                        :max="30"
                        placeholder="未记录"
                        @update:model-value="(value) => (detail.forge = asNumber(value))"
                    />
                </label>
                <template v-if="isAccessory">
                    <label class="fld">
                        钟灵石效果
                        <BaseSelect
                            v-model="detail.clock.name"
                            :options="plainOptions(rules.equipmentClockEffects)"
                            label="钟灵石效果"
                            searchable
                        />
                    </label>
                    <label class="fld">
                        钟灵石等级
                        <BaseNumber
                            :model-value="detail.clock.level"
                            :min="1"
                            :max="8"
                            placeholder="选效果后填"
                            @update:model-value="(value) => (detail.clock.level = asNumber(value))"
                        />
                    </label>
                </template>
            </div>
            <div v-if="isGear" class="gems">
                <div v-for="type in rule.gems" :key="type" class="gem">
                    <label class="check">
                        <input
                            type="checkbox"
                            :checked="!!gemOf(type)"
                            @change="toggleGem(type, $event)"
                        />
                        {{ type }}
                    </label>
                    <BaseNumber
                        :model-value="gemOf(type) ? gemOf(type)!.level : null"
                        :min="0"
                        :max="30"
                        :disabled="!gemOf(type)"
                        placeholder="已知等级"
                        @update:model-value="(value) => setGemLevel(type, value)"
                    />
                </div>
            </div>
        </section>

        <section v-if="isJade" class="group">
            <h4>灵尘与奇袭</h4>
            <div class="grid">
                <label class="fld">
                    灵尘总等级
                    <BaseNumber
                        :model-value="detail.jade.dust"
                        name="eq-dust"
                        :min="0"
                        :max="17"
                        placeholder="未记录"
                        @update:model-value="(value) => (detail.jade.dust = asNumber(value))"
                    />
                </label>
                <label class="fld">
                    奇袭类型
                    <BaseSelect
                        v-model="detail.jade.assault"
                        :options="plainOptions(['奇袭法术', '奇袭特技', '奇袭道具'])"
                        label="奇袭类型"
                    />
                </label>
                <label class="fld">
                    奇袭概率（%）
                    <BaseNumber
                        :model-value="detail.jade.chance"
                        :min="0"
                        :max="100"
                        :step="0.01"
                        placeholder="可不填"
                        @update:model-value="(value) => (detail.jade.chance = asNumber(value))"
                    />
                </label>
                <label class="fld">
                    已解锁开光孔
                    <BaseSelect v-model="holes" :options="holeOptions" label="已解锁开光孔" />
                </label>
            </div>
            <div v-if="detail.jade.holes" class="grid">
                <label v-for="index in detail.jade.holes" :key="index" class="fld">
                    孔 {{ index }} · {{ holeLabel }}
                    <input
                        v-model="detail.jade.enchantments[index - 1]"
                        type="text"
                        :name="'eq-hole-' + (index - 1)"
                        placeholder="留空表示未强化"
                    />
                </label>
            </div>
        </section>

        <details class="more">
            <summary>其他信息</summary>
            <div class="grid">
                <label v-if="isGear" class="fld">
                    五行
                    <BaseSelect v-model="detail.element" :options="elementOptions" label="五行" />
                </label>
                <label class="fld">
                    耐久
                    <BaseNumber
                        :model-value="detail.durability"
                        name="eq-durability"
                        :min="0"
                        :max="durabilityMax"
                        placeholder="未记录"
                        @update:model-value="(value) => (detail.durability = asNumber(value))"
                    />
                </label>
                <label class="fld">
                    修理失败次数
                    <BaseNumber
                        :model-value="detail.repair"
                        :min="0"
                        :max="3"
                        placeholder="未记录"
                        @update:model-value="(value) => (detail.repair = asNumber(value))"
                    />
                </label>
                <label class="fld full">
                    套装效果
                    <textarea
                        v-model="detail.suit"
                        name="eq-suit"
                        rows="2"
                        placeholder="可不填"
                    ></textarea>
                </label>
                <label class="fld">
                    符石 / 星位
                    <input
                        v-model="detail.runes"
                        type="text"
                        name="eq-runes"
                        placeholder="可不填"
                    />
                </label>
                <label class="fld">
                    制造者
                    <input
                        v-model="detail.maker"
                        type="text"
                        name="eq-maker"
                        placeholder="可不填"
                    />
                </label>
            </div>
            <section v-if="isGear && meltMax" class="group melt">
                <div class="group-head">
                    <h4>熔炼加成</h4>
                    <span class="hint">可为负数</span>
                    <button
                        v-if="canAdd('melt')"
                        class="btn compact add"
                        type="button"
                        @click="addRow('melt')"
                    >
                        ＋ 添加
                    </button>
                </div>
                <p v-if="!detail.melt.length" class="hint">没有熔炼加成。</p>
                <div v-for="(row, index) in detail.melt" :key="index" class="row">
                    <BaseSelect
                        v-model="row.key"
                        :options="statOptions(poolOf('melt'))"
                        label="熔炼属性"
                    />
                    <BaseNumber
                        :model-value="row.value"
                        :min="-99999"
                        placeholder="未记录"
                        @update:model-value="(value) => setValue(row, value)"
                    />
                    <button
                        class="btn compact danger"
                        type="button"
                        :aria-label="'移除第 ' + (index + 1) + ' 条熔炼加成'"
                        @click="removeRow('melt', index)"
                    >
                        移除
                    </button>
                </div>
            </section>
        </details>

        <section v-if="detail.legacy || kind === 'other'" class="group">
            <h4>{{ kind === 'other' ? '其他属性' : '原有属性 · 待核对' }}</h4>
            <p v-if="kind !== 'other'" class="hint">
                无法明确拆分的原文留在这里。核对完记得清空，否则它会一直跟着这件装备。
            </p>
            <textarea
                v-model="detail.legacy"
                name="eq-legacy"
                rows="3"
                placeholder="原始属性文本"
            ></textarea>
        </section>
    </div>
</template>

<style scoped>
.eq-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 6px;
}
.group {
    padding-top: 12px;
    border-top: 1px solid var(--line);
}
.group:first-child {
    padding-top: 0;
    border-top: 0;
}
.group h4 {
    margin: 0 0 8px;
    font-size: 12.5px;
    font-weight: 600;
}
.group-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
}
.group-head h4 {
    margin: 0 0 8px;
}
.group-head .hint {
    margin: 0 auto 8px 0;
}
.group-head .add {
    margin-bottom: 8px;
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px 12px;
}
.grid > .full {
    grid-column: 1 / -1;
}
.fld {
    display: block;
    min-width: 0;
    font-size: 12px;
    color: var(--muted);
}
.fld > input,
.fld > textarea {
    margin-top: 4px;
}
.row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
}
/* 灵饰与玉魄多一栏强化加成；普通装备没有这一栏，留空列会让「移除」被拉得很宽。 */
.row.row-boost {
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) auto;
}
.row > .btn {
    justify-self: end;
}
/*
 * 特效是一排可点的小胶囊，不是一排复选框。
 *
 * 原来是一串原生 checkbox 加文字，两行以上就糊成一片灰方块，也分不清哪个是选中的。
 * 胶囊把「有没有选中」交给底色自己说，选中填金、未选中留纸色。
 */
.checks {
    margin-top: 10px;
}
.checks-label {
    display: block;
    margin-bottom: 6px;
    color: var(--muted);
    font-size: 12px;
}
.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.chip {
    position: relative;
    padding: 3px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    color: var(--muted);
    font-size: 12px;
    line-height: 17px;
    white-space: nowrap;
    cursor: pointer;
    transition:
        border-color 120ms ease,
        background-color 120ms ease,
        color 120ms ease;
}
.chip:hover {
    border-color: var(--line-2);
    color: var(--ink);
}
.chip:has(input:checked) {
    border-color: color-mix(in srgb, var(--gold) 58%, var(--line));
    background: color-mix(in srgb, var(--gold) 14%, var(--paper));
    color: var(--ink);
    font-weight: 600;
}
.chip:has(input:focus-visible) {
    outline: 2px solid color-mix(in srgb, var(--gold) 55%, transparent);
    outline-offset: 1px;
}
/* 复选框只留语义与焦点，视觉上由胶囊本身承担。 */
.chip input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
    pointer-events: none;
}
.check {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
}
.check input {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: var(--gold);
}
.gems {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px 12px;
    margin-top: 10px;
}
.gem {
    display: flex;
    align-items: center;
    gap: 8px;
}
.gem .number-field {
    flex: 1;
    min-width: 0;
}
.more {
    padding-top: 12px;
    border-top: 1px solid var(--line);
}
.more > summary {
    color: var(--muted);
    font-size: 12.5px;
    cursor: pointer;
}
.more[open] > summary {
    margin-bottom: 10px;
}
.melt {
    margin-top: 4px;
}
</style>
