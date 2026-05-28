import { ref, watch } from 'vue'
import { getStorage, setStorage } from '../utils/storage'
import { STORAGE_KEYS } from '../constants'

/**
 * 物品数据管理
 */
const DEFAULT_ITEMS = [
  // 装备
  { id: 1,  name: '60武器',   price: 0, image: '/images/online-record/60武器.png' },
  { id: 2,  name: '70武器',   price: 0, image: '/images/online-record/70武器.png' },
  { id: 3,  name: '80武器',   price: 0, image: '/images/online-record/80武器.png' },
  { id: 4,  name: '60装备',   price: 0, image: '/images/online-record/60防具.png' },
  { id: 5,  name: '70装备',   price: 0, image: '/images/online-record/70防具.png' },
  { id: 6,  name: '80装备',   price: 0, image: '/images/online-record/80防具.png' },
  // 五宝
  { id: 7,  name: '特赦令牌', price: 0, image: '/images/online-record/特赦令牌.png' },
  { id: 8,  name: '金刚石',   price: 0, image: '/images/online-record/金刚石.png' },
  { id: 9,  name: '定魂珠',   price: 0, image: '/images/online-record/定魂珠.png' },
  { id: 10, name: '夜明珠',   price: 0, image: '/images/online-record/夜明珠.png' },
  { id: 11, name: '龙鳞',     price: 0, image: '/images/online-record/龙鳞.png' },
  { id: 12, name: '避水珠',   price: 0, image: '/images/online-record/避水珠.png' },
  // 培养
  { id: 13, name: '金柳露',       price: 0, image: '/images/online-record/金柳露.png' },
  { id: 14, name: '超级金柳露',   price: 0, image: '/images/online-record/超级金柳露.png' },
  { id: 15, name: '净瓶玉露',     price: 0, image: '/images/online-record/净瓶玉露.png' },
  { id: 16, name: '超级净瓶玉露', price: 0, image: '/images/online-record/超级净瓶玉露.png' },
  { id: 36, name: '月华露',       price: 0, image: '/images/online-record/月华露.png' },
  { id: 20, name: '修炼果',       price: 0, image: '/images/online-record/修炼果.png' },
  // 宝石
  { id: 22, name: '黑宝石',   price: 0, image: '/images/online-record/黑宝石.png' },
  { id: 23, name: '红玛瑙',   price: 0, image: '/images/online-record/红玛瑙.png' },
  { id: 24, name: '太阳石',   price: 0, image: '/images/online-record/太阳石.png' },
  { id: 25, name: '月亮石',   price: 0, image: '/images/online-record/月亮石.png' },
  { id: 26, name: '舍利子',   price: 0, image: '/images/online-record/舍利子.png' },
  { id: 27, name: '光芒石',   price: 0, image: '/images/online-record/光芒石.png' },
  { id: 29, name: '星辉石',   price: 0, image: '/images/online-record/星辉石.png' },
  { id: 31, name: '精魄灵石', price: 0, image: '/images/online-record/精魄灵石.png' },
  { id: 30, name: '五色灵尘', price: 0, image: '/images/online-record/五色灵尘.gif' },
  // 材料
  { id: 17, name: '强化石',   price: 0, image: '/images/online-record/强化石.png' },
  { id: 34, name: '符石',     price: 0, image: '/images/online-record/符石.png' },
  { id: 35, name: '符石卷轴', price: 0, image: '/images/online-record/符石卷轴.png' },
  // 杂物
  { id: 19, name: '海马',       price: 0, image: '/images/online-record/海马.png' },
  { id: 18, name: '摇钱树苗',   price: 0, image: '/images/online-record/摇钱树树苗.png' },
  { id: 21, name: '彩果',       price: 0, image: '/images/online-record/彩果.png' },
  { id: 40, name: '种子',       price: 0, image: '/images/online-record/种子.png' },
  { id: 32, name: '乐器',       price: 0, image: '/images/online-record/乐器.png' },
  { id: 33, name: '玫瑰',       price: 0, image: '/images/online-record/玫瑰.png' },
  { id: 38, name: '金银锦盒',   price: 0, image: '/images/online-record/金银锦盒.png' },
  { id: 39, name: '法宝任务书', price: 0, image: '/images/online-record/法宝任务书.png' },
]

const UNSET_ITEMS = [
  // 金钱
  { id: 99,  name: '金币',  price: 0, image: '/images/online-record/金币.png' },
  // 兽决
  { id: 100, name: '兽决',     price: 0, image: '/images/online-record/兽决.png' },
  { id: 101, name: '高级兽决', price: 0, image: '/images/online-record/高级兽决.gif' },
  // 内丹
  { id: 102, name: '内丹',   price: 0, image: '/images/online-record/内丹.png' },
  { id: 103, name: '高内丹', price: 0, image: '/images/online-record/高内丹.png' },
  // 装备相关
  { id: 104, name: '珍珠',   price: 0, image: '/images/online-record/珍珠.png' },
  { id: 105, name: '附魔',   price: 0, image: '/images/online-record/附魔.png' },
  { id: 106, name: '书',     price: 0, image: '/images/online-record/书.png' },
  { id: 107, name: '铁',     price: 0, image: '/images/online-record/铁.png' },
  { id: 108, name: '晶石',   price: 0, image: '/images/online-record/晶石.png' },
  { id: 109, name: '灵饰书', price: 0, image: '/images/online-record/灵饰书.png' },
  { id: 110, name: '炼妖石', price: 0, image: '/images/online-record/炼妖石.png' },
  { id: 111, name: '图册',   price: 0, image: '/images/online-record/图册.png' },
  // 其他
  { id: 112, name: '金丹',     price: 0, image: '/images/online-record/金丹.png' },
  { id: 113, name: '如意丹',   price: 0, image: '/images/online-record/如意丹.png' },
  { id: 114, name: '卡',       price: 0, image: '/images/online-record/卡.png' },
  { id: 115, name: '钟灵石',   price: 0, image: '/images/online-record/钟灵石.gif' },
  { id: 116, name: '法宝',     price: 0, image: '/images/online-record/法宝.png' },
  { id: 117, name: '鬼谷子',   price: 0, image: '/images/online-record/鬼谷子.png' },
  { id: 118, name: '瓶子',     price: 0, image: '/images/online-record/瓶子.png' },
  { id: 200, name: '其他',     price: 0, image: '/images/online-record/其他.png' },
]

export function useItems() {
  const saved = getStorage(STORAGE_KEYS.ITEMS_DATA, DEFAULT_ITEMS)
  const itemsData = ref(Array.isArray(saved) ? saved : [...DEFAULT_ITEMS])
  const unsetItemsData = ref([...UNSET_ITEMS])
  const totalItemsData = ref([...itemsData.value, ...UNSET_ITEMS])

  const getItemById = (id) => {
    return totalItemsData.value.find(item => item.id === id)
  }

  watch(itemsData, (newVal) => {
    setStorage(STORAGE_KEYS.ITEMS_DATA, newVal)
    totalItemsData.value = [...newVal, ...UNSET_ITEMS]
  }, { deep: true })

  return {
    itemsData,
    unsetItemsData,
    totalItemsData,
    getItemById
  }
}
