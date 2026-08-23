/**
 * dsh-worldbook 浏览器半（client 插件）。
 *
 * 注册路径：
 * - 常驻：注册到 `shell.overlay`（空组件），children 声明自定义槽
 *   （mindlink.worldbook.nav / .settings-card / worldbook.host.present）。
 * - `settings.section`：插件独立存在时，世界书管理页出现在 dsh 设置侧边栏；
 *   检测到宿主在线（worldbook.host.present 有注册）则注销，避免与宿主 UI 重复。
 * - `mindlink.worldbook.nav` / `.settings-card`：宿主集成时渲染世界书管理页/设置卡片。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createElement as h } from 'react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import './slots.ts'
import { WorldbooksPage } from './worldbook-page.tsx'
import { WorldbookSettingsDialog } from './worldbook-settings.tsx'
import { api } from './api'
import { ConfirmHost } from './wb-confirm.tsx'
import type { WorkspacesService, SessionsService } from './worldbook-settings.tsx'
import { readThemeCache, writeThemeCache, type WorldbookTheme } from './wb-theme.ts'
import themeCss from './theme.css'

export const name = 'dsh-worldbook-client'
export const inject = ['slots', 'workspaces', 'sessions', 'locale']

// 本插件 UI 文案命名空间：注册后 ctx.locale.bind 返回按当前语言读取的翻译函数。
const LOCALE_NS = 'dsh.worldbook'

// 注入主题样式（text loader 内联，避免 dsh 不加载独立 .css 文件）
function ensureThemeStyle() {
  if (typeof document === 'undefined' || document.getElementById('dsh-worldbook-theme')) return
  const style = document.createElement('style')
  style.id = 'dsh-worldbook-theme'
  style.textContent = themeCss
  document.head.appendChild(style)
}

interface SlotsService {
  register(options: { name: string; id?: string; order?: number; label?: string; priority?: number; children?: Record<string, unknown> }, component: unknown): () => void
  entriesOfSlot?(key: string): unknown[]
  subscribe?(key: string, fn: () => void): () => void
}

interface FloatingSettings {
  devMode?: boolean
  devFloating?: boolean
}

const FLOATING_POSITION_KEY = 'dsh-worldbook-dev-floating-position'

function readFloatingPosition(): { leftPct: number; topPct: number } {
  try {
    const parsed = JSON.parse(localStorage.getItem(FLOATING_POSITION_KEY) ?? 'null') as { leftPct?: number; topPct?: number } | null
    if (parsed && typeof parsed.leftPct === 'number' && typeof parsed.topPct === 'number') {
      return { leftPct: Math.min(100, Math.max(0, parsed.leftPct)), topPct: Math.min(100, Math.max(0, parsed.topPct)) }
    }
  } catch { /* 本地存储不可用时使用默认位置 */ }
  return { leftPct: 92, topPct: 76 }
}

