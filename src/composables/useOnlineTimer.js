import { ref } from 'vue'
import { toast } from '../utils/toast.js'

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = MS_PER_SECOND * 60
const MS_PER_HOUR = MS_PER_MINUTE * 60

// 模块级单例 — 跨路由保持
const isOnline = ref(false)
const startTime = ref(null)
const currentDuration = ref('00:00:00')
const isStarting = ref(false)
const isEnding = ref(false)
let timer = null
let autoSaveFn = null

function getDiffParts(st) {
  if (!st) return { h: 0, m: 0, s: 0 }
  const diff = Date.now() - st.getTime()
  return {
    h: Math.floor(diff / MS_PER_HOUR),
    m: Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE),
    s: Math.floor((diff % MS_PER_MINUTE) / MS_PER_SECOND),
  }
}

function calculateHours(st) {
  const { h, m, s } = getDiffParts(st)
  return h + m / 60 + s / 3600
}

function formatDuration(st) {
  const { h, m, s } = getDiffParts(st)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function tick() {
  if (!isOnline.value || !startTime.value) return
  currentDuration.value = formatDuration(startTime.value)
  // 每 10 秒自动保存
  if (autoSaveFn) autoSaveFn(calculateHours(startTime.value))
}

/**
 * 在线计时 — 单例，跨路由保持
 */
export function useOnlineTimer() {
  const start = () => {
    isStarting.value = true
    setTimeout(() => {
      isOnline.value = true
      startTime.value = new Date()
      tick()
      timer = setInterval(tick, 10000)
      toast.success('开始记录游戏时间')
      isStarting.value = false
    }, 500)
  }

  const stop = () => {
    isEnding.value = true
    setTimeout(() => {
      clearInterval(timer)
      timer = null
      isOnline.value = false
      toast.success('游戏时间记录已结束')
      isEnding.value = false
    }, 500)
  }

  const getOnlineTime = () => calculateHours(startTime.value)

  const setAutoSave = (fn) => { autoSaveFn = fn }

  // 组件卸载不停止计时；仅窗口关闭时用 beforeunload
  // beforeunload 在 OnlineRecord 的 onMounted 中注册

  return {
    isOnline, startTime, currentDuration,
    isStarting, isEnding,
    start, stop, getOnlineTime, setAutoSave, tick,
  }
}
