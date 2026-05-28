<template>
  <div class="online-record">
    <!-- 页头：状态 + 控制 -->
    <header class="page-header">
      <div class="header-info">
        <h1 class="page-title">收益记录</h1>
        <button class="help-btn" @click="showHelp = true" title="使用帮助">?</button>
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
          <div class="stat-value">{{ fmtW(todaysData.cardCost) }}</div>
          <div class="stat-label">点卡消耗</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box">
          <AppIcon name="trend-charts" :size="20" />
        </div>
        <div class="stat-body">
          <div class="stat-value">{{ fmtW(todaysData.todaysIncome) }}</div>
          <div class="stat-label">今日收益</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-box">
          <AppIcon name="wallet" :size="20" />
        </div>
        <div class="stat-body">
          <div class="stat-value" :class="{ negative: todaysData.todaysBalance < 0 }">
            {{ fmtW(todaysData.todaysBalance) }}
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
          <div class="panel-actions">
            <button class="btn-mini" @click="exportPrices" title="导出单价">导出</button>
            <button class="btn-mini" @click="triggerImport" title="导入单价">导入</button>
            <input
              ref="importInput"
              type="file"
              accept=".json"
              class="import-input"
              @change="importPrices"
            />
          </div>
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
              <span v-if="item.price > 0" class="item-price">{{ fmtW(item.price) }}</span>
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
            合计 {{ fmtW(totalValue) }}
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
            <span class="result-item-price">{{ fmtW(item.price) }}</span>
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

    <!-- 使用帮助 -->
    <AppDialog v-model="showHelp" title="使用帮助" width="440px">
      <div class="help-content">
        <dl class="help-list">
          <dt>开始游戏</dt>
          <dd>点击后开始计时，记录在线时长和点卡消耗。切换页面不会中断计时。</dd>
          <dt>角色数 / 点卡价格</dt>
          <dd>设置在线角色数量和点卡单价（梦幻币/点），影响点卡成本计算。</dd>
          <dt>物品选择</dt>
          <dd>点击已有价格的物品直接添加到今日收益。右键任意物品可修改价格。</dd>
          <dt>固定价格</dt>
          <dd>价格会持久保存，下次点击直接使用。右键可随时修改。</dd>
          <dt>非固定价格</dt>
          <dd>每次需手动输入价格。最后一个「其他」可自定义物品名称。</dd>
          <dt>今日战绩</dt>
          <dd>展示今日所有收益物品和总价值。</dd>
          <dt>结束游戏</dt>
          <dd>停止计时并保存本次记录。关闭窗口也会自动保存。</dd>
        </dl>
        <p class="help-formula">点卡成本 = 在线时长 × 点卡单价 × 6点/小时 × 角色数</p>
      </div>
    </AppDialog>
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
import AppDialog from '../components/AppDialog.vue'
import { toast } from '../utils/toast.js'

const { currentSetData } = useSettings()
const { isOnline, startTime, currentDuration, isStarting, isEnding, start, stop, getOnlineTime, setAutoSave } = useOnlineTimer()

const cardPriceText = computed(() => {
  const v = currentSetData.value.cardPrice
  return v >= 10000 ? `${(v / 10000).toFixed(1)}万` : v.toLocaleString()
})

const fmtW = (v) => `${(v / 10000).toFixed(1)}W`
const { todaysData, addOnlineRecord, updateIncome } = useTodayData()
const { itemsData, unsetItemsData, getItemById } = useItems()

const selectedItems = ref([])
const showPriceDialog = ref(false)
const showHelp = ref(false)
const currentItem = ref(null)
const importInput = ref(null)

// 导入导出
const triggerImport = () => importInput.value?.click()