function WorldbookDevFloating({ workspaces, sessions }: { workspaces?: WorkspacesService; sessions?: SessionsService }) {
  const [settings, setSettings] = useState<FloatingSettings | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(readFloatingPosition)
  const windowOffset = useRef({ x: 0, y: 0 })
  const dragged = useRef(false)

  useEffect(() => {
    let alive = true
    const load = () => api<FloatingSettings>('/settings').then((value) => { if (alive) setSettings(value) }).catch(() => {})
    load()
    window.addEventListener('dsh-worldbook-data-changed', load)
    return () => { alive = false; window.removeEventListener('dsh-worldbook-data-changed', load) }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(FLOATING_POSITION_KEY, JSON.stringify(position)) } catch { /* 本地存储不可用时忽略 */ }
  }, [position])

  if (!settings?.devMode || !settings.devFloating) return null

  function onPointerDown(e: { button: number; clientX: number; clientY: number; currentTarget: HTMLButtonElement; pointerId: number; preventDefault: () => void }) {
    if (e.button !== 0) return
    e.preventDefault()
    const button = e.currentTarget
    const startX = e.clientX
    const startY = e.clientY
    const startPosition = position
    let moved = false
    button.setPointerCapture(e.pointerId)
    const move = (event: PointerEvent) => {
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (!moved && Math.hypot(dx, dy) > 5) moved = true
      if (moved) {
        setPosition({
          leftPct: Math.min(100, Math.max(0, startPosition.leftPct + dx / window.innerWidth * 100)),
          topPct: Math.min(100, Math.max(0, startPosition.topPct + dy / window.innerHeight * 100)),
        })
      }
    }
    const end = () => {
      button.removeEventListener('pointermove', move)
      button.removeEventListener('pointerup', end)
      button.removeEventListener('pointercancel', end)
      try { button.releasePointerCapture(e.pointerId) } catch { /* 指针已释放 */ }
      dragged.current = moved
      window.setTimeout(() => { dragged.current = false }, 0)
    }
    button.addEventListener('pointermove', move)
    button.addEventListener('pointerup', end)
    button.addEventListener('pointercancel', end)
  }

  function onWindowPointerDown(e: { button: number; clientX: number; clientY: number; currentTarget: HTMLDivElement; pointerId: number; preventDefault: () => void }) {
    if (e.button !== 0) return
    e.preventDefault()
    const header = e.currentTarget
    let windowEl = header.parentElement
    while (windowEl && !windowEl.classList.contains('wb-dev-floating-window')) windowEl = windowEl.parentElement
    if (!windowEl) return
    const rect = windowEl.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const centeredLeft = (window.innerWidth - rect.width) / 2
    const centeredTop = (window.innerHeight - rect.height) / 2
    const startOffset = {
      x: rect.left - centeredLeft,
      y: rect.top - centeredTop,
    }
    let moved = false
    let finalOffset = startOffset
    header.setPointerCapture(e.pointerId)
    windowEl.style.willChange = 'transform'
    const move = (event: PointerEvent) => {
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      if (!moved && Math.hypot(dx, dy) > 4) moved = true
      if (moved) {
        const nextLeft = centeredLeft + startOffset.x + dx
        const nextTop = centeredTop + startOffset.y + dy
        const left = Math.min(Math.max(0, nextLeft), Math.max(0, window.innerWidth - rect.width))
        const top = Math.min(Math.max(0, nextTop), Math.max(0, window.innerHeight - rect.height))
        finalOffset = { x: left - centeredLeft, y: top - centeredTop }
        windowEl.style.transform = `translate3d(calc(-50% + ${finalOffset.x}px), calc(-50% + ${finalOffset.y}px), 0)`
      }
    }
    const end = () => {
      header.removeEventListener('pointermove', move)
      header.removeEventListener('pointerup', end)
      header.removeEventListener('pointercancel', end)
      try { header.releasePointerCapture(e.pointerId) } catch { /* 指针已释放 */ }
      if (moved) {
        windowOffset.current = finalOffset
      }
      windowEl.style.willChange = 'auto'
    }
    header.addEventListener('pointermove', move)
    header.addEventListener('pointerup', end)
    header.addEventListener('pointercancel', end)
  }

  return h('div', { className: 'wb-dev-floating-root' },
    h('button', {
      className: 'wb-dev-floating-button',
      title: '打开世界书开发窗口',
      'aria-label': '打开世界书开发窗口',
      style: { left: `${position.leftPct}%`, top: `${position.topPct}%` },
      onPointerDown,
      onClick: () => { if (!dragged.current) setOpen(true) },
    }, h('span', { className: 'wb-dev-floating-glyph' }, '✦'), h('span', { className: 'wb-dev-floating-label' }, '世界书')),
    open ? h('div', { className: 'wb-dev-floating-backdrop', onClick: () => setOpen(false) },
        h('div', { className: 'wb-dev-floating-window', role: 'dialog', 'aria-label': '开发模式设置', style: { transform: `translate3d(calc(-50% + ${windowOffset.current.x}px), calc(-50% + ${windowOffset.current.y}px), 0)` }, onClick: (e: { stopPropagation: () => void }) => e.stopPropagation() },
        h('button', { className: 'wb-btn wb-dev-floating-close', onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(), onClick: () => setOpen(false), title: '关闭' }, '×'),
        h('div', { className: 'wb-dev-floating-window-body' }, h(WorldbookSettingsDialog, { workspaces, variant: 'developer', developerOnly: true, hideDevToggles: true, onDeveloperPointerDown: (event: unknown) => onWindowPointerDown(event as Parameters<typeof onWindowPointerDown>[0]) })),
      ),
    ) : null,
  )
}

function WithRoot({ children, sessions, workspaces }: { children?: ReactNode; sessions?: SessionsService; workspaces?: WorkspacesService }) {
  const [theme, setTheme] = useState<WorldbookTheme>(() => readThemeCache())
  useEffect(() => {
    let alive = true
    const load = () => {
      fetch('/api/worldbook/settings').then((r) => r.json()).then((j) => {
        if (!alive || !j?.success) return
        const t: WorldbookTheme = String(j.data?.theme ?? 'dsh') === 'pink' ? 'pink' : 'dsh'
        writeThemeCache(t)
        setTheme(t)
      }).catch(() => {})
    }
    load()
    const handler = () => load()
    window.addEventListener('dsh-worldbook-data-changed', handler)
    return () => { alive = false; window.removeEventListener('dsh-worldbook-data-changed', handler) }
  }, [])
  return h('div', { className: 'dsh-worldbook-root' + (theme === 'dsh' ? ' dsh-theme' : ''), style: { width: '100%', height: '100%' } },
    h('div', { style: { position: 'relative', width: '100%', height: '100%' } },
      children,
      h(ConfirmHost),
    ),
  )
}

