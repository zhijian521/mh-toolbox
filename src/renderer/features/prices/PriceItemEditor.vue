<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import type { PriceItem } from '../../app/types';
import { U } from '../../domain/util.js';
import { plain } from '../../services/desktop';
import { useApplication } from '../../stores/application';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import NumberStepper from '../../components/NumberStepper.vue';

/**
 * 新建 / 编辑物价卡片。
 *
 * 弹窗只维护「物品是什么」：名称、分类、备注。价格走 `PriceLogEditor`（记价），
 * 这样一张卡的价格只有一条写入路径，不会出现「编辑弹窗改价」与「记一条价」两套口径。
 * 新建时顺手记一条初始价，省掉建完再点一次「记价」。
 *
 * 分类用项目的 `BaseSelect`（和角色页、目标页同一个下拉），它只能选不能填，
 * 所以最后一项「新建类型」切出一个输入框——既保持样式统一，也不堵住自定义分类。
 */
const props = defineProps<{
    /** 传入表示编辑，不传表示新建。 */
    item?: PriceItem;
}>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const app = useApplication();
const rules = app.rules();
const CUSTOM = '__custom__';

const draft = reactive({
    name: props.item?.name ?? '',
    // 默认留空：不替用户猜分类，保存时领域会兜底成「其他」。
    category: props.item?.category ?? '',
    note: props.item?.note ?? '',
    price: '' as number | string,
    date: U.today(),
});
const custom = ref(false);
const customName = ref('');
const customInput = ref<HTMLInputElement>();
const error = ref('');
const editing = computed(() => !!props.item);
const categoryOptions = computed(() =>
    [...new Set([...rules.priceCategories, draft.category].filter(Boolean))]
        .map((name) => ({ value: name, label: name }))
        .concat([{ value: CUSTOM, label: '＋ 新建类型' }]),
);
const categoryPick = computed({
    get: () => (custom.value ? CUSTOM : draft.category),
    set: (value: string) => {
        if (value === CUSTOM) {
            custom.value = true;
            void nextTick(() => customInput.value?.focus());
            return;
        }
        custom.value = false;
        customName.value = '';
        draft.category = value;
    },
});

const snapshot = () =>
    JSON.stringify([
        draft.name,
        draft.category,
        draft.note,
        draft.price,
        draft.date,
        custom.value,
        customName.value,
    ]);
const initial = snapshot();
const dirty = computed(() => snapshot() !== initial);

async function save() {
    if (app.busy) return;
    error.value = '';
    const category = custom.value ? customName.value.trim() : draft.category.trim();
    if (custom.value && !category) {
        error.value = '请填写新类型的名称';
        customInput.value?.focus();
        return;
    }
    const priceWan = draft.price === '' ? null : Number(draft.price);
    if (priceWan !== null && (!Number.isFinite(priceWan) || priceWan < 0)) {
        error.value = '初始价必须是不小于 0 的数字';
        return;
    }
    try {
        const input = {
            ...plain(draft),
            category,
            price: priceWan === null ? null : Math.round(priceWan * 10000),
        };
        const saved = await app.execute((domain) => domain.savePriceItem(input, props.item?.id));
        emit('saved', saved.id);
    } catch (failure) {
        // 保存失败会整份回滚，草稿必须留着让用户重试。
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal
        :title="editing ? '编辑物品' : '新建物价卡片'"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <form id="price-item-form" @submit.prevent="save">
            <fieldset :disabled="app.busy">
                <div class="form-grid stack">
                    <label>
                        物品名称
                        <input
                            v-model="draft.name"
                            name="name"
                            maxlength="40"
                            autocomplete="off"
                            placeholder="例如：高级兽决"
                            autofocus
                        />
                    </label>
                    <label>
                        分类
                        <BaseSelect
                            v-model="categoryPick"
                            label="物品分类"
                            placeholder="选择分类"
                            :options="categoryOptions"
                        />
                    </label>
                    <label v-if="custom">
                        新类型名称
                        <input
                            ref="customInput"
                            v-model="customName"
                            name="customCategory"
                            maxlength="12"
                            autocomplete="off"
                            placeholder="例如：灵饰"
                        />
                    </label>
                    <template v-if="!editing">
                        <div class="initial-price">
                            <span class="field-text">当前价</span>
                            <NumberStepper
                                v-model="draft.price"
                                name="price"
                                unit="万"
                                placeholder="可不填"
                                decimal
                            />
                        </div>
                        <div class="initial-date">
                            <span class="field-text">记录日期</span>
                            <BaseDate v-model="draft.date" label="价格记录日期" />
                        </div>
                    </template>
                    <p v-else class="hint">改价请回卡片点「记价」，每次改价都会留下一条历史。</p>
                    <label>
                        备注
                        <textarea
                            v-model="draft.note"
                            name="note"
                            rows="2"
                            maxlength="120"
                            placeholder="区服、成色、来历，例如「紫禁城 · 满品」"
                        />
                    </label>
                </div>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="price-item-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : editing ? '保存修改' : '建立卡片' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
fieldset {
    border: 0;
    padding: 0;
    margin: 0;
}
.initial-price,
.initial-date {
    display: flex;
    flex-direction: column;
    gap: 7px;
}
/*
 * NumberStepper 默认居中（它多用在「一次只调一个数」的弹窗里）。
 * 这里是普通表单的一行，与上面的分类、下面的日期一样左对齐才不乱，
 * 所以只在这一处把内部 grid 的排布推到左边。
 */
.initial-price :deep(.stepper) {
    justify-content: start;
    margin: 0;
}
/* 日期输入框不必铺满整行，留白比拉长的空框好看。 */
.initial-date {
    max-width: 190px;
}
.field-text {
    color: var(--muted);
    font-size: 13px;
}
.form-error {
    margin-top: 12px;
    font-size: 13px;
}
</style>