const exportPrices = () => {
  const data = {
    fixed: itemsData.value.map(({ id, name, price }) => ({ id, name, price })),
    unset: unsetItemsData.value.map(({ id, name, price }) => ({ id, name, price })),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `梦幻西游物品单价_${new Date().toLocaleDateString()}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('单价已导出')
}

const importPrices = (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result)
      if (!data.fixed || !data.unset) {
        return toast.warning('文件格式不正确')
      }
      let count = 0
      data.fixed.forEach((item) => {
        const idx = itemsData.value.findIndex(i => i.id === item.id)
        if (idx !== -1 && item.price > 0) {
          itemsData.value[idx].price = item.price
          count++
        }
      })
      data.unset.forEach((item) => {
        const idx = unsetItemsData.value.findIndex(i => i.id === item.id)
        if (idx !== -1 && item.price > 0) {
          unsetItemsData.value[idx].price = item.price
          count++
        }
      })
      toast.success(`已导入 ${count} 个物品单价`)
    } catch {
      toast.error('文件解析失败')
    }
  }
  reader.readAsText(file)
  importInput.value.value = ''
}

// 记录已保存的最后时间点，避免重复累加
let lastSavedHours = 0

// 自动保存：只增量更新累积值，不重复建 onlineList 记录
const autoSave = (onlineTime) => {
  if (onlineTime <= 0 || onlineTime <= lastSavedHours) return
  const delta = onlineTime - lastSavedHours
  lastSavedHours = onlineTime
  const { onlineAccounts, cardPrice } = currentSetData.value
  const cost = delta * cardPrice * CARD_COST_MULTIPLIER * onlineAccounts
  todaysData.value.onlineTime += delta
  todaysData.value.cardCost += cost
  todaysData.value.todaysBalance = todaysData.value.todaysIncome - todaysData.value.cardCost
}

const startOnline = () => {
  lastSavedHours = 0
  setAutoSave(autoSave)
  start()
}

const endOnline = () => {
  const onlineTime = getOnlineTime()
  if (onlineTime > 0) {
    // 补上最后一段未自动保存的增量
    const delta = onlineTime - lastSavedHours
    if (delta > 0) {
      const { onlineAccounts, cardPrice } = currentSetData.value
      todaysData.value.onlineTime += delta
      todaysData.value.cardCost += delta * cardPrice * CARD_COST_MULTIPLIER * onlineAccounts
      todaysData.value.todaysBalance = todaysData.value.todaysIncome - todaysData.value.cardCost
    }
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
  setAutoSave(null)
  stop()
}

// 窗口关闭时保存最终记录
const onBeforeUnload = () => {
  if (!isOnline.value) return
  const onlineTime = getOnlineTime()
  if (onlineTime <= 0) return
  const delta = onlineTime - lastSavedHours
  if (delta > 0) {
    const { onlineAccounts, cardPrice } = currentSetData.value
    todaysData.value.onlineTime += delta
    todaysData.value.cardCost += delta * cardPrice * CARD_COST_MULTIPLIER * onlineAccounts
    todaysData.value.todaysBalance = todaysData.value.todaysIncome - todaysData.value.cardCost
  }
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
      toast.success(`${itemsData.value[idx].name} 价格已设置为 ${fmtW(price)}`)
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
  if (isOnline.value) setAutoSave(autoSave)
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
  height: calc(100vh - 48px);
  overflow: hidden;
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

.help-btn {
  width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid @color-border;
  background: @bg-paper;
  color: @text-muted;
  font-size: 0.75rem; font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
  transition: all @transition-fast ease;

  &:hover { border-color: @color-primary; color: @color-primary; }
}

.help-content {
  .help-list {
    margin: 0;
    dt {
      font-weight: 600; font-size: 0.8125rem; color: @text-primary;
      margin: @spacing-md 0 2px 0;
      &:first-child { margin-top: 0; }
    }
    dd {
      margin: 0 0 0 @spacing-sm;
      font-size: 0.75rem; line-height: 1.65; color: @text-muted;
    }
  }
  .help-formula {
    margin: @spacing-lg 0 0 0;
    padding-top: @spacing-md;
    border-top: 1px solid @color-border;
    font-size: 0.75rem; color: @text-muted;
  }
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
  overflow: hidden;
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

.panel-actions {
  display: flex; gap: @spacing-xs; flex-shrink: 0;
}

.btn-mini {
  padding: 2px 10px;
  border: 1px solid @color-border;
  background: @bg-paper;
  font-size: 0.6875rem; color: @text-muted;
  cursor: pointer;
  font-family: inherit;
  transition: all @transition-fast ease;
  &:hover { border-color: @color-primary; color: @color-primary; }
}

.import-input { display: none; }

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
