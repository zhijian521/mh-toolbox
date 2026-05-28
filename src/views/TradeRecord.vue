<template>
  <div class="trade-record">
    <header class="page-header">
      <div class="header-info">
        <h1 class="page-title">交易记录</h1>
        <p class="page-subtitle">藏宝阁 · 点卡 · 游戏内 · 其他买卖明细</p>
      </div>
    </header>

    <!-- 统计 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-body">
          <div class="stat-value">¥{{ stats.buyRmb.toLocaleString() }}</div>
          <div class="stat-label">买入(RMB)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-body">
          <div class="stat-value">¥{{ stats.sellRmb.toLocaleString() }}</div>
          <div class="stat-label">卖出(RMB)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-body">
          <div class="stat-value" :class="{ negative: stats.sellRmb - stats.buyRmb < 0 }">¥{{ (stats.sellRmb - stats.buyRmb).toLocaleString() }}</div>
          <div class="stat-label">收益(RMB)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-body">
          <div class="stat-value">{{ fmtW(stats.buyMhb) }}</div>
          <div class="stat-label">买入(梦幻币)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-body">
          <div class="stat-value">{{ fmtW(stats.sellMhb) }}</div>
          <div class="stat-label">卖出(梦幻币)</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-body">
          <div class="stat-value" :class="{ negative: stats.sellMhb - stats.buyMhb < 0 }">{{ fmtW(stats.sellMhb - stats.buyMhb) }}</div>
          <div class="stat-label">收益(梦幻币)</div>
        </div>
      </div>
    </div>

    <!-- 筛选 + 操作 -->
    <div class="toolbar">
      <div class="filter-group">
        <button v-for="d in dateOptions" :key="d.value" class="chip" :class="{ active: dateFilter === d.value }" @click="dateFilter = d.value">{{ d.label }}</button>
        <span class="filter-sep">|</span>
        <button v-for="s in sourceOptions" :key="s" class="chip" :class="{ active: sourceFilter === s }" @click="sourceFilter = s">{{ s }}</button>
      </div>
      <div class="toolbar-actions">
        <button class="btn-outline" @click="doExport">导出 CSV</button>
        <button class="btn-add" @click="openAdd">+ 新增</button>
      </div>
    </div>

    <!-- 列表 — 买/卖双栏 -->
    <div class="trade-columns" v-if="filteredTrades.length > 0">
      <div class="trade-col">
        <h3 class="col-title">买入</h3>
        <div v-for="t in buyTrades" :key="t.id" class="trade-item" @click="openEdit(t)">
          <div class="trade-top">
            <span class="trade-source-tag">{{ t.source }}</span>
            <span class="trade-name">{{ t.itemName }}</span>
          </div>
          <div class="trade-bottom">
            <span class="trade-date">{{ t.date }} {{ t.time }}</span>
            <span class="trade-amount buy">-{{ fmtAmt(t.amount, t.currency) }}{{ CUR_LABELS[t.currency] }}</span>
            <button class="trade-del" @click.stop="removeTrade(t.id)"><AppIcon name="close" :size="12" /></button>
          </div>
          <div v-if="t.notes" class="trade-note">{{ t.notes }}</div>
        </div>
        <div v-if="buyTrades.length === 0" class="col-empty">暂无</div>
      </div>
      <div class="trade-col">
        <h3 class="col-title">卖出</h3>
        <div v-for="t in sellTrades" :key="t.id" class="trade-item" @click="openEdit(t)">
          <div class="trade-top">
            <span class="trade-source-tag">{{ t.source }}</span>
            <span class="trade-name">{{ t.itemName }}</span>
          </div>
          <div class="trade-bottom">
            <span class="trade-date">{{ t.date }} {{ t.time }}</span>
            <span class="trade-amount sell">+{{ fmtAmt(t.amount, t.currency) }}{{ CUR_LABELS[t.currency] }}</span>
            <button class="trade-del" @click.stop="removeTrade(t.id)"><AppIcon name="close" :size="12" /></button>
          </div>
          <div v-if="t.notes" class="trade-note">{{ t.notes }}</div>
        </div>
        <div v-if="sellTrades.length === 0" class="col-empty">暂无</div>
      </div>
    </div>
    <div v-else class="empty-state">
      <AppIcon name="document" :size="40" />
      <p>暂无交易记录</p>
    </div>

    <!-- 新增/编辑弹窗 -->
    <AppDialog v-model="showDialog" :title="editingId ? '编辑交易' : '新增交易'" width="420px">
      <div class="form-body">
        <div class="form-row">
          <span class="form-label">类型</span>
          <div class="chip-group">
            <button class="chip" :class="{ active: form.type === 'buy' }" @click="form.type = 'buy'">买入</button>
            <button class="chip" :class="{ active: form.type === 'sell' }" @click="form.type = 'sell'">卖出</button>
          </div>
        </div>
        <div class="form-row">
          <span class="form-label">来源</span>
          <div class="chip-group">
            <button v-for="s in Object.keys(SOURCE_CONFIG)" :key="s" class="chip" :class="{ active: form.source === s }" @click="onSourceChange(s)">{{ s }}</button>
          </div>
        </div>
        <div class="form-row" v-if="availableCurrencies.length > 1">
          <span class="form-label">币种</span>
          <div class="chip-group">
            <button v-for="c in availableCurrencies" :key="c" class="chip" :class="{ active: form.currency === c }" @click="form.currency = c">{{ c === 'rmb' ? '人民币' : '梦幻币' }}</button>
          </div>
        </div>
        <div class="form-row">
          <span class="form-label">详情</span>
          <div class="form-inputs">
            <input v-model="form.itemName" type="text" class="form-input" placeholder="物品名称" maxlength="20" />
            <input v-model.number="form.amount" type="number" min="0" step="1" class="form-input form-input-short" :placeholder="form.currency === 'rmb' ? '金额(元)' : '金额(W)'" @keyup.enter="handleAdd" />
          </div>
        </div>
        <!-- 备注 -->
        <div class="form-row">
          <span class="form-label">备注</span>
          <input v-model="form.notes" type="text" class="form-input" placeholder="选填，如服务器/买家昵称" maxlength="50" />
        </div>
      </div>
      <template #footer>
        <button class="btn-cancel" @click="showDialog = false">取消</button>
        <button class="btn-confirm" @click="handleAdd">确定</button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import AppDialog from '../components/AppDialog.vue'
