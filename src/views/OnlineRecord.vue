<template>
  <div class="online-record">
    <!-- 页头：状态 + 控制 -->
    <header class="page-header">
      <div class="header-info">
        <h1 class="page-title">收益记录</h1>
        <p class="page-subtitle">记录游戏时光，追踪点卡消耗与物品收益</p>
      </div>
      <div class="header-controls">
        <!-- 在线计时 -->
        <div v-if="isOnline" class="online-indicator">
          <span class="indicator-dot"></span>
          <span class="indicator-text">{{ currentDuration }}</span>
        </div>

        <!-- 设置 -->
        <AppPopover placement="bottom" :width="220">
          <template #reference>
            <span class="setting-chip">
              <AppIcon name="user" :size="14" />
              {{ currentSetData.onlineAccounts }} 角色
            </span>
          </template>
          <SettingPopover
            title="在线角色数"
            icon="user"
            v-model="currentSetData.onlineAccounts"
            :input-props="{ min: 1, max: 20, controls: true }" />
        </AppPopover>
        <AppPopover placement="bottom" :width="220">
          <template #reference>
            <span class="setting-chip">
              <AppIcon name="money" :size="14" />
              点卡 {{ cardPriceText }}
            </span>
          </template>
          <SettingPopover
            title="点卡价格"
            icon="money"
            v-model="currentSetData.cardPrice"
            :input-props="{ min: 1000, step: 1000, controls: true }" />
        </AppPopover>

        <!-- 按钮 -->
        <button
          v-if="!isOnline"
          class="start-btn"
          :disabled="isStarting"
          @click="startOnline">
          <AppIcon name="video-play" :size="16" />
          开始游戏
        </button>
        <button
          v-if="isOnline"
          class="stop-btn"
          :disabled="isEnding"
          @click="endOnline">
          <AppIcon name="video-pause" :size="16" />
          结束游戏
        </button>
      </div>
    </header>

    <!-- 统计卡片行 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon-box">
          <AppIcon name="clock" :size="20" />
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ todaysData.onlineTime.toFixed(2) }}h</div>
          <div class="stat-label">今日在线</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box">
          <AppIcon name="money" :size="20" />
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ todaysData.cardCost.toFixed(0) }}</div>
          <div class="stat-label">点卡消耗</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box">
          <AppIcon name="trend-charts" :size="20" />
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ todaysData.todaysIncome.toLocaleString() }}</div>
          <div class="stat-label">今日收益</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box">
          <AppIcon name="wallet" :size="20" />
        </div>
        <div class="stat-body">
          <div class="stat-value" :class="{ negative: todaysData.todaysBalance < 0 }">
            {{ todaysData.todaysBalance.toLocaleString() }}
          </div>
          <div class="stat-label">今日结余</div>
        </div>
      </div>
    </div>

    <!-- 主操作区：物品选择 + 今日战绩 -->
    <div class="main-area">
      <!-- 左侧：物品选择 -->
      <section class="item-panel">
        <div class="panel-header">
          <h2 class="panel-title">物品选择</h2>
        </div>
        <div class="item-panel-body">
          <!-- 固定价格区 -->
          <p class="section-label">固定价格</p>
          <div class="item-grid">
            <button
              v-for="item in itemsData"
              :key="item.id"
              class="item-card"
              @click="handleItemClick(item)"
              @contextmenu.prevent="handleItemRightClick(item)">
              <div class="item-img">
                <img :src="item.image" :alt="item.name" />
              </div>
              <span v-if="item.price > 0" class="item-price">{{ fmtPrice(item.price) }}</span>
            </button>
          </div>

          <!-- 非固定价格区 -->
          <p class="section-label">非固定价格</p>
          <div class="item-grid">
            <button
              v-for="item in unsetItemsData"
              :key="item.id"
              class="item-card"
              @click="handleItemClick(item)"
              @contextmenu.prevent="handleItemRightClick(item)">
              <div class="item-img">
                <img :src="item.image" :alt="item.name" />
              </div>
            </button>
          </div>
        </div>
      </section>

      <!-- 右侧：今日战绩 -->
      <section class="result-panel">
        <div class="panel-header">
          <h2 class="panel-title">今日战绩</h2>
          <span v-if="selectedItems.length > 0" class="panel-total">
            合计 ¥{{ totalValue.toLocaleString() }}
          </span>
        </div>

        <div class="result-list">
          <div v-if="selectedItems.length === 0" class="empty-state">
            <AppIcon name="box" :size="40" />
            <p>点击或右键物品开始记录</p>
          </div>
          <div
            v-for="(item, idx) in selectedItems"
            :key="idx"
            class="result-item">
            <div class="result-item-img">
              <img :src="getItemById(item.itemId)?.image" :alt="getItemById(item.itemId)?.name" />
            </div>
            <span class="result-item-name">{{ item.customName || getItemById(item.itemId)?.name || '未知' }}</span>
            <span class="result-item-price">¥{{ item.price.toLocaleString() }}</span>
            <button class="result-item-remove" @click="removeSelectedItem(idx)">
              <AppIcon name="close" :size="14" />
            </button>
          </div>
        </div>

        <!-- 查看历史 -->
        <div class="result-footer">
          <router-link to="/record-list" class="history-link">
            查看历史记录
            <AppIcon name="arrow-right" :size="14" />
          </router-link>
        </div>
      </section>
    </div>

    <!-- 价格对话框 -->
    <PriceDialog
      v-model="showPriceDialog"
      :item="currentItem"
      @confirm="handlePriceConfirm" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSettings } from '../composables/useSettings'
