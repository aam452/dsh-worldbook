/**
 * dsh-worldbook 浏览器半（client 插件）。
 *
 * 注册路径：
 * - 常驻：注册到 `shell.overlay`（空组件），children 声明自定义槽
 *   （mindlink.worldbook.nav / .settings / worldbook.host.present）。
 * - `settings.section`：插件独立存在时，世界书管理页出现在 dsh 设置侧边栏；
 *   检测到宿主在线（worldbook.host.present 有注册）则注销，避免与宿主 UI 重复。
 * - `mindlink.worldbook.nav` / `.settings`：宿主集成时渲染世界书页面/卡片。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createElement as h } from 'react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import './slots.ts'
import { WorldbooksPage } from './worldbook-page.tsx'
import { WorldbookSettingsDialog } from './worldbook-settings.tsx'
import { ConfirmHost } from './wb-confirm.tsx'
import type { WorkspacesService } from './worldbook-settings.tsx'
import { readThemeCache, writeThemeCache, type WorldbookTheme } from './wb-theme.ts'
import themeCss from './theme.css'

export const name = 'dsh-worldbook-client'
export const inject = ['slots', 'workspaces']

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

// 统一包装：注入独立主题根容器，并按设置切换主题。
// theme: 'dsh'=跟随 dsh（默认，加 .dsh-theme 类映射 dsh 变量）；'pink'=独立粉色主题。
// 初始值从同步缓存读取（默认 dsh），避免首帧闪烁；服务端仍是权威，mount 后校正。
function WithRoot({ children }: { children: ReactNode }) {
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
const SETTINGS_SLOT = 'mindlink.worldbook.settings'
const SETTINGS_CARD_SLOT = 'mindlink.worldbook.settings-card'
const HOST_SLOT = 'worldbook.host.present'
const SECTION_SLOT = 'settings.section'

export function apply(ctx: ClientContext) {
  ensureThemeStyle()

  const slots = ctx.slots
  if (!slots) return

  const workspaces = ctx.workspaces as unknown as WorkspacesService | undefined

  // 常驻声明：在 shell.overlay（list/root，additive）注册空条目，children 声明自定义槽。
  // 该注册永不注销，保证 nav/settings/host.present 的声明不随 settings.section 注销而塌缩。
  slots.register(
    {
      name: 'shell.overlay',
      id: 'dsh-worldbook-decl',
      priority: 10,
      children: {
        [NAV_SLOT]: { kind: 'single', scope: 'root' },
        [SETTINGS_SLOT]: { kind: 'single', scope: 'root' },
        [SETTINGS_CARD_SLOT]: { kind: 'single', scope: 'root' },
        [HOST_SLOT]: { kind: 'single', scope: 'root' },
      },
    },
    NullComponent,
  )

  // 共存形态：宿主悬浮窗「世界书」导航位。
  slots.register(
    { name: NAV_SLOT, priority: 0 },
    () => h(WithRoot, null, h(WorldbooksPage, { workspaces })),
  )

  // 共存形态：宿主设置页内嵌的「世界书设置」卡片（就地改，不弹窗）。
  slots.register(
    { name: SETTINGS_CARD_SLOT, priority: 0 },
    () => h(WithRoot, null, h(WorldbookSettingsDialog, { workspaces, variant: 'card' })),
  )

  // 共存形态：宿主设置页「世界书」卡片。
  slots.register(
    { name: SETTINGS_SLOT, priority: 0 },
    () => h(WithRoot, null, h(WorldbooksPage, { workspaces })),
  )

  // 独立形态：dsh 设置侧边栏「世界书」分区。宿主在线时注销（避免重复）。
  // 订阅 worldbook.host.present：宿主注册后移除分区；宿主消失（dsh 插件级停用）则恢复。
  let sectionDisposer: (() => void) | null = null

  function ensureSection() {
    if (sectionDisposer) return
    try {
      sectionDisposer = slots.register(
        { name: SECTION_SLOT, id: 'worldbook', order: 90, label: () => '世界书' },
        () => h(WithRoot, null, h(WorldbooksPage, { workspaces })),
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
    // 声明周期订阅：host.present 槽声明塌缩时重新评估
    return () => { unsub() }
  } else {
    ensureSection()
  }
}