import { useTradeData } from '../composables/useTradeData.js'
import { toast } from '../utils/toast.js'

const { tradeData, stats, allData, SOURCE_CONFIG, CUR_LABELS, addTrade, removeTrade, updateTrade, exportCSV } = useTradeData()

const fmtW = (v) => `${(v / 10000).toFixed(1)}W`
const fmtAmt = (v, cur) => cur === 'rmb' ? v.toLocaleString() : (v / 10000).toFixed(1)

const showDialog = ref(false)
const editingId = ref(null)
const sourceFilter = ref('全部')
const dateFilter = ref('today')

const dateOptions = [
  { label: '今天', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '全部', value: 'all' },
]
const sourceOptions = ['全部', ...Object.keys(SOURCE_CONFIG)]

// 日期筛选
const weekStart = new Date()
weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1)
weekStart.setHours(0, 0, 0, 0)
const monthStart = new Date()
monthStart.setDate(1)
monthStart.setHours(0, 0, 0, 0)

const filteredTrades = computed(() => {
  let list = dateFilter.value === 'all' ? allData.value.flatMap(a => a.trades || []) : tradeData.value.trades
  if (dateFilter.value === 'week') {
    const all = allData.value.flatMap(a => a.trades || [])
    list = all.filter(t => new Date(t.iso) >= weekStart)
  } else if (dateFilter.value === 'month') {
    const all = allData.value.flatMap(a => a.trades || [])
    list = all.filter(t => new Date(t.iso) >= monthStart)
  }
  if (sourceFilter.value !== '全部') list = list.filter(t => t.source === sourceFilter.value)
  return list.sort((a, b) => (b.iso || '').localeCompare(a.iso || ''))
})

