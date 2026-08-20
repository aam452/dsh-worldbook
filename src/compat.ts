import type { Agent } from '@deepseek-ai/dsh-agent'

// 重复注入检测：
// 以本插件(dsh-worldbook)注入消息为锚点，在会话事件流中向前/向后扫描「连续注入段」——
// 段由连续的插件注入消息（user/message 且 source.kind==='plugin'）组成；
// 一旦出现真实对话消息（source.kind==='user' 的用户输入，或任何 assistant 输出：正文/思考轮）即视为段边界，不再继续。
// 段内若其它插件注入文本与本插件注入文本相同/高度相似 → 判定重复注入。
// 不做跨轮比较、不按插件名判断类型，只检测「同一段连续注入里内容重复」这一事实。

export interface CompatConflict {
  /** 重复来源插件名 */
  plugin: string
  /** 重复文本样例（前 120 字） */
  sample: string
  count: number
}

export interface CompatReport {
  conflicts: CompatConflict[]
  /** 本次锚点注入是否重复 */
  duplicated: boolean
  /** 最近一次检测的时间戳（epoch ms） */
  checkedAt: number
}

let lastReport: CompatReport = { conflicts: [], duplicated: false, checkedAt: 0 }

// 归一化：去空白/换行后比较，避免格式差异导致的漏判
function normalize(s: string): string {
  return s.replace(/\s+/g, '').trim()
}

function isSameText(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na.length === 0 || nb.length === 0) return false
  // 精确相同，或一方完全包含另一方（同一份内容常见截断差异）
  return na === nb || na.includes(nb) || nb.includes(na)
}

// 从事件流提取一段消息文本
function eventText(data: { content?: unknown }): string {
  const content = data?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

interface EventLike {
  type: string
  data: { content?: unknown; source?: { kind?: string; plugin?: string } | null } | Record<string, unknown>
}

// 是否「真实对话消息」（注入段边界）：真实用户输入，或任何 assistant 输出（正文/思考轮）。
function isBoundary(e: EventLike): boolean {
  if (e.type === 'assistant/message' || e.type === 'assistant/chunk') return true
  if (e.type === 'user/message') {
    const kind = (e.data as { source?: { kind?: string } | null })?.source?.kind
    return kind !== 'plugin'
  }
  // 其它事件类型（step/start、request/header、session/title…）不是对话消息，不打断注入段
  return false
}

// 执行重复注入检测。agent 提供会话事件流（agent.session.events）。
export function scanWorldbookConflicts(agent: Agent): CompatReport {
  const events = agent.session.events as unknown as EventLike[]
  if (!Array.isArray(events)) {
    lastReport = { conflicts: [], duplicated: false, checkedAt: Date.now() }
    return lastReport
  }

  // 找到事件流中最后一个已存在的本插件注入消息作为锚点
  // （pre-step 时本次注入尚未 append 进事件流，检测的是最近一次已发生的注入）
  let anchorIndex = -1
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'user/message') {
      const src = (e.data as { source?: { plugin?: string } | null })?.source
      if (src?.plugin === 'dsh-worldbook') {
        anchorIndex = i
        break
      }
    }
  }
  if (anchorIndex < 0) {
    lastReport = { conflicts: [], duplicated: false, checkedAt: Date.now() }
    return lastReport
  }

  const anchorText = eventText(events[anchorIndex].data as { content?: unknown })

  const conflicts = new Map<string, { plugin: string; sample: string; count: number }>()
  let duplicated = false

  // 向前扫描：直到段边界
  for (let i = anchorIndex - 1; i >= 0; i--) {
    const e = events[i]
    if (isBoundary(e)) break
    if (e.type !== 'user/message') continue
    const src = (e.data as { source?: { kind?: string; plugin?: string } | null })?.source
    if (src?.kind !== 'plugin' || !src.plugin || src.plugin === 'dsh-worldbook') continue
    const text = eventText(e.data as { content?: unknown })
    if (isSameText(anchorText, text)) {
      duplicated = true
      const cur = conflicts.get(src.plugin)
      if (cur) cur.count++
      else conflicts.set(src.plugin, { plugin: src.plugin, sample: text.slice(0, 120), count: 1 })
    }
  }

  // 向后扫描：直到段边界
  for (let i = anchorIndex + 1; i < events.length; i++) {
    const e = events[i]
    if (isBoundary(e)) break
    if (e.type !== 'user/message') continue
    const src = (e.data as { source?: { kind?: string; plugin?: string } | null })?.source
    if (src?.kind !== 'plugin' || !src.plugin || src.plugin === 'dsh-worldbook') continue
    const text = eventText(e.data as { content?: unknown })
    if (isSameText(anchorText, text)) {
      duplicated = true
      const cur = conflicts.get(src.plugin)
      if (cur) cur.count++
      else conflicts.set(src.plugin, { plugin: src.plugin, sample: text.slice(0, 120), count: 1 })
    }
  }

  lastReport = { conflicts: [...conflicts.values()], duplicated, checkedAt: Date.now() }
  return lastReport
}

export function lastCompatReport(): CompatReport {
  return lastReport
}
