<script setup lang="ts">
import { computed, ref } from 'vue';
import { useApplication } from '../../stores/application';
import AppIcon from '../../components/AppIcon.vue';
import BaseSelect from '../../components/BaseSelect.vue';
import PageHeader from '../../components/PageHeader.vue';
import OverviewEarningsBoard from './OverviewEarningsBoard.vue';
import OverviewAccountBoard from './OverviewAccountBoard.vue';
import OverviewGoalsBoard from './OverviewGoalsBoard.vue';

/**
 * 总览：把收益、账号、目标三处的结论并排放一次。
 *
 * 这里**不重算任何口径**——所有数字来自领域已有的 `earningsStats` / `accountStats` /
 * `goalSummary`，页面只负责选角色与给三块排版。理由很实际：概览一旦自己算一遍，
 * 就会和明细页慢慢对不上，而用户只会认为「总览坏了」。
 *
 * 两个账本的区间是分开的，各自住在自己的段落里：日常收益按「本日」看（当天打了多少），
 * 账号账本按「本月」看（买卖是低频大额）。共用的是角色筛选：换角色三块一起变。
 *
 * 物品只取收益页的口径（按当前参考单价算价值，`itemValue`）。「持有物品估值」是库存口径，
 * 同一个词两种数会让人以为哪边算错了，所以总览里不出现。
 *
 * 三块分别对应 `OverviewEarningsBoard` / `OverviewAccountBoard` / `OverviewGoalsBoard`，
 * 公共外壳是 `OverviewBoard`（细线分隔的标题行），图与紧凑列表也各有一份公用件。
 */
const app = useApplication();
const character = ref('all');

const characterOptions = computed(() => [
    { value: 'all', label: '全部角色' },
    ...app.characters.map((item) => ({ value: item.id, label: item.name })),
]);
const blank = computed(() => !app.characters.length && !(app.data?.transactions?.length ?? 0));
</script>

<template>
    <PageHeader title="总览" description="日常收益 · 账号账本 · 目标进度">
        <template #actions>
            <div class="overview-character">
                <BaseSelect v-model="character" label="总览角色筛选" :options="characterOptions" />
            </div>
        </template>
    </PageHeader>
    <div class="page-content overview">
        <div v-if="blank" class="empty">
            <AppIcon name="chart" :size="38" />
            <h2>还没有数据</h2>
            <p>先建一个角色，随后记的每一笔收益与账号收支都会汇总到这里。</p>
            <RouterLink class="btn primary" to="/characters">创建角色</RouterLink>
        </div>
        <template v-else>
            <OverviewEarningsBoard :character="character" />
            <OverviewAccountBoard :character="character" />
            <OverviewGoalsBoard :character="character" />
        </template>
    </div>
</template>

<style scoped>
.overview {
    display: flex;
    flex-direction: column;
    gap: 26px;
}
.overview-character {
    width: 132px;
}
@media (max-width: 750px) {
    .overview-character {
        width: 100%;
    }
}
</style>
