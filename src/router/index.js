import { createRouter, createWebHistory } from 'vue-router'
import Layout from '../components/Layout.vue'

const OnlineRecord = () => import('../views/OnlineRecord.vue')
const RecordList = () => import('../views/RecordList.vue')
const PlaceholderPage = () => import('../components/PlaceholderPage.vue')

const DEFAULT_TITLE = '梦幻西游工具箱'

const routes = [
  {
    path: '/',
    component: Layout,
    redirect: '/online-record',
    children: [
      {
        path: 'online-record',
        name: 'OnlineRecord',
        component: OnlineRecord,
        meta: { title: '收益记录' }
      },
      {
        path: 'record-list',
        name: 'RecordList',
        component: RecordList,
        meta: { title: '历史记录' }
      },
      {
        path: 'trade-record',
        name: 'TradeRecord',
        component: PlaceholderPage,
        props: { title: '交易记录' },
        meta: { title: '交易记录' }
      },
      {
        path: 'character-record',
        name: 'CharacterRecord',
        component: PlaceholderPage,
        props: { title: '角色记录' },
        meta: { title: '角色记录' }
      },
      {
        path: 'growth-record',
        name: 'GrowthRecord',
        component: PlaceholderPage,
        props: { title: '养成记录' },
        meta: { title: '养成记录' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory('/xyq/'),
  routes,
})

router.afterEach((to) => {
  const title = to.meta?.title
  document.title = title ? `${title} - ${DEFAULT_TITLE}` : DEFAULT_TITLE
})

export default router
