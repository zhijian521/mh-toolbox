<script setup lang="ts">
import { ref } from 'vue';
import type { QuickCatalogItem, QuickTargetOption } from '../../app/types';
import { useApplication } from '../../stores/application';
import { desktop } from '../../services/desktop';
import { U } from '../../domain/util.js';
import { quickItems, quickVariable } from '../../game-data/quick-items.js';
import AppIcon from '../../components/AppIcon.vue';

/**
 * 物品速记卡：点图标记一条，「记给谁」是一排常驻按钮，单价表的 CSV 在卡脚。
 *
 * 归属规则与记录写入都在页面（它才知道角色清单与同步口径），这里只负责把点击
 * 翻译成事件；键盘左右换格与单价文案留在自己这层，因为它们只依赖本卡的 DOM。
 */
defineProps<{ target: string; options: QuickTargetOption[] }>();
const emit = defineEmits<{
    'update:target': [value: string];
    fixed: [item: QuickCatalogItem];
    variable: [item: QuickCatalogItem];
    price: [item: QuickCatalogItem];
}>();

const app = useApplication();
const rules = app.rules();
const targetRow = ref<HTMLElement>();
/** 单价表 CSV 正在读写：两颗图标同时置灰，避免边导边存。 */
const csvBusy = ref(false);

function pick(value: string) {
    emit('update:target', value);
}
/** 单选的按钮组：左右方向键换一格并立刻选中，和原生单选一致。 */
function onTargetKeys(event: KeyboardEvent) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const pills = [...(targetRow.value?.querySelectorAll<HTMLElement>('.target-pill') || [])];
    if (!pills.length) return;
    event.preventDefault();
    const index = pills.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const next = pills[(index + step + pills.length) % pills.length];
    next.focus();
    const value = next.dataset.target;
    if (value) pick(value);
}
function priceText(id: number) {
    const price = rules.itemPrice(id);
    return price ? U.fmtMoney(price / 10000) : '未设价';
}

/**
 * 单价表的两条 CSV 通道：导出改、导入写回。
 *
 * 固定价那一组有四十个物品，逐个右键改价太费事，所以留一条表格通道。以前它包在
 * 一个弹窗里，但那弹窗里除了这两个按钮就是规则说明——规则在设置页的使用帮助里已经
 * 写过一遍，弹窗成了纯中介。两颗图标挂在卡脚，点完直接看提示。
 *
 * 导入的规则由领域解释（留空不改、填 0 清除、单位是万），页面只负责把结果说清楚：
 * 一条提示里既报「更新了几个」，也报「有几行没导进去」，不分成两条（提示会互相盖掉）。
 */
async function exportCsv() {
    if (csvBusy.value || app.busy) return;
    csvBusy.value = true;
    try {
        const saved = await desktop().saveTextFile(rules.itemPriceCsv(), {
            title: '导出单价表',
            defaultName: '物品单价-' + U.today() + '.csv',
            filterName: 'CSV 表格',
            ext: 'csv',
        });
        if (saved.canceled) return;
        app.notify(
            saved.ok ? '单价表已导出，用表格软件打开就能批量改' : saved.error || '导出失败',
            !saved.ok,
        );
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    } finally {
        csvBusy.value = false;
    }
}
async function importCsv() {
    if (csvBusy.value || app.busy) return;
    csvBusy.value = true;
    try {
        const picked = await desktop().openTextFile({
            title: '导入单价表',
            filterName: 'CSV 表格',
            ext: 'csv',
        });
        if (picked.canceled) return;
        if (!picked.ok) {
            app.notify(picked.error || '读取失败', true);
            return;
        }
        const outcome = await app.execute((domain) =>
            domain.importItemPriceCsv(String(picked.text || '')),
        );
        const parts: string[] = [];
        if (outcome.updated) parts.push('更新 ' + outcome.updated + ' 个');
        if (outcome.cleared) parts.push('清除 ' + outcome.cleared + ' 个');
        if (outcome.skipped) parts.push('跳过 ' + outcome.skipped + ' 行');
        if (outcome.problems.length)
            parts.push(outcome.problems.length + ' 行未导入（' + outcome.problems[0] + '）');
        if (!parts.length) {
            app.notify('单价表没有可更新的行', true);
            return;
        }
        app.notify('单价表：' + parts.join(' · '), !!outcome.problems.length);
    } catch (failure) {
        app.notify(failure instanceof Error ? failure.message : String(failure), true);
    } finally {
        csvBusy.value = false;
    }
}
</script>

