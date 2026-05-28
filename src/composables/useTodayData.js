import { ref, watch } from 'vue'
import { getStorage, setStorage } from '../utils/storage'
import { STORAGE_KEYS } from '../constants'

let saveTimer = null

/**
 * 检查是否需要跨午夜重置
 */
function getTodayDate() {
  return new Date().toLocaleDateString()
}

function createTodayData() {
  return {
    date: getTodayDate(),
    onlineTime: 0,
    cardCost: 0,
    todaysIncome: 0,
    todaysBalance: 0,
    loadList: [],
    onlineList: [],
  }
}

/**
 * 当日数据管理
 */
export function useTodayData() {
  const saved = getStorage(STORAGE_KEYS.TODAYS_DATA)
  const today = getTodayDate()

  const todaysData = ref(
    saved && saved.date === today ? saved : createTodayData()
  )

  const saveToAllData = () => {
    // 去抖：合并 300ms 内的连续写入
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const allData = getStorage(STORAGE_KEYS.ALL_DATA, [])
      const index = allData.findIndex(item => item.date === todaysData.value.date)
      if (index !== -1) {
        allData[index] = todaysData.value
      } else {
        allData.unshift(todaysData.value)
      }
      setStorage(STORAGE_KEYS.ALL_DATA, allData)
    }, 300)
  }

  // 跨午夜检查：每次数据变更前校验日期
  const ensureDate = () => {
    const currentDate = getTodayDate()
    if (todaysData.value.date !== currentDate) {
      Object.assign(todaysData.value, createTodayData())
    }
  }

  watch(todaysData, () => {
    ensureDate()
    setStorage(STORAGE_KEYS.TODAYS_DATA, todaysData.value)
    saveToAllData()
  }, { deep: true })

  const addOnlineRecord = (record) => {
    ensureDate()
    todaysData.value.onlineList.unshift(record)
    todaysData.value.onlineTime += record.time
    todaysData.value.cardCost += record.cardCost
    todaysData.value.todaysBalance = todaysData.value.todaysIncome - todaysData.value.cardCost
  }

  const updateIncome = (income) => {
    ensureDate()
    todaysData.value.todaysIncome = income
    todaysData.value.todaysBalance = income - todaysData.value.cardCost
  }

  return { todaysData, addOnlineRecord, updateIncome }
}
