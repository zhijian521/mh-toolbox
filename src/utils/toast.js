/**
 * 轻量 toast 消息提示
 */
import { createApp, h, Transition, ref, nextTick } from 'vue'

const TOAST_DURATION = 2000

const SVG = {
  success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9f000f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e40af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
}

const COLORS = {
  success: '#2d6a4f',
  warning: '#b45309',
  error: '#9f000f',
  info: '#1e40af',
}

let toastContainer = null

function ensureContainer() {
  if (toastContainer) return toastContainer
  toastContainer = document.createElement('div')
  toastContainer.id = 'app-toast-container'
  toastContainer.style.cssText = 'position:fixed;top:48px;left:50%;transform:translateX(-50%);z-index:2000;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;'
  document.body.appendChild(toastContainer)
  return toastContainer
}

function show(type, message) {
  const c = ensureContainer()
  const borderColor = COLORS[type] || COLORS.info
  const svg = SVG[type] || SVG.info
  const visible = ref(true)
  const el = document.createElement('div')
  c.appendChild(el)

  const app = createApp({
    setup() {
      const content = h('div', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 20px',
          border: `1px solid ${borderColor}`,
          background: '#fbf9f9',
          fontSize: '13px',
          fontWeight: '500',
          color: '#1d1b20',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          pointerEvents: 'auto',
        },
      }, [
        h('span', { innerHTML: svg }),
        h('span', { textContent: message }),
      ])

      nextTick(() => {
        setTimeout(() => {
          visible.value = false
          setTimeout(() => {
            app.unmount()
            if (el.parentNode) el.parentNode.removeChild(el)
          }, 200)
        }, TOAST_DURATION)
      })

      return () => visible.value ? h(Transition, { name: 'toast' }, { default: () => content }) : null
    },
  })

  app.mount(el)
}

export const toast = {
  success: (m) => show('success', m),
  warning: (m) => show('warning', m),
  error: (m) => show('error', m),
  info: (m) => show('info', m),
}

export default toast
