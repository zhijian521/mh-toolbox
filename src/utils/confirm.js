/**
 * 轻量确认对话框，返回 Promise<boolean>
 */
import { createApp, h, ref } from 'vue'

const S = {
  overlayBg: 'rgba(0,0,0,0.15)',
  paper: '#fbf9f9',
  primary: '#9f000f',
  border: '#e7ddd1',
  muted: '#f6efe7',
  ink: '#1d1b20',
}

export function confirm(message, options = {}) {
  const {
    title = '确认',
    confirmText = '确定',
    cancelText = '取消',
  } = options

  return new Promise((resolve) => {
    const visible = ref(true)
    const el = document.createElement('div')
    document.body.appendChild(el)

    const close = (result) => {
      visible.value = false
      setTimeout(() => {
        app.unmount()
        if (el.parentNode) el.parentNode.removeChild(el)
        resolve(result)
      }, 200)
    }

    const app = createApp({
      setup() {
        return () => visible.value ? h('div', {
          style: {
            position: 'fixed', inset: 0, zIndex: 1500,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: S.overlayBg,
          },
          onClick: (e) => { if (e.target === e.currentTarget) close(false) },
        }, [
          h('div', {
            style: {
              width: '360px', border: `1px solid ${S.primary}`, background: S.paper,
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            },
          }, [
            h('div', {
              style: {
                padding: '16px 24px', borderBottom: `1px solid ${S.border}`,
                background: S.muted, fontSize: '16px', fontWeight: 600,
                fontFamily: 'var(--font-serif)', color: S.ink,
              },
            }, title),
            h('div', {
              style: { padding: '24px', fontSize: '14px', color: S.ink },
            }, message),
            h('div', {
              style: {
                display: 'flex', justifyContent: 'flex-end', gap: '12px',
                padding: '16px 24px', borderTop: `1px solid ${S.border}`,
              },
            }, [
              h('button', {
                onClick: () => close(false),
                style: {
                  padding: '6px 20px', border: `1px solid ${S.border}`,
                  background: S.paper, color: S.ink, fontSize: '13px',
                  fontWeight: 500, cursor: 'pointer',
                },
              }, cancelText),
              h('button', {
                onClick: () => close(true),
                style: {
                  padding: '6px 20px', border: `1px solid ${S.primary}`,
                  background: S.primary, color: '#fff', fontSize: '13px',
                  fontWeight: 500, cursor: 'pointer',
                },
              }, confirmText),
            ]),
          ]),
        ]) : null
      },
    })

    app.mount(el)
  })
}

export default confirm
