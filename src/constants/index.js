/**
 * 应用常量配置
 */

export const STORAGE_KEYS = {
  CURRENT_SET_DATA: 'mh-current-set-data',
  TODAYS_DATA: 'mh-todays-data',
  ALL_DATA: 'mh-all-data',
  ITEMS_DATA: 'mh-items-data',
}

export const DEFAULT_CONFIG = {
  ONLINE_ACCOUNTS: 5,
  CARD_PRICE: 15000,
  MIN_ACCOUNTS: 1,
  MAX_ACCOUNTS: 20,
  MIN_CARD_PRICE: 1000,
  CARD_PRICE_STEP: 1000,
}

// 点卡消耗计算系数（每小时6点）
export const CARD_COST_MULTIPLIER = 6

// 未设置价格物品的 ID 起始值
export const UNSET_ITEMS_START_ID = 99


