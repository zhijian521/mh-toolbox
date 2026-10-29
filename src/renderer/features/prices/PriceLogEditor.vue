<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import type { PriceItem, PriceLog } from '../../app/types';
import { U } from '../../domain/util.js';
import { plain } from '../../services/desktop';
import { useApplication } from '../../stores/application';
import BaseDate from '../../components/BaseDate.vue';
import BaseModal from '../../components/BaseModal.vue';
import NumberStepper from '../../components/NumberStepper.vue';

/**
 * 记一条价（或改已有的一条）。
 *
 * 预填当前价是为了「今天比昨天涨了两千」这类微调：改一位数字比重新输一遍快得多。
 * 价格按「万」输入，领域里存原始游戏币（12.5 万存 125000），与速记单价的口径一致。
 */
const props = defineProps<{ item: PriceItem; log?: PriceLog }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const app = useApplication();
const rules = app.rules();
const current = props.log ? props.log.price : (rules.priceCurrent(props.item)?.price ?? 0);

const draft = reactive({
    price: (current ? current / 10000 : '') as number | string,
    date: props.log?.date ?? U.today(),
    note: props.log?.note ?? '',
});
const initial = JSON.stringify(draft);
const dirty = computed(() => JSON.stringify(draft) !== initial);
const error = ref('');
const parsed = computed(() => {
    if (draft.price === '') return null;
    const value = Number(draft.price);
    return Number.isFinite(value) && value > 0 ? value : null;
});

async function save() {
    if (app.busy) return;
    error.value = '';
    if (parsed.value === null) {
        error.value = '请填写大于 0 的价格';
        return;
    }
    try {
        await app.execute((domain) =>
            domain.savePriceLog(
                props.item.id,
                { ...plain(draft), price: U.wanToCash(parsed.value) },
                props.log?.id,
            ),
        );
        emit('saved');
    } catch (failure) {
        error.value = failure instanceof Error ? failure.message : String(failure);
    }
}
</script>

<template>
    <BaseModal
        :title="log ? '修改价格记录' : '记一条价'"
        :busy="app.busy"
        :dirty="dirty"
        @close="emit('close')"
    >
        <form id="price-log-form" @submit.prevent="save">
            <fieldset :disabled="app.busy">
                <p class="log-subject">
                    {{ item.name }}
                    <span class="log-unit">每{{ item.unit || '个' }}</span>
                </p>
                <NumberStepper
                    v-model="draft.price"
                    name="price"
                    unit="万"
                    placeholder="填单价"
                    decimal
                    autofocus
                />
                <div class="log-fields">
                    <label>
                        记录日期
                        <BaseDate v-model="draft.date" label="这条价格对应的日期" />
                    </label>
                    <label>
                        备注
                        <input
                            v-model="draft.note"
                            name="note"
                            maxlength="60"
                            autocomplete="off"
                            placeholder="可选，例如「集市场外价」"
                        />
                    </label>
                </div>
                <p class="hint">同一天可以记多条，涨跌只与上一条不同日期的记录比较。</p>
            </fieldset>
            <p v-if="error" class="error form-error" role="alert">{{ error }}</p>
        </form>
        <template #footer="{ close }">
            <button class="btn" :disabled="app.busy" @click="close">取消</button>
            <button class="btn primary" type="submit" form="price-log-form" :disabled="app.busy">
                {{ app.busy ? '保存中…' : log ? '保存修改' : '记下这个价' }}
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
.log-subject {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    margin-bottom: 4px;
    color: var(--muted);
    font-size: 13px;
}
.log-unit {
    font-size: 11.5px;
    padding: 1px 5px;
    border: 1px solid var(--line);
    border-radius: 3px;
}
.log-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 14px;
    align-items: end;
    margin-top: 4px;
}
</style>
