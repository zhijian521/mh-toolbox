<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';
/**
 * 单个勾选项。
 *
 * 原生 checkbox 在各平台长得不一样，加 `accent-color` 也只换得了系统方框里的填充色，
 * 圆角、边框、勾的粗细全跟着操作系统走——同一张表单里它和 BaseNumber / BaseSelect
 * 的米色纸面质感明显不是一套。这里把方框自绘，视觉交给项目令牌。
 *
 * 约定：
 * - 根元素就是 `<label>`，所以 `class="full"` 这类表单网格类照样能直接写在组件上。
 * - 整行（文字也算）都可点，符合勾选项的直觉；原生 input 只保留语义与焦点。
 * - 只做「一个勾 + 一段说明」。多选项请用胶囊（`EquipmentFields` 的特效那样），
 *   互斥请用 `BaseSelect`——把多选塞进这里会变成一列排开的原生复选框墙。
 */
const props = withDefaults(
    defineProps<{
        modelValue?: boolean;
        /** 文字走 prop 或默认插槽都行；太长会自动折行，方框停在首行。 */
        label?: string;
        /** 透传给原生 input，纯表单语义用。 */
        name?: string;
        disabled?: boolean;
        /** 方框边长。默认 18：配 12.5～13px 的表单文字不头重脚轻。 */
        size?: number;
    }>(),
    { modelValue: false, label: '', name: '', disabled: false, size: 18 },
);
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; change: [value: boolean] }>();
/** 勾按方框的 0.68 缩放，18px 里放 12px 的勾——留白够，勾也不至于缩成一粒。 */
const glyph = computed(() => Math.max(10, Math.round(props.size * 0.68)));
function onChange(event: Event) {
    const value = (event.target as HTMLInputElement).checked;
    emit('update:modelValue', value);
    emit('change', value);
}
</script>

<template>
    <label class="check" :class="{ on: modelValue, off: disabled }">
        <input
            class="native"
            type="checkbox"
            :name="name"
            :checked="modelValue"
            :disabled="disabled"
            @change="onChange"
        />
        <span class="box" :style="{ width: size + 'px', height: size + 'px' }" aria-hidden="true">
            <AppIcon v-if="modelValue" name="check" :size="glyph" :stroke="3" />
        </span>
        <span class="text">
            <slot>{{ label }}</slot>
        </span>
    </label>
</template>

<style scoped>
/*
 * 全局 `label` 是「标题在上、控件在下」的竖排（display:flex; flex-direction:column），
 * 这条规则会连根接管组件里的 `<label>`，所以行内方向与色值都必须显式写回来。
 * 文字颜色跟全局 label 一样是 --muted，勾上之后转正色——不需要再加粗，
 * 一加粗整行宽度就跳，勾选时眼睛会跟着抖一下。
 */
.check {
    position: relative;
    display: inline-flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 8px;
    color: var(--muted);
    cursor: pointer;
    user-select: none;
}
/*
 * 未选中是纸面上按出来的一格：凹面底 + 上沿内阴影，和「记给谁」的槽同源——
 * 两处都用 --well / --bevel-*，换主题时明暗关系不会翻面。
 *
 * 但边框不能用 --bevel-lo：它在暗色下是纯黑，压在 #201d16 的弹窗上等于没有边，
 * 只剩那个比弹窗深半档的凹面——一整排空框看着像五个洞。改用 --line-2，
 * 两套主题下都比底纸明显、又比正文浅。
 */
.box {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    /* 文字首行 19px、方框 18px，抬 1px 才和首行的光学中线对上。 */
    margin-top: 1px;
    border: 1px solid var(--line-2);
    border-radius: 5px;
    background-color: var(--well);
    box-shadow: inset 0 1px 2px var(--bevel-lo);
    color: var(--on-accent);
    transition:
        background-color 120ms ease,
        border-color 120ms ease,
        box-shadow 120ms ease;
}
.check:hover .box {
    border-color: color-mix(in srgb, var(--gold) 62%, var(--line-2));
}
/*
 * 选中：灌金、白勾，跟主按钮和「记给谁」的选中态同一配方。
 * 纯 --gold 配 --on-accent 在亮色下只有 3.58:1，混 26% 墨色到 4.95:1（见 docs/THEME.md 第 6 节）。
 */
.check.on .box {
    border-color: color-mix(in srgb, var(--gold) 78%, var(--ink));
    background-color: color-mix(in srgb, var(--gold) 74%, var(--ink));
    background-image: linear-gradient(180deg, var(--bevel-hi), transparent 55%);
    box-shadow: 0 1px 2px color-mix(in srgb, var(--gold) 34%, transparent);
}
.check.on {
    color: var(--ink);
}
.check:has(.native:focus-visible) .box {
    outline: 2px solid color-mix(in srgb, var(--gold) 55%, transparent);
    outline-offset: 1px;
}
.check.off {
    opacity: 0.5;
    cursor: not-allowed;
}
.text {
    min-width: 0;
    overflow-wrap: anywhere;
}
/* 原生控件只留语义与焦点，视觉全部由 .box 承担。 */
.native {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
    pointer-events: none;
}
</style>
