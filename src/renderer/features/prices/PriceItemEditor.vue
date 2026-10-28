<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { PriceItem } from '../../app/types';
import { priceUnits } from '../../game-data/price-catalog.js';
import { U } from '../../domain/util.js';
import { plain } from '../../services/desktop';
import { useApplication } from '../../stores/application';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import NumberStepper from '../../components/NumberStepper.vue';

/**
 * 新建 / 编辑物价卡片。
 *
 * 弹窗只维护「物品是什么」：名称、分类、单位、备注。价格走 `PriceLogEditor`（记价），
 * 这样一张卡的价格只有一条写入路径，不会出现「编辑弹窗改价」与「记一条价」两套口径。
 * 新建时顺手记一条初始价，省掉建完再点一次「记价」。
 */
const props = defineProps<{
    /** 传入表示编辑，不传表示新建。 */
    item?: PriceItem;
    /** 名称建议，来自页面（常见物品目录），不在这里 import 游戏资料。 */
    suggestions: string[];
}>();
const emit = defineEmits<{ close: []; saved: [id: string] }>();
const app = useApplication();
const rules = app.rules();
const todayText = U.today();

const draft = reactive({
    name: props.item?.name ?? '',
    // 默认留空：不替用户猜分类，保存时领域会兜底成「其他」。
    category: props.item?.category ?? '',
    unit: props.item?.unit ?? '个',
    note: props.item?.note ?? '',
    price: '' as number | string,
    date: todayText,
});
const initial = JSON.stringify(draft);
const dirty = computed(() => JSON.stringify(draft) !== initial);
const error = ref('');
const editing = computed(() => !!props.item);
/** 分类与单位都允许手填：列表只做建议，用户填过的自定义值也要留在选项里。 */
const categoryList = computed(() => [
    ...new Set([...rules.priceCategories, draft.category].filter(Boolean)),
]);

async function save() {
    if (app.busy) return;
    error.value = '';
    const priceWan = draft.price === '' ? null : Number(draft.price);
    if (priceWan !== null && (!Number.isFinite(priceWan) || priceWan < 0)) {
        error.value = '初始价必须是不小于 0 的数字';
        return;
    }
    try {
        const input = {
            ...plain(draft),
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
                            list="price-name-options"
                            maxlength="40"
                            autocomplete="off"
                            placeholder="例如：高级兽决"
                            autofocus
                        />
                        <datalist id="price-name-options">
                            <option v-for="name in suggestions" :key="name" :value="name" />
                        </datalist>
                    </label>
                    <div class="form-grid">
                        <label>
                            分类
                            <input
                                v-model="draft.category"
                                name="category"
                                list="price-category-options"
                                maxlength="20"
                                autocomplete="off"
                                placeholder="选一个或自己填"
                            />
                            <datalist id="price-category-options">
                                <option v-for="name in categoryList" :key="name" :value="name" />
                            </datalist>
                        </label>
                        <label>
                            计价单位
                            <input
                                v-model="draft.unit"
                                name="unit"
                                list="price-unit-options"
                                maxlength="10"
                                autocomplete="off"
                                placeholder="个"
                            />
                            <datalist id="price-unit-options">
                                <option v-for="name in priceUnits" :key="name" :value="name" />
                            </datalist>
                        </label>
                    </div>
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
                        <p class="hint">
                            价格按「万」填写，例如 12.5 万填 12.5；留空则先建卡片，之后再记价。
                        </p>
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
