import { ref, computed } from 'vue'
import { getStorage, setStorage } from '../utils/storage'

const STORAGE_KEY = 'mh-trade-data'
const ALL_KEY = 'mh-trade-all'

const SOURCE_CONFIG = {
  '藏宝阁': { currencies: ['rmb'] },
  '点卡':   { currencies: ['rmb', 'mhb'] },
  '游戏内': { currencies: ['mhb'] },
  '其他':   { currencies: ['rmb', 'mhb'] },
}

const CUR_LABELS = { rmb: '¥', mhb: 'W' }

function now() {
  const d = new Date()
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    iso: d.toISOString(),
  }
}

// 导出 CSV
function exportCSV(trades) {
  const header = '日期,时间,类型,来源,币种,物品,金额,备注'
  const rows = trades.map(t => {
    const amt = t.currency === 'mhb' ? (t.amount / 10000).toFixed(1) + 'W' : '¥' + t.amount
    return [t.date, t.time, t.type === 'buy' ? '买入' : '卖出', t.source, t.currency === 'rmb' ? '人民币' : '梦幻币', t.itemName, amt, t.notes || ''].join(',')
  })
  return '\uFEFF' + header + '\n' + rows.join('\n')
}

export function useTradeData() {
  const saved = getStorage(STORAGE_KEY)
  const today = now().date

  const tradeData = ref(
    saved && saved.date === today ? saved : { date: today, trades: [] }
  )

  const recalc = () => {
    let buyRmb = 0, sellRmb = 0, buyMhb = 0, sellMhb = 0
    tradeData.value.trades.forEach(t => {
      const amt = t.amount || 0
      if (t.currency === 'rmb') {
        if (t.type === 'buy') buyRmb += amt; else sellRmb += amt
      } else {
        if (t.type === 'buy') buyMhb += amt; else sellMhb += amt
      }
    })
    return { buyRmb, sellRmb, buyMhb, sellMhb, count: tradeData.value.trades.length }
  }

  const stats = ref(recalc())

  const addTrade = (trade) => {
    const ts = now()
    tradeData.value.trades.unshift({
      ...trade, id: Date.now(), date: ts.date, time: ts.time, iso: ts.iso,
    })
    stats.value = recalc()
    saveAll()
  }

  const removeTrade = (id) => {
    tradeData.value.trades = tradeData.value.trades.filter(t => t.id !== id)
    stats.value = recalc()
    saveAll()
  }

  const updateTrade = (id, data) => {
    const idx = tradeData.value.trades.findIndex(t => t.id === id)
    if (idx !== -1) {
      tradeData.value.trades[idx] = { ...tradeData.value.trades[idx], ...data }
      stats.value = recalc()
      saveAll()
    }
  }

  const saveAll = () => {
    setStorage(STORAGE_KEY, tradeData.value)
    // 同时追加到全部历史
    const all = getStorage(ALL_KEY, [])
    const idx = all.findIndex(a => a.date === tradeData.value.date)
    if (idx !== -1) all[idx] = tradeData.value
    else all.unshift(tradeData.value)
    setStorage(ALL_KEY, all)
  }

  // 全部历史记录（用于跨天查询）
  const allData = computed(() => getStorage(ALL_KEY, []))

  return { tradeData, stats, allData, SOURCE_CONFIG, CUR_LABELS, addTrade, removeTrade, updateTrade, exportCSV }
}