// 空组件：用于常驻声明槽（shell.overlay 不渲染内容）
function NullComponent() {
  return null
}

const NAV_SLOT = 'mindlink.worldbook.nav'
const SETTINGS_CARD_SLOT = 'mindlink.worldbook.settings-card'
const HOST_SLOT = 'worldbook.host.present'
const SECTION_SLOT = 'settings.section'

export function apply(ctx: ClientContext) {
  ensureThemeStyle()

  const slots = ctx.slots
  if (!slots) return

  const workspaces = ctx.workspaces as unknown as WorkspacesService | undefined
  const sessions = ctx.sessions as unknown as SessionsService | undefined

  // 独立挂载到 DSH 主页面 body，不跟随世界书管理页 slot 一起出现或消失。
  // 参考 MindLink 的 FAB 挂载方式：页面级悬浮入口必须脱离具体业务页面容器。
  ctx.effect(() => {
    const host = document.createElement('div')
    host.setAttribute('data-dsh-worldbook-floating', '')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(h(WithRoot, { workspaces, sessions }, h(WorldbookDevFloating, { workspaces, sessions })))
    return () => {
      root.unmount()
      host.remove()
    }
  }, 'dsh-worldbook: dev floating')

  // 注册本插件 UI 文案词典（中英），供 label 等随语言切换动态读取。
  ctx.effect(
    () => ctx.locale.register(LOCALE_NS, {
      zh: { 'settings.section.title': '世界书' },
      en: { 'settings.section.title': 'World Book' },
    }),
    'dsh-worldbook: locale',
  )

  // 设置侧边栏分区标题：优先读 locale（随语言切换更新），缺失时回退硬编码中文。
  const sectionTitle = () => ctx.locale.bind(LOCALE_NS)('settings.section.title')

  // 常驻声明：在 shell.overlay（list/root，additive）注册空条目，children 声明自定义槽。
  // 该注册永不注销，保证 nav/settings-card/host.present 的声明不随 settings.section 注销而塌缩。
  // 用 inject 包裹：等待 shell.overlay 声明建立后再注册，声明折叠时级联清理。
  slots.inject(
    'shell.overlay',
    () => slots.register(
      {
        name: 'shell.overlay',
        id: 'dsh-worldbook-decl',
        priority: 10,
        children: {
          [NAV_SLOT]: { kind: 'single', scope: 'root' },
          [SETTINGS_CARD_SLOT]: { kind: 'single', scope: 'root' },
          [HOST_SLOT]: { kind: 'single', scope: 'root' },
        },
      },
      NullComponent,
    ),
  )

  // 共存形态：宿主悬浮窗「世界书」导航位 / 宿主设置页内嵌卡片（同一管理页，宿主自选挂载位置）。
  slots.inject(
    NAV_SLOT,
    () => slots.register(
      { name: NAV_SLOT, priority: 0 },
      () => h(WithRoot, { workspaces, sessions }, h(WorldbooksPage, { workspaces, sessions })),
    ),
  )

  // 共存形态：宿主设置页「世界书」设置卡片（就地改，不弹窗）。
  slots.inject(
    SETTINGS_CARD_SLOT,
    () => slots.register(
      { name: SETTINGS_CARD_SLOT, priority: 0 },
      () => h(WithRoot, { workspaces, sessions }, h(WorldbookSettingsDialog, { workspaces, variant: 'card' })),
    ),
  )

  // 独立形态：dsh 设置侧边栏「世界书」分区。宿主在线时注销（避免重复）。
  // 订阅 worldbook.host.present：宿主注册后移除分区；宿主消失（dsh 插件级停用）则恢复。
  let sectionDisposer: (() => void) | null = null

  function ensureSection() {
    if (sectionDisposer) return
    try {
      sectionDisposer = slots.register(
        { name: SECTION_SLOT, id: 'worldbook', order: 90, label: sectionTitle },
        () => h(WithRoot, { workspaces, sessions }, h(WorldbooksPage, { workspaces, sessions })),
      )
    } catch {
      sectionDisposer = null
    }
  }

  function removeSection() {
    if (sectionDisposer) {
      sectionDisposer()
      sectionDisposer = null
    }
  }

  function sync() {
    const hostEntries = slots.entriesOfSlot?.(HOST_SLOT) ?? []
    if (hostEntries.length > 0) removeSection()
    else ensureSection()
  }

  if (typeof slots.entriesOfSlot === 'function' && typeof slots.subscribe === 'function') {
    sync()
    const unsub = slots.subscribe(HOST_SLOT, sync)
    // 统一清理：解除订阅 + 注销动态分区（订阅分支与回退分支对称）。
    return () => { unsub(); removeSection() }
  } else {
    ensureSection()
    return () => { removeSection() }
  }
}