const buyTrades = computed(() => filteredTrades.value.filter(t => t.type === 'buy'))
const sellTrades = computed(() => filteredTrades.value.filter(t => t.type === 'sell'))

const form = reactive({
  type: 'buy', source: '藏宝阁', currency: 'rmb',
  itemName: '', amount: null, notes: '',
})

const availableCurrencies = computed(() => SOURCE_CONFIG[form.source]?.currencies || ['mhb'])

const onSourceChange = (s) => {
  form.source = s
  form.currency = SOURCE_CONFIG[s].currencies[0]
}

const resetForm = () => {
  editingId.value = null; form.type = 'buy'; form.source = '藏宝阁'
  form.currency = 'rmb'; form.itemName = ''; form.amount = null; form.notes = ''
}

const openAdd = () => { resetForm(); showDialog.value = true }

const openEdit = (t) => {
  editingId.value = t.id
  form.type = t.type; form.source = t.source; form.currency = t.currency
  form.itemName = t.itemName
  form.amount = t.currency === 'mhb' ? (t.amount / 10000) : t.amount
  form.notes = t.notes || ''
  showDialog.value = true
}

const handleAdd = () => {
  if (!form.itemName.trim()) return toast.warning('请输入物品名称')
  if (!form.amount || form.amount <= 0) return toast.warning('请输入有效金额')
  const rawAmount = form.currency === 'mhb' ? form.amount * 10000 : form.amount
  const data = {
    type: form.type, source: form.source, currency: form.currency,
    itemName: form.itemName.trim(), amount: rawAmount,
    notes: form.notes.trim() || null,
  }
  if (editingId.value) { updateTrade(editingId.value, data); toast.success('已更新') }
  else { addTrade(data); toast.success('已添加') }
  showDialog.value = false
}

const doExport = () => {
  if (filteredTrades.value.length === 0) return toast.warning('没有可导出的记录')
  const csv = exportCSV(filteredTrades.value)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `交易记录_${new Date().toLocaleDateString()}.csv`
  a.click(); URL.revokeObjectURL(url)
  toast.success('已导出')
}
</script>

<style lang="less" scoped>
@import '../styles/variables.less';
@import '../styles/mixins.less';

.trade-record { display: flex; flex-direction: column; gap: @spacing-2xl; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: @spacing-lg; }
.header-info { display: flex; align-items: baseline; gap: @spacing-md; min-width: 0; }
.page-title { .serif-title(); font-size: 2rem; margin: 0; flex-shrink: 0; }
.page-subtitle { .copy-text(); margin: 0; white-space: nowrap; }

.stats-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: @spacing-md; }
.stat-card { display: flex; align-items: center; gap: @spacing-lg; padding: @spacing-xl; .paper-card-primary(); }
.stat-body { min-width: 0; }
.stat-value { .serif-title(); font-size: 1.5rem; line-height: 1.2; margin-bottom: 2px; &.negative { color: @color-danger; } }
.stat-label { font-size: 0.6875rem; color: @text-muted; font-weight: 500; }

