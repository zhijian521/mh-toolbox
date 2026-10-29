<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
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
 * 弹窗只维护「物品是什么」：名称、类型、子类、备注。价格走 `PriceLogEditor`（记价），
 * 这样一张卡的价格只有一条写入路径，不会出现「编辑弹窗改价」与「记一条价」两套口径。
 * 新建时顺手记一条初始价，省掉建完再点一次「记价」。
 *
 * 分类是两级：一级从固定目录里选（`rules().priceGroups`），二级在该组的子类里选，
 * 也可以「＋ 新建子类」自己写——新玩法产出的东西不该等改版才能记。一级不给自由填：
 * 同一个概念被写成「材料 / 打造材料 / 材料类」三种，左侧筛选就散了。
 * 二级留空是合法的：只记得大类、还没细分的卡片可以只选一级。
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
    // 默认留空：不替用户猜类型，保存时领域会兜底成「其他」。
    category: props.item?.category ?? '',
    sub: props.item?.sub ?? '',
    note: props.item?.note ?? '',
    price: '' as number | string,
    date: U.today(),
});
const custom = ref(false);
const customName = ref('');
const customInput = ref<HTMLInputElement>();
const error = ref('');
const editing = computed(() => !!props.item);
const categoryOptions = rules.priceGroups.map((group) => ({
    value: group.name,
    label: group.name,
}));
const groupSubs = computed(
    () => rules.priceGroups.find((group) => group.name === draft.category)?.subs ?? [],
);
/**
 * 子类下拉：目录里现成的 + 这张卡已有的（可能是自己写的），末尾一项切出输入框。
 * 只选了「其他」这类没有子类的分组时，整行隐藏——没有名单可选，写一个就行。
 */
const subOptions = computed(() => {
    const list = [...groupSubs.value];
    if (draft.sub && !list.includes(draft.sub)) list.unshift(draft.sub);
    return [{ value: '', label: '不填' }]
        .concat(list.map((name) => ({ value: name, label: name })))
        .concat([{ value: CUSTOM, label: '＋ 新建子类' }]);
});
const subPick = computed({
    get: () => (custom.value ? CUSTOM : draft.sub),
    set: (value: string) => {
        if (value === CUSTOM) {
            custom.value = true;
            void nextTick(() => customInput.value?.focus());
            return;
        }
        custom.value = false;
        customName.value = '';
        draft.sub = value;
    },
});
/**
 * 换了类型，原来那个子类就不属于新分组了——留着会变成「任务产出 / 珍珠」这种错配，
 * 而且左侧按一级筛、右侧按二级筛时它会彻底消失。清掉让用户重选。
 */
watch(
    () => draft.category,
    () => {
        if (custom.value) return;
        if (draft.sub && !groupSubs.value.includes(draft.sub)) draft.sub = '';
    },
);

const snapshot = () =>
    JSON.stringify([
        draft.name,
        draft.category,
        draft.sub,
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
    const sub = custom.value ? customName.value.trim() : draft.sub.trim();
    if (custom.value && !sub) {
        error.value = '请填写新子类的名称';
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
            sub,
            price: priceWan === null ? null : U.wanToCash(priceWan),
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
                    <!--
                        名称独占一行：两级分类是同一件事的两层，并排放在下面一行才读得懂
                        「一级管分区、二级管品类」；三个框挤一行反而让名字被压窄。
                    -->
                    <div class="form-grid type-row">
                        <label>
                            类型
                            <BaseSelect
                                v-model="draft.category"
                                label="物品类型"
                                placeholder="选择类型"
                                :options="categoryOptions"
                            />
                        </label>
                        <label v-if="groupSubs.length || draft.sub">
                            子类
                            <BaseSelect
                                v-model="subPick"
                                label="物品子类"
                                placeholder="选择子类"
                                :options="subOptions"
                            />
                        </label>
                    </div>
                    <label v-if="custom">
                        新子类名称
                        <input
                            ref="customInput"
                            v-model="customName"
                            name="customSub"
                            maxlength="12"
                            autocomplete="off"
                            placeholder="例如：九黎城副本"
                        />
                    </label>
                    <div v-if="!editing" class="price-block">
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
                    </div>
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
/* 类型与子类同一行：等分即可，两者都是短词。 */
.type-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
/* 数值块居中：上面是「物品是什么」，这里是「多少钱」，两者用对齐方式分开。 */
.price-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 2px 0 4px;
}
.initial-price,
.initial-date {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
}
/* 步进器自带 8px 上下外边距，在居中块里会跟 gap 叠成一大截空白。 */
.initial-price :deep(.stepper) {
    margin: 0;
}
.initial-date {
    width: 190px;
}
.field-text {
    color: var(--muted);
    font-size: 12px;
    letter-spacing: 0.5px;
}
</style>
