<template>
  <div class="record-list">
    <header class="page-header">
      <div class="header-info">
        <h1 class="page-title">历史记录</h1>
        <p class="page-subtitle">查看所有历史数据，包括在线时间、收益和物品获取</p>
      </div>
      <div class="header-actions">
        <button class="btn-outline" @click="exportData" :disabled="isExporting">
          <AppIcon name="download" :size="14" />
          导出数据
        </button>
        <button class="btn-danger-outline" @click="clearAllData" :disabled="isClearing">
          <AppIcon name="delete" :size="14" />
          清空数据
        </button>
      </div>
    </header>

    <!-- 统计概览 -->
    <div class="stats-row" v-if="allRecords.length > 0">
      <div class="stat-card">
        <div class="stat-icon-box"><AppIcon name="calendar" :size="20" /></div>
        <div class="stat-body">
          <div class="stat-value">{{ allRecords.length }}</div>
          <div class="stat-label">总记录天数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box"><AppIcon name="clock" :size="20" /></div>
        <div class="stat-body">
          <div class="stat-value">{{ totalOnlineTime.toFixed(2) }}h</div>
          <div class="stat-label">总在线时间</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box"><AppIcon name="trend-charts" :size="20" /></div>
        <div class="stat-body">
          <div class="stat-value">{{ totalIncome.toLocaleString() }}</div>
          <div class="stat-label">总收益</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box"><AppIcon name="wallet" :size="20" /></div>
        <div class="stat-body">
          <div class="stat-value">{{ totalBalance.toLocaleString() }}</div>
          <div class="stat-label">总结余</div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="allRecords.length === 0" class="empty-state">
      <AppIcon name="document" :size="48" />
      <p class="empty-text">暂无历史记录</p>
      <router-link to="/online-record" class="empty-link">去记录</router-link>
    </div>

    <!-- 原生表格 -->
    <div v-else class="table-wrap">
      <table class="native-table">
        <thead>
          <tr>
            <th>日期</th>
            <th>在线时间</th>
            <th>点卡消耗</th>
            <th>当日收益</th>
            <th>当日结余</th>
            <th>物品数</th>
            <th>在线次数</th>
            <th class="th-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in allRecords" :key="idx">
            <td>{{ row.date }}</td>
            <td>{{ row.onlineTime.toFixed(2) }}h</td>
            <td>{{ row.cardCost.toFixed(0) }}</td>
            <td>{{ row.todaysIncome.toLocaleString() }}</td>
            <td>
              <span :class="row.todaysBalance >= 0 ? 'text-success' : 'text-danger'">
                {{ row.todaysBalance.toLocaleString() }}
              </span>
            </td>
            <td>{{ row.loadList ? row.loadList.length : 0 }}</td>
            <td>{{ row.onlineList ? row.onlineList.length : 0 }}</td>
            <td class="td-actions">
              <button class="btn-sm" @click="viewRecordDetail(row)">详情</button>
              <button class="btn-sm btn-sm-danger" @click="deleteRecord(idx)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 详情弹窗 -->
    <AppDialog v-model="showDetailDialog" title="记录详情" width="700px">
      <div v-if="selectedRecord" class="detail-content">
        <h3 class="detail-date">{{ selectedRecord.date }}</h3>
        <div class="detail-stats">
          <div class="detail-stat-item">
            <span class="detail-stat-label">在线时间</span>
            <span class="detail-stat-value">{{ selectedRecord.onlineTime.toFixed(2) }}h</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">点卡消耗</span>
            <span class="detail-stat-value">{{ selectedRecord.cardCost.toFixed(0) }}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">当日收益</span>
            <span class="detail-stat-value">{{ selectedRecord.todaysIncome.toFixed(0) }}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">当日结余</span>
            <span class="detail-stat-value" :class="selectedRecord.todaysBalance >= 0 ? 'text-success' : 'text-danger'">
              {{ selectedRecord.todaysBalance.toFixed(0) }}
            </span>
          </div>
        </div>
        <div v-if="selectedRecord.loadList && selectedRecord.loadList.length" class="detail-section">
          <h4>物品列表</h4>
          <div class="detail-items">
            <div v-for="(item, i) in selectedRecord.loadList" :key="i" class="detail-item-row">
              <img :src="getItemImage(item.itemId)" class="detail-item-icon" />
              <span class="detail-item-name">{{ getItemName(item.itemId) }}</span>
              <span class="detail-item-price">¥{{ item.price.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import AppDialog from '../components/AppDialog.vue'
import { toast } from '../utils/toast.js'
import { confirm } from '../utils/confirm.js'

const allRecords = ref([])
const showDetailDialog = ref(false)
const selectedRecord = ref(null)
const isExporting = ref(false)
const isClearing = ref(false)

const totalOnlineTime = computed(() => allRecords.value.reduce((s, r) => s + r.onlineTime, 0))
const totalIncome = computed(() => allRecords.value.reduce((s, r) => s + r.todaysIncome, 0))
const totalBalance = computed(() => allRecords.value.reduce((s, r) => s + r.todaysBalance, 0))

const totalItemsData = [
  { id: 1,  name: '60武器',       image: '/images/online-record/60武器.png' },
  { id: 2,  name: '70武器',       image: '/images/online-record/70武器.png' },
  { id: 3,  name: '80武器',       image: '/images/online-record/80武器.png' },
  { id: 4,  name: '60装备',       image: '/images/online-record/60防具.png' },
  { id: 5,  name: '70装备',       image: '/images/online-record/70防具.png' },
  { id: 6,  name: '80装备',       image: '/images/online-record/80防具.png' },
  { id: 7,  name: '特赦令牌',     image: '/images/online-record/特赦令牌.png' },
  { id: 8,  name: '金刚石',       image: '/images/online-record/金刚石.png' },
  { id: 9,  name: '定魂珠',       image: '/images/online-record/定魂珠.png' },
  { id: 10, name: '夜明珠',       image: '/images/online-record/夜明珠.png' },
  { id: 11, name: '龙鳞',         image: '/images/online-record/龙鳞.png' },
  { id: 12, name: '避水珠',       image: '/images/online-record/避水珠.png' },
  { id: 13, name: '金柳露',       image: '/images/online-record/金柳露.png' },
  { id: 14, name: '超级金柳露',   image: '/images/online-record/超级金柳露.png' },
  { id: 15, name: '净瓶玉露',     image: '/images/online-record/净瓶玉露.png' },
  { id: 16, name: '超级净瓶玉露', image: '/images/online-record/超级净瓶玉露.png' },
  { id: 17, name: '强化石',       image: '/images/online-record/强化石.png' },
  { id: 18, name: '摇钱树苗',     image: '/images/online-record/摇钱树树苗.png' },
  { id: 19, name: '海马',         image: '/images/online-record/海马.png' },
  { id: 20, name: '修炼果',       image: '/images/online-record/修炼果.png' },
  { id: 21, name: '彩果',         image: '/images/online-record/彩果.png' },
  { id: 22, name: '黑宝石',       image: '/images/online-record/黑宝石.png' },
  { id: 23, name: '红玛瑙',       image: '/images/online-record/红玛瑙.png' },
  { id: 24, name: '太阳石',       image: '/images/online-record/太阳石.png' },
  { id: 25, name: '月亮石',       image: '/images/online-record/月亮石.png' },
  { id: 26, name: '舍利子',       image: '/images/online-record/舍利子.png' },
  { id: 27, name: '光芒石',       image: '/images/online-record/光芒石.png' },
  { id: 29, name: '星辉石',       image: '/images/online-record/星辉石.png' },
  { id: 31, name: '精魄灵石',     image: '/images/online-record/精魄灵石.png' },
  { id: 30, name: '五色灵尘',     image: '/images/online-record/五色灵尘.gif' },
  { id: 34, name: '符石',         image: '/images/online-record/符石.png' },
  { id: 35, name: '符石卷轴',     image: '/images/online-record/符石卷轴.png' },
  { id: 36, name: '月华露',       image: '/images/online-record/月华露.png' },
  { id: 32, name: '乐器',         image: '/images/online-record/乐器.png' },
  { id: 33, name: '玫瑰',         image: '/images/online-record/玫瑰.png' },
  { id: 38, name: '金银锦盒',     image: '/images/online-record/金银锦盒.png' },
  { id: 39, name: '法宝任务书',   image: '/images/online-record/法宝任务书.png' },
  { id: 40, name: '种子',         image: '/images/online-record/种子.png' },
  { id: 99,  name: '金币',     image: '/images/online-record/金币.png' },
  { id: 100, name: '兽决',     image: '/images/online-record/兽决.png' },
  { id: 101, name: '高级兽决', image: '/images/online-record/高级兽决.gif' },
  { id: 102, name: '内丹',     image: '/images/online-record/内丹.png' },
  { id: 103, name: '高内丹',   image: '/images/online-record/高内丹.png' },
  { id: 104, name: '珍珠',     image: '/images/online-record/珍珠.png' },
  { id: 105, name: '附魔',     image: '/images/online-record/附魔.png' },
  { id: 106, name: '书',       image: '/images/online-record/书.png' },
  { id: 107, name: '铁',       image: '/images/online-record/铁.png' },
  { id: 108, name: '晶石',     image: '/images/online-record/晶石.png' },
  { id: 109, name: '灵饰书',   image: '/images/online-record/灵饰书.png' },
  { id: 110, name: '炼妖石',   image: '/images/online-record/炼妖石.png' },
  { id: 111, name: '图册',     image: '/images/online-record/图册.png' },
  { id: 112, name: '金丹',     image: '/images/online-record/金丹.png' },
  { id: 113, name: '如意丹',   image: '/images/online-record/如意丹.png' },
  { id: 114, name: '卡',       image: '/images/online-record/卡.png' },
  { id: 115, name: '钟灵石',   image: '/images/online-record/钟灵石.gif' },
  { id: 116, name: '法宝',     image: '/images/online-record/法宝.png' },
  { id: 117, name: '鬼谷子',   image: '/images/online-record/鬼谷子.png' },
  { id: 118, name: '瓶子',     image: '/images/online-record/瓶子.png' },
  { id: 200, name: '其他',     image: '/images/online-record/其他.png' },
]

const getItemImage = (id) => totalItemsData.find(i => i.id === id)?.image || ''
const getItemName = (id) => totalItemsData.find(i => i.id === id)?.name || '未知'

const loadRecords = () => {
  try {
    const data = localStorage.getItem('mh-all-data')
    if (data) allRecords.value = JSON.parse(data)
  } catch { /* ignore */ }
}

const viewRecordDetail = (record) => {
  selectedRecord.value = record
  showDetailDialog.value = true
}

const deleteRecord = async (index) => {
  const ok = await confirm('确定要删除这条记录吗？', { type: 'warning' })
  if (!ok) return
  allRecords.value.splice(index, 1)
  localStorage.setItem('mh-all-data', JSON.stringify(allRecords.value))
  toast.success('记录已删除')
}

const exportData = async () => {
  isExporting.value = true
  try {
    const blob = new Blob([JSON.stringify(allRecords.value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `梦幻西游记录_${new Date().toLocaleDateString()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('导出成功')
  } catch {
    toast.error('导出失败')
  } finally {
    isExporting.value = false
  }
}

const clearAllData = async () => {
  const ok = await confirm('确定要清空所有记录吗？此操作不可恢复。')
  if (!ok) return
  isClearing.value = true
  allRecords.value = []
  localStorage.removeItem('mh-all-data')
  toast.success('已清空')
  isClearing.value = false
}

onMounted(() => loadRecords())
</script>

<style lang="less" scoped>
@import '../styles/variables.less';
@import '../styles/mixins.less';

.record-list {
  display: flex;
  flex-direction: column;
  gap: @spacing-2xl;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: @spacing-lg;
}

.header-info {
  display: flex;
  align-items: baseline;
  gap: @spacing-md;
  min-width: 0;
}

.page-title { .serif-title(); font-size: 2rem; margin: 0; flex-shrink: 0; }
.page-subtitle { .copy-text(); margin: 0; white-space: nowrap; }
.header-actions { display: flex; gap: @spacing-md; flex-shrink: 0; }

.btn-outline, .btn-danger-outline {
  display: inline-flex;
  align-items: center;
  gap: @spacing-xs;
  padding: @spacing-xs @spacing-lg;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all @transition-fast ease;
  font-family: inherit;
  background: @bg-paper;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.btn-outline {
  border: 1px solid @color-border;
  color: @text-primary;
  &:hover:not(:disabled) { border-color: @color-primary; color: @color-primary; }
}

.btn-danger-outline {
  border: 1px solid @color-danger;
  color: @color-danger;
  &:hover:not(:disabled) { background: @color-danger; color: @color-primary-foreground; }
}

.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: @spacing-md; }
.stat-card { display: flex; align-items: center; gap: @spacing-lg; padding: @spacing-xl; .paper-card-primary(); }
.stat-icon-box { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: @color-primary-light; color: @color-primary; flex-shrink: 0; }
.stat-body { min-width: 0; }
.stat-value { .serif-title(); font-size: 1.75rem; line-height: 1.2; margin-bottom: 2px; }
.stat-label { font-size: 0.75rem; color: @text-muted; font-weight: 500; }

.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; color: @text-muted; gap: @spacing-lg; }
.empty-text { font-size: 1rem; margin: 0; }
.empty-link { font-size: 0.875rem; font-weight: 500; color: @color-primary; border: 1px solid @color-primary; padding: @spacing-sm @spacing-xl; transition: all @transition-fast ease; text-decoration: none; &:hover { background: @color-primary; color: @color-primary-foreground; } }

.table-wrap { .paper-card(); overflow: hidden; overflow-x: auto; }

.native-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;

  th {
    text-align: left;
    padding: 12px 16px;
    background: @color-muted;
    border-bottom: 1px solid @color-border;
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: @text-primary;
    white-space: nowrap;
  }

  td {
    padding: 10px 16px;
    border-bottom: 1px solid @color-border;
    color: @text-primary;
  }

  tbody tr:hover td { background: @color-muted; }
  tbody tr:nth-child(even) td { background: @bg-warm; }
  tbody tr:nth-child(even):hover td { background: @color-muted; }
}

.th-actions { text-align: right; }
.td-actions { text-align: right; white-space: nowrap; }

.btn-sm, .btn-sm-danger {
  padding: 3px 12px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all @transition-fast ease;
  font-family: inherit;
  background: @bg-paper;
}

.btn-sm {
  border: 1px solid @color-border;
  color: @text-primary;
  margin-right: 4px;
  &:hover { border-color: @color-primary; color: @color-primary; }
}

.btn-sm-danger {
  border: 1px solid @color-danger;
  color: @color-danger;
  &:hover { background: @color-danger; color: @color-primary-foreground; }
}

.text-success { color: @color-success; font-weight: 600; }
.text-danger { color: @color-danger; font-weight: 600; }

.detail-content { display: flex; flex-direction: column; gap: @spacing-xl; }
.detail-date { .serif-title(); font-size: 1.25rem; margin: 0; }
.detail-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: @spacing-md; }
.detail-stat-item { padding: @spacing-md; border: 1px solid @color-border; text-align: center; }
.detail-stat-label { display: block; font-size: 0.6875rem; color: @text-muted; margin-bottom: @spacing-xs; letter-spacing: 0.05em; }
.detail-stat-value { .serif-title(); font-size: 1.25rem; }
.detail-section { h4 { .serif-title(); font-size: 1rem; margin: 0 0 @spacing-md 0; padding-bottom: @spacing-sm; border-bottom: 1px solid @color-border; } }
.detail-items { display: flex; flex-direction: column; gap: 1px; }
.detail-item-row { display: flex; align-items: center; gap: @spacing-md; padding: @spacing-sm @spacing-md; border-bottom: 1px solid @color-border; &:last-child { border-bottom: none; } }
.detail-item-icon { width: 28px; height: 28px; object-fit: contain; }
.detail-item-name { flex: 1; font-size: 0.8125rem; font-weight: 500; }
.detail-item-price { font-weight: 600; font-size: 0.8125rem; color: @color-primary; }

@media (max-width: 900px) {
  .stats-row, .detail-stats { grid-template-columns: repeat(2, 1fr); }
}
</style>
