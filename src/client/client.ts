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
import './slots.ts'
import { WorldbooksPage } from './worldbook-page.tsx'
import themeCss from './theme.css'

export const name = 'dsh-worldbook-client'
export const inject = ['slots']

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

// 统一包装：注入独立主题根容器
function WithRoot({ children }: { children: ReactNode }) {
  return h('div', { className: 'dsh-worldbook-root', style: { width: '100%', height: '100%' } }, children)
}

// 空组件：用于常驻声明槽（shell.overlay 不渲染内容）
function NullComponent() {
  return null
}

const NAV_SLOT = 'mindlink.worldbook.nav'
const SETTINGS_SLOT = 'mindlink.worldbook.settings'
const HOST_SLOT = 'worldbook.host.present'
const SECTION_SLOT = 'settings.section'

export function apply(ctx: ClientContext) {
  ensureThemeStyle()

  const slots = ctx.slots
  if (!slots) return

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
        [HOST_SLOT]: { kind: 'single', scope: 'root' },
      },
    },
    NullComponent,
  )

  // 共存形态：宿主悬浮窗「世界书」导航位。
  slots.register(
    { name: NAV_SLOT, priority: 0 },
    () => h(WithRoot, null, h(WorldbooksPage)),
  )

  // 共存形态：宿主设置页「世界书」卡片。
  slots.register(
    { name: SETTINGS_SLOT, priority: 0 },
    () => h(WithRoot, null, h(WorldbooksPage)),
  )

  // 独立形态：dsh 设置侧边栏「世界书」分区。宿主在线时注销（避免重复）。
  // 订阅 worldbook.host.present：宿主注册后移除分区；宿主消失（dsh 插件级停用）则恢复。
  let sectionDisposer: (() => void) | null = null
  let subscribed = false

  function ensureSection() {
    if (sectionDisposer) return
    try {
      sectionDisposer = slots.register(
        { name: SECTION_SLOT, id: 'worldbook', order: 90, label: () => '世界书' },
        () => h(WithRoot, null, h(WorldbooksPage)),
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
    subscribed = true
    // 声明周期订阅：host.present 槽声明塌缩时重新评估
    return () => { unsub() }
  } else {
    ensureSection()
  }
}