<template>
    <section class="card">
        <header class="card-title">
            <span class="card-title-text">物品速记</span>
            <div
                ref="targetRow"
                class="target-row"
                role="radiogroup"
                aria-label="这笔记给谁"
                @keydown="onTargetKeys"
            >
                <span class="target-label">记给</span>
                <button
                    v-for="option in options"
                    :key="option.value"
                    type="button"
                    class="bevel-pill target-pill"
                    :class="{ on: target === option.value, sep: option.sep }"
                    role="radio"
                    :aria-checked="target === option.value"
                    :data-target="option.value"
                    :title="option.title"
                    @click="pick(option.value)"
                >
                    <span v-if="option.live" class="target-dot"></span>
                    {{ option.label }}
                </button>
            </div>
        </header>
        <p class="section-label">固定价格 · 点一下记一条，右键改价</p>
        <div class="item-grid">
            <button
                v-for="item in quickItems"
                :key="item.id"
                type="button"
                class="item-card"
                :data-item="item.id"
                :disabled="app.busy"
                :title="item.name + ' · ' + priceText(item.id)"
                @click="emit('fixed', item)"
                @contextmenu.prevent="emit('price', item)"
            >
                <img :src="item.icon" :alt="item.name" loading="lazy" />
                <span class="item-name">{{ item.name }}</span>
                <span class="item-price" :class="{ none: !rules.itemPrice(item.id) }">
                    {{ priceText(item.id) }}
                </span>
            </button>
        </div>
        <p class="section-label">不固定价格</p>
        <div class="item-grid">
            <button
                v-for="item in quickVariable"
                :key="item.id"
                type="button"
                class="item-card"
                :data-item="item.id"
                :disabled="app.busy"
                :title="item.name + ' · 每次填单价'"
                @click="emit('variable', item)"
            >
                <img :src="item.icon" :alt="item.name" loading="lazy" />
                <span class="item-name">{{ item.name }}</span>
            </button>
        </div>
        <footer class="card-foot">
            <span class="card-foot-label">单价表</span>
            <button
                class="icon-btn"
                type="button"
                :disabled="app.busy || csvBusy"
                title="导出单价表：存成 CSV，用表格软件批量改"
                aria-label="导出单价表"
                @click="exportCsv"
            >
                <AppIcon name="download" :size="16" />
            </button>
            <button
                class="icon-btn"
                type="button"
                :disabled="app.busy || csvBusy"
                title="导入单价表：留空不改，填 0 清除，单位是万"
                aria-label="导入单价表"
                @click="importCsv"
            >
                <AppIcon name="upload" :size="16" />
            </button>
        </footer>
    </section>
</template>

<style scoped>
.card {
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--paper);
}
/*
 * 标题行：标题靠左，「记给谁」那排按钮靠右，两者共用一行，省下一整行的垂直空间。
 * 允许换行——角色多的时候按钮排整体掉到下一行，`margin-left: auto` 让它在自己那行
 * 依然贴着右边，不会飘到中间或左边。
 */
.card-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    font-size: 15px;
    font-weight: 600;
}
.card-title-text {
    flex: none;
}
/*
 * 「记给谁」是这张卡最容易出错的一处——以前是一行静止的小字，看得见却改不了，
 * 归到谁头上完全由代码里的隐式规则决定。
 *
 * 现在是一排常驻按钮：点一下换一个目标，不用先展开任何东西再用眼睛找一遍。
 * 前两颗是归属规则（跟计时 / 全部），后面是逐个角色；两者之间空一格分开。
 * 挂在标题行右端，行内放不下时自己内部折行，每行都靠右。
 */
.target-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-left: auto;
    min-width: 0;
}
/* 标题行位置低了一档，按钮排跟着抬高：`line-height` 撑出的空白由这里补回来。 */
.target-label {
    margin-right: 3px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.5px;
}
/* 规则与角色之间留一格空档，不画分隔线——一排按钮里多一根竖线反而更碎。 */
.target-pill.sep {
    margin-left: 7px;
}
/* 正在计时的号：名字前一颗绿点，比在 title 里写「计时中」看得见。 */
.target-dot {
    width: 5px;
    height: 5px;
    flex: none;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--green) 20%, transparent);
}
/* 金底上绿点会糊成一片，换成反差色——位置不变，仍然表示「这个号在计时」。 */
.target-pill.on .target-dot {
    background: var(--on-accent);
    box-shadow: 0 0 0 2.5px color-mix(in srgb, var(--on-accent) 24%, transparent);
}
.section-label {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 14px 0 8px;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.4px;
}
/*
 * 单价表的导入导出：低频操作，压到卡片右下角。
 *
 * 原先挂在「固定价格」那行右端，和右上角的角色排挤在同一竖线上——两处都是右对齐，
 * 眼睛容易把「换记给谁」和「导入 CSV」看成一组。挪到底部后与主操作彻底分开，
 * 顺带把分组标题还给物品格子。
 */
.card-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 14px;
}
.card-foot-label {
    margin-right: 1px;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.4px;
}
/*
 * 两颗图标：常驻浅底与细边框，和物品卡片同一档（`--paper-2` + `--line`），
 * 一眼能认出「这是能点的」；hover 换成金色边框，与筛选栏那颗 chip 同一套反馈。
 * 图标 16px——纸加箭头在 13px 下线条会糊成一块。
 */
.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    padding: 0;
    /*
     * 边框用 --line-2 而不是 --line：暗色下 --line 与卡片底几乎同色，16px 的箭头会
     * 看起来像两个裸箭头浮在卡面上；物品卡能靠图片自己成形，这两颗只有线条。
     */
    border: 1px solid var(--line-2);
    border-radius: 5px;
    background: var(--paper-2);
    color: var(--muted);
    cursor: pointer;
    transition:
        color 120ms ease,
        border-color 120ms ease,
        background-color 120ms ease;
}
.icon-btn:hover:not(:disabled) {
    border-color: var(--gold);
    background: var(--paper);
    color: var(--ink);
}
.icon-btn:focus-visible {
    border-color: var(--gold);
    color: var(--ink);
}
.icon-btn:disabled {
    opacity: 0.45;
    cursor: default;
}
.item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
    gap: 8px;
}
.item-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 3px 5px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--paper-2);
    color: var(--ink);
    font-family: inherit;
    cursor: pointer;
    transition:
        border-color 110ms ease,
        background 110ms ease;
}
.item-card:hover:not(:disabled) {
    border-color: var(--gold);
    background: color-mix(in srgb, var(--gold) 14%, var(--paper));
}
.item-card:disabled {
    opacity: 0.6;
    cursor: default;
}
.item-card img {
    width: 40px;
    height: 40px;
    object-fit: contain;
    image-rendering: pixelated;
}
.item-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    line-height: 1.2;
}
.item-price {
    color: var(--gold);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
}
.item-price.none {
    color: var(--muted);
}
@media (max-width: 750px) {
    .item-grid {
        grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    }
}
</style>
