import { createElement as h } from 'react'
import { useEffect, useState } from 'react'

type ConfirmOptions = { title?: string; message: string; danger?: boolean; confirmText?: string; cancelText?: string }

interface ConfirmState extends ConfirmOptions {
  mode: 'alert' | 'confirm'
  resolve: (ok: boolean) => void
}

let pending: ConfirmState | null = null
let listener: (() => void) | null = null

function notify() {
  listener?.()
}

export function showAlert(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options
  return new Promise<boolean>((resolve) => {
    pending = { mode: 'alert', ...opts, resolve }
    notify()
  })
}

export function showConfirm(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options
  return new Promise<boolean>((resolve) => {
    pending = { mode: 'confirm', ...opts, resolve }
    notify()
  })
}

function close(result: boolean) {
  if (pending) {
    pending.resolve(result)
    pending = null
    notify()
  }
}

// 全局确认/提示框（Promise 驱动，替换原生 confirm/alert）
export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(pending)

  useEffect(() => {
    listener = () => setState(pending ? { ...pending } : null)
    return () => {
      listener = null
    }
  }, [])

  if (!state) return null
  const isConfirm = state.mode === 'confirm'
  // 注意：这里不能加 .dsh-worldbook-root 类——该类的 CSS 规则会直接定义粉色默认
  // --ml-* 变量，覆盖外层 WithRoot 上 .dsh-theme 的 dsh 映射，导致确认框永远粉色。
  // 去掉根类后变量从父级继承，跟随 DSH / 粉色 都会正确生效。
  return h('div', {
    className: 'dsh-worldbook-confirm',
    style: { position: 'fixed', inset: 0, zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ml-mask)' },
  },
    h('div', {
      className: 'wb-card wb-confirm-card',
      style: { width: 360, maxWidth: '90vw', padding: '20px 22px' },
    },
      h('div', { className: 'wb-confirm-title' }, state.title ?? (isConfirm ? '确认操作' : '提示')),
      h('div', { className: 'wb-confirm-msg' }, state.message),
      h('div', { className: 'wb-actions', style: { justifyContent: 'flex-end', gap: 10, marginTop: 16 } },
        isConfirm
          ? h('button', { className: 'wb-btn', onClick: () => close(false) }, state.cancelText ?? '取消')
          : null,
        h('button',
          { className: 'wb-btn' + (state.danger ? ' danger' : ' primary'), style: state.danger ? undefined : { marginLeft: 4 }, onClick: () => close(true) },
          state.confirmText ?? (isConfirm ? '确定' : '好的'),
        ),
      ),
    ),
  )
}