import { useOnlineTimer } from '../composables/useOnlineTimer'
import { useTodayData } from '../composables/useTodayData'
import { useItems } from '../composables/useItems'
import { CARD_COST_MULTIPLIER, UNSET_ITEMS_START_ID } from '../constants'
import PriceDialog from '../components/PriceDialog.vue'
import SettingPopover from '../components/SettingPopover.vue'
import AppIcon from '../components/AppIcon.vue'
import AppPopover from '../components/AppPopover.vue'
import { toast } from '../utils/toast.js'

const { currentSetData } = useSettings()
const { isOnline, startTime, currentDuration, isStarting, isEnding, start, stop, getOnlineTime, setAutoSave } = useOnlineTimer()

const cardPriceText = computed(() => {
  const v = currentSetData.value.cardPrice
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
})

const fmtPrice = (v) => {
  if (v >= 1000000) return `${(v / 10000).toFixed(0)}W`
  return v.toLocaleString()
}
const { todaysData, addOnlineRecord, updateIncome } = useTodayData()
const { itemsData, unsetItemsData, getItemById } = useItems()

const selectedItems = ref([])
const showPriceDialog = ref(false)
const currentItem = ref(null)

// 记录已保存的最后时间点，避免重复 save
let lastSavedHours = 0

const saveRecord = (onlineTime) => {
  if (onlineTime <= 0 || onlineTime <= lastSavedHours) return
  lastSavedHours = onlineTime
  const { onlineAccounts, cardPrice } = currentSetData.value
  addOnlineRecord({
    time: onlineTime,
    start: startTime.value,
    end: new Date(),
    onlineAccounts,
    cardPrice,
    cardCost: onlineTime * cardPrice * CARD_COST_MULTIPLIER * onlineAccounts,
  })
}

const startOnline = () => {
  lastSavedHours = 0
  setAutoSave(saveRecord)
  start()
}

const endOnline = () => {
  const onlineTime = getOnlineTime()
  if (onlineTime > 0) saveRecord(onlineTime)
  setAutoSave(null)
  stop()
}

// 窗口关闭时自动保存
const onBeforeUnload = () => {
  if (isOnline.value) {
    const onlineTime = getOnlineTime()
    if (onlineTime > 0) saveRecord(onlineTime)
  }
}

const handleItemClick = (item) => {
  if (item && item.price > 0) {
    addItemToSelected(item)
  } else {
    currentItem.value = item
    showPriceDialog.value = true
  }
}

const handleItemRightClick = (item) => {
  currentItem.value = item
  showPriceDialog.value = true
}

const addItemToSelected = (item) => {
  selectedItems.value.unshift({
    itemId: item.id,
    price: item.price,
    customName: item.customName || null,
  })
  toast.success(`${item.customName || item.name} 已添加`)
}

const handlePriceConfirm = ({ price, name }) => {
  if (!currentItem.value || price <= 0) {
    toast.warning('请输入有效的价格')
    return
  }
  const item = currentItem.value
  const itemName = name || item.name
  if (item.id >= UNSET_ITEMS_START_ID) {
    addItemToSelected({ id: item.id, name: itemName, price, customName: name || null })
  } else {
    const idx = itemsData.value.findIndex(i => i.id === item.id)
    if (idx !== -1) {
      itemsData.value[idx].price = price
      addItemToSelected(itemsData.value[idx])
      toast.success(`${itemsData.value[idx].name} 价格已设置为 ¥${price}`)
    }
  }
}

const removeSelectedItem = (index) => {
  selectedItems.value.splice(index, 1)
}

const totalValue = computed(() => {
  return selectedItems.value.reduce((sum, item) => sum + item.price, 0)
})

watch(selectedItems, () => {
  todaysData.value.loadList = [...selectedItems.value]
  updateIncome(totalValue.value)
}, { deep: true })