.toolbar { display: flex; justify-content: space-between; align-items: center; gap: @spacing-md; }
.filter-group { display: flex; align-items: center; gap: @spacing-xs; }
.filter-sep { color: @color-border; font-size: 0.75rem; margin: 0 2px; }
.toolbar-actions { display: flex; gap: @spacing-sm; flex-shrink: 0; }
.chip {
  padding: 4px 14px; border: 1px solid @color-border;
  background: @bg-paper; font-size: 0.75rem; color: @text-muted;
  cursor: pointer; font-family: inherit; transition: all @transition-fast ease;
  &:hover { border-color: @color-primary; color: @color-primary; }
  &.active { background: @color-primary; border-color: @color-primary; color: @color-primary-foreground; }
}
.btn-outline {
  padding: 6px 16px; border: 1px solid @color-border; background: @bg-paper;
  font-size: 0.8125rem; color: @text-primary; cursor: pointer; font-family: inherit;
  transition: all @transition-fast ease;
  &:hover { border-color: @color-primary; color: @color-primary; }
}
.btn-add {
  padding: 6px 20px; border: 1px solid @color-primary;
  background: @color-primary; color: @color-primary-foreground;
  font-size: 0.8125rem; font-weight: 500; cursor: pointer; font-family: inherit;
  transition: all @transition-fast ease; flex-shrink: 0;
  &:hover { background: @color-primary-hover; }
}

.trade-columns { display: grid; grid-template-columns: 1fr 1fr; gap: @spacing-2xl; }
.trade-col { .paper-card(); overflow: hidden; }
.col-title { .serif-title(); font-size: 1.125rem; margin: 0; padding: @spacing-md @spacing-xl; border-bottom: 1px solid @color-border; }
.col-empty { padding: @spacing-2xl; text-align: center; font-size: 0.8125rem; color: @text-muted; }
.empty-state { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; color: @text-muted; gap: @spacing-md; font-size: 0.875rem; }
.trade-item {
  padding: @spacing-md @spacing-xl; border-bottom: 1px solid @color-border;
  cursor: pointer; transition: background @transition-fast ease;
  &:last-child { border-bottom: none; }
  &:hover { background: @color-muted; }
}
.trade-top { display: flex; align-items: center; gap: @spacing-md; margin-bottom: 4px; }
.trade-bottom { display: flex; align-items: center; justify-content: space-between; }
.trade-source-tag { font-size: 0.75rem; color: @text-muted; flex-shrink: 0; }
.trade-name { font-size: 0.875rem; color: @text-primary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.trade-date { font-size: 0.6875rem; color: @text-muted; }
.trade-amount { font-size: 0.875rem; font-weight: 500; &.buy { color: @color-danger; } &.sell { color: @color-success; } }
.trade-note { font-size: 0.6875rem; color: @text-muted; margin-top: 2px; padding-left: 0; font-style: italic; }
.trade-del {
  display: flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border: none; background: transparent;
  color: @text-muted; cursor: pointer;
  &:hover { color: @color-danger; }
}

.form-body { display: flex; flex-direction: column; gap: @spacing-lg; }
.form-row { display: flex; align-items: center; gap: @spacing-md; }
.form-label { font-size: 0.8125rem; font-weight: 500; color: @text-primary; width: 48px; flex-shrink: 0; }
.chip-group { display: flex; gap: @spacing-xs; }
.form-inputs { display: flex; gap: @spacing-sm; flex: 1; }
.form-input {
  padding: 6px 10px; border: 1px solid @color-input;
  background: @bg-paper; font-size: 0.8125rem; color: @text-primary;
  outline: none; flex: 1; min-width: 0;
  &:focus { border-color: @color-primary; }
}
.form-input-short { flex: 0 0 110px; }

.btn-cancel, .btn-confirm { padding: 6px 20px; font-size: 0.8125rem; font-weight: 500; cursor: pointer; font-family: inherit; transition: all @transition-fast ease; }
.btn-cancel { border: 1px solid @color-border; background: @bg-paper; color: @text-primary; &:hover { border-color: @color-primary; color: @color-primary; } }
.btn-confirm { border: 1px solid @color-primary; background: @color-primary; color: @color-primary-foreground; &:hover { background: @color-primary-hover; } }

@media (max-width: 1100px) { .stats-row { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px) { .trade-columns { grid-template-columns: 1fr; } }
</style>
