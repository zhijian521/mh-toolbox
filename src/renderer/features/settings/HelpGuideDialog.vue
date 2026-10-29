<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import BaseModal from '../../components/BaseModal.vue';
import { manualSections } from './help-manual';
const emit = defineEmits<{ close: [] }>();
const body = ref<HTMLElement>();
const active = ref(0);
/** 章节锚点：滚动定位与「当前读到哪」都靠它，不用 `getElementById` 反复查文档。 */
const anchors = new Map<string, HTMLElement>();

function keep(id: string, el: unknown) {
    if (el instanceof HTMLElement) anchors.set(id, el);
}
/**
 * 目录高亮跟着滚动走，不是点谁亮谁——用户多半是用滚轮读下去的，
 * 一滚动目录还停在开场那一节，左侧就成了假的导航。
 */
function syncActive() {
    const root = body.value;
    if (!root) return;
    /*
     * 滚到底时直接点亮最后一节：最后一节的顶部到不了标记线（下面没有内容可撑），
     * 否则读到末尾目录会一直停在倒数第二节。
     */
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
        active.value = manualSections.length - 1;
        return;
    }
    const marker = root.scrollTop + 24;
    let index = 0;
    manualSections.forEach((section, order) => {
        const el = anchors.get(section.id);
        if (el && el.offsetTop <= marker) index = order;
    });
    active.value = index;
}
function jump(index: number) {
    const root = body.value;
    const el = anchors.get(manualSections[index].id);
    if (!root || !el) return;
    root.scrollTo({ top: Math.max(0, el.offsetTop - 10), behavior: 'smooth' });
    active.value = index;
}
onMounted(() => body.value?.addEventListener('scroll', syncActive, { passive: true }));
onBeforeUnmount(() => body.value?.removeEventListener('scroll', syncActive));
</script>

<template>
    <BaseModal title="使用教程" wide @close="emit('close')">
        <div class="guide">
            <nav class="guide-nav" aria-label="教程章节">
                <button
                    v-for="(section, index) in manualSections"
                    :key="section.id"
                    type="button"
                    class="guide-tab"
                    :class="{ on: index === active }"
                    :aria-current="index === active ? 'true' : undefined"
                    @click="jump(index)"
                >
                    {{ section.title }}
                </button>
            </nav>
            <div ref="body" class="guide-body" tabindex="0" aria-label="教程正文">
                <section
                    v-for="section in manualSections"
                    :key="section.id"
                    :ref="(el) => keep(section.id, el)"
                    class="guide-section"
                >
                    <h3>{{ section.title }}</h3>
                    <template v-for="(block, index) in section.blocks" :key="index">
                        <ol v-if="block.kind === 'steps'" class="guide-steps">
                            <li v-for="step in block.items" :key="step">{{ step }}</li>
                        </ol>
                        <p v-else :class="{ 'guide-note': block.kind === 'note' }">
                            {{ block.text }}
                        </p>
                    </template>
                </section>
            </div>
        </div>
        <template #footer="{ close }">
            <button class="btn" type="button" @click="close">知道了</button>
        </template>
    </BaseModal>
</template>

<style scoped>
/*
 * 左目录 + 右正文，两栏各自滚动。
 *
 * 高度用 `clamp` 而不是撑满：正文再长也不该把弹窗顶到屏幕边缘，
 * 高度固定之后左侧目录不动、右侧自己滚，读到哪一节始终看得见。
 */
.guide {
    display: grid;
    grid-template-columns: 156px minmax(0, 1fr);
    gap: 16px;
    height: clamp(320px, 58vh, 540px);
}
.guide-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: auto;
    padding-right: 8px;
    border-right: 1px solid var(--line);
}
.guide-tab {
    padding: 6px 9px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    font-family: inherit;
    font-size: 12.5px;
    line-height: 1.5;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    transition:
        background-color 120ms ease,
        color 120ms ease;
}
.guide-tab:hover {
    color: var(--ink);
}
.guide-tab.on {
    background: color-mix(in srgb, var(--gold) 14%, var(--paper));
    color: var(--ink);
    font-weight: 600;
}
.guide-tab:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--gold) 55%, transparent);
    outline-offset: 1px;
}
.guide-body {
    /* 章节的 offsetTop 以它为参照，滚动定位才对得上。 */
    position: relative;
    overflow: auto;
    /* 末节最后一行别贴着容器下沿，滚到底时那半行字看起来像被切了。 */
    padding: 0 8px 12px 0;
}
.guide-body:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--gold) 55%, transparent);
    outline-offset: 2px;
}
.guide-section + .guide-section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
}
.guide-section h3 {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--ink);
}
/* 段落、列表、提示之间的间距统一一档，别让每种块自己各写一个 margin。 */
.guide-section > * + * {
    margin-top: 8px;
}
.guide-section p {
    font-size: 12.5px;
    line-height: 1.75;
    color: var(--ink-2);
}
.guide-steps {
    margin: 0;
    padding-left: 1.4em;
    font-size: 12.5px;
    line-height: 1.75;
    color: var(--ink-2);
}
.guide-steps li + li {
    margin-top: 5px;
}
.guide-steps li::marker {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
/*
 * 口径说明单独一档：带一道金色左边线和极淡底色，和操作步骤分开——
 * 归属、分摊、点卡开关这些规则混在步骤里最容易被漏读，漏了就是一条错账。
 */
.guide-section .guide-note {
    padding: 8px 11px;
    border-left: 2px solid color-mix(in srgb, var(--gold) 55%, transparent);
    border-radius: 0 4px 4px 0;
    background: color-mix(in srgb, var(--gold) 7%, var(--paper));
    font-size: 12px;
    line-height: 1.7;
    color: var(--ink-2);
}
/* 窄到放不下两栏时目录改成横向一条，正文占满。 */
@media (max-width: 720px) {
    .guide {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
    }
    .guide-nav {
        flex-direction: row;
        gap: 4px;
        overflow: auto hidden;
        padding: 0 0 8px;
        border-right: 0;
        border-bottom: 1px solid var(--line);
    }
}
</style>