onMounted(() => {
  if (todaysData.value.loadList.length) {
    selectedItems.value = todaysData.value.loadList
  }
  lastSavedHours = isOnline.value ? getOnlineTime() : 0
  setAutoSave(saveRecord)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<style lang="less" scoped>
@import '../styles/variables.less';
@import '../styles/mixins.less';

.online-record {
  display: flex;
  flex-direction: column;
  gap: @spacing-2xl;
  min-height: calc(100vh - 48px);
}

/* ========== 页头 ========== */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: @spacing-lg;
}

.header-info {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: @spacing-md;
  min-width: 0;
}

.page-title {
  .serif-title();
  font-size: 2rem;
  margin: 0;
  flex-shrink: 0;
}

.page-subtitle {
  .copy-text();
  margin: 0;
  white-space: nowrap;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: @spacing-md;
  flex-shrink: 0;
}

.online-indicator {
  display: flex;
  align-items: center;
  gap: @spacing-sm;
  padding: @spacing-sm @spacing-lg;
  border: 1px solid @color-success;
  background: @color-success-bg;
  color: @color-success;
  font-weight: 600;
  font-size: 0.875rem;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: @color-success;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.setting-chip {
  display: inline-flex;
  align-items: center;
  gap: @spacing-xs;
  padding: @spacing-xs @spacing-md;
  border: 1px solid @color-border;
  background: @bg-paper;
  font-size: 0.8125rem;
  font-weight: 500;
  color: @text-muted;
  cursor: pointer;
  transition: all @transition-fast ease;
  flex-shrink: 0;

  &:hover {
    border-color: @color-primary;
    color: @color-primary;
  }
}

/* 紧凑按钮 — zhijian 风格 */
.start-btn,
.stop-btn {
  display: inline-flex;
  align-items: center;
  gap: @spacing-xs;
  padding: @spacing-xs @spacing-lg;
  border: 1px solid @color-primary;
  background: @bg-paper;
  color: @color-primary;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all @transition-fast ease;
  flex-shrink: 0;
  font-family: inherit;

  &:hover:not(:disabled) {
    background: @color-primary;
    color: @color-primary-foreground;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.stop-btn {
  border-color: @color-danger;
  color: @color-danger;

  &:hover:not(:disabled) {
    background: @color-danger;
    color: @color-primary-foreground;
  }
}

/* ========== 统计卡片行 ========== */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: @spacing-md;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: @spacing-lg;
  padding: @spacing-xl;
  .paper-card-primary();
}

.stat-icon-box {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: @color-primary-light;
  color: @color-primary;
  flex-shrink: 0;
}

.stat-body {
  min-width: 0;
}

.stat-value {
  .serif-title();
  font-size: 1.75rem;
  line-height: 1.2;
  margin-bottom: 2px;

  &.negative {
    color: @color-danger;
  }
}

.stat-label {
  font-size: 0.75rem;
  color: @text-muted;
  font-weight: 500;
}

/* ========== 主操作区 ========== */
.main-area {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: @spacing-2xl;
  align-items: stretch;
}

/* 物品面板 */
.item-panel {
  .paper-card();
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  padding: @spacing-2xl;
}

.item-panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: @spacing-xs;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: @spacing-lg;
}

.panel-title {
  .serif-title();
  font-size: 1.25rem;
  margin: 0;
}

.panel-total {
  .serif-title();
  font-size: 1.25rem;
  color: @color-primary;
}

.section-label {
  .label-text();
  margin: @spacing-lg 0 @spacing-sm;
  font-size: 0.6875rem;
  letter-spacing: 0.15em;
  opacity: 0.6;

  &:first-of-type {
    margin-top: 0;
  }
}

/* 物品网格 */
.item-grid {
  display: flex;
  flex-wrap: wrap;
  gap: @spacing-sm;
}

.item-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 64px;
  padding: @spacing-xs;
  border: 1px solid @color-border;
  background: #fff;
  cursor: pointer;

  &:hover {
    border-color: @color-primary;
    background: @color-primary-light;
  }
}

.item-img {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
}

.item-price {
  font-size: 0.625rem;
  color: @color-primary;
  font-weight: 400;
  line-height: 1;
}

/* 战绩面板 */
.result-panel {
  .paper-card-primary();
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.result-panel .panel-header {
  padding: @spacing-lg @spacing-xl;
  margin: 0;
  border-bottom: 1px solid @color-border;
}

.result-list {
  flex: 1;
  overflow-y: auto;
  padding: @spacing-sm;
  min-height: 120px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: @spacing-2xl;
  color: @text-muted;
  gap: @spacing-md;
  font-size: 0.8125rem;
}

.result-item {
  display: flex;
  align-items: center;
  gap: @spacing-sm;
  padding: @spacing-sm @spacing-md;
  border-bottom: 1px solid @color-border;
  transition: background @transition-fast ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: @color-muted;
  }
}

.result-item-img {
  width: 28px;
  height: 28px;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

.result-item-name {
  flex: 1;
  font-size: 0.8125rem;
  font-weight: 500;
  color: @text-primary;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-item-price {
  font-weight: 600;
  font-size: 0.8125rem;
  color: @color-primary;
  flex-shrink: 0;
}

.result-item-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: @text-muted;
  cursor: pointer;
  flex-shrink: 0;
  transition: color @transition-fast ease;

  &:hover {
    color: @color-danger;
  }
}

.result-footer {
  padding: @spacing-md @spacing-xl;
  border-top: 1px solid @color-border;
}

.history-link {
  display: inline-flex;
  align-items: center;
  gap: @spacing-xs;
  font-size: 0.75rem;
  font-weight: 500;
  color: @text-muted;
  transition: color @transition-fast ease;

  &:hover {
    color: @color-primary;
  }
}

/* ========== 响应式 ========== */
@media (max-width: 900px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .main-area {
    grid-template-columns: 1fr;
  }
}
</style>
