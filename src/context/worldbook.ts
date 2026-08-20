import * as worldbook from '../data/worldbook.js'
import { getDb } from '../db/index.js'
import type { WorldbookRow, WorldbookEntryView } from '../data/worldbook.js'

// 世界书命中注入渲染（对齐 SillyTavern World Info 算法）：
// - 三态状态：constant（常驻）/vectorized（向量，暂按常驻处理可测）/normal（按触发词）
// - normal：主键 keys 任一命中进入候选；selective 条目副键 keysecondary 按 selectiveLogic 限定
// - caseSensitive / matchWholeWords 为三态（null=用全局；本项目无全局设置时按关闭处理）
// - probability / useProbability 概率判定；sticky / cooldown / delay 消息计时
// - excludeRecursion / preventRecursion 递归控制（本项目单轮不做递归扫描，标记保留）
// - 无 token 预算：命中即注入（对齐 ST 原生行为，不做预算控制）
// 作用域不在此处理：由 inject.ts 的 agent/pre-step 外层 isActiveForSession 闸门统一管辖。

export interface InjectedWorldEntry {
  content: string
  position: number
  insertionOrder: number
  depth: number | null
  role: number | null
  reason: string
}

// ST world_info_position.atDepth（在聊天指定深度插入）。
export const AT_DEPTH_POSITION = 4
export const DEFAULT_AT_DEPTH = 4

function includesKey(text: string, key: string, caseSensitive: boolean, matchWholeWords: boolean): boolean {
  if (key.length === 0) return false
  const haystack = caseSensitive ? text : text.toLocaleLowerCase()
  const needle = caseSensitive ? key : key.toLocaleLowerCase()
  if (!matchWholeWords) return haystack.includes(needle)
  if (/\s/u.test(needle)) return haystack.includes(needle)
  let offset = haystack.indexOf(needle)
  while (offset >= 0) {
    const before = offset === 0 ? '' : haystack[offset - 1]!
    const after = offset + needle.length >= haystack.length ? '' : haystack[offset + needle.length]!
    if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after)) return true
    offset = haystack.indexOf(needle, offset + 1)
  }
  return false
}

function isRegexKey(key: string): boolean {
  return /^\/[\s\S]+\/[gimsuy]*$/u.test(key) || /[\\^$.*+?()[\]{}|]/u.test(key)
}

function keyHit(keys: string[], text: string, caseSensitive: boolean, matchWholeWords: boolean): boolean {
  for (const key of keys) {
    if (key.length === 0) continue
    // 正则形态的键按正则匹配；否则按子串/整词
    if (isRegexKey(key)) {
      let re: RegExp
      try {
        const m = /^\/([\s\S]+)\/([gimsuy]*)$/u.exec(key)
        re = m ? new RegExp(m[1], m[2]) : new RegExp(key)
      } catch {
        continue
      }
      if (re.test(text)) return true
    } else if (includesKey(text, key, caseSensitive, matchWholeWords)) {
      return true
    }
  }
  return false
}

function evaluateEntry(entry: WorldbookEntryView, text: string): { hit: boolean; reason: string } {
  if (!entry.enabled) return { hit: false, reason: 'disabled' }
  if (entry.content.trim().length === 0) return { hit: false, reason: 'empty' }
  if (entry.constant || entry.vectorized) return { hit: true, reason: entry.constant ? 'constant' : 'vectorized' }
  if (entry.keys.length === 0) return { hit: false, reason: 'no-keys' }

  const caseSensitive = entry.caseSensitive ?? false
  const matchWholeWords = entry.matchWholeWords ?? false
  const primary = keyHit(entry.keys, text, caseSensitive, matchWholeWords)
  if (!primary) return { hit: false, reason: 'primary-unmatched' }

  // selective：副键按 selectiveLogic 限定（ST 语义：0=AND ANY / 1=NOT ALL / 2=NOT ANY / 3=AND ALL）
  if (entry.selective && entry.keysecondary.length > 0) {
    const matches = entry.keysecondary.map((k) => includesKey(text, k, caseSensitive, matchWholeWords) || (isRegexKey(k) ? keyHit([k], text, caseSensitive, matchWholeWords) : false))
    const ok = entry.selectiveLogic === 1 ? matches.some((m) => !m)
      : entry.selectiveLogic === 2 ? matches.every((m) => !m)
        : entry.selectiveLogic === 3 ? matches.every(Boolean)
          : matches.some(Boolean)
    if (!ok) return { hit: false, reason: 'secondary-unmatched' }
  }
  return { hit: true, reason: 'keyword' }
}

// 单本世界书：递归扫描判定 + 输出候选。
// 对齐 ST world-info.js 扫描：第一轮按深度命中 → 命中 content 加入 recursion buffer → 递归轮次扫描文本 = 深度消息 + recursion buffer。
// excludeRecursion 条目在递归轮次跳过；preventRecursion 条目的 content 不加入 recursion buffer（但自身已激活）。
// sticky：激活后持续 sticky 条消息强制注入（跳过概率）；cooldown：命中时若在冷却区间则跳过。
// delay：cursor < delay 时强制注入。delayUntilRecursion：非递归轮次跳过，递归轮次按 delay 值激活。
function bookCandidates(
  book: WorldbookRow,
  rows: WorldbookEntryView[],
  messageLines: string[],
  opts: { cursor: number; depth: number },
): WorldbookEntryView[] {
  const { cursor, depth } = opts
  const timed = worldbook.getTimedEffects(book.id)
  const stickyActive = new Map<string, boolean>() // entryId -> 本轮 sticky 生效
  const cooldownActive = new Map<string, boolean>()
  for (const t of timed) {
    if (t.type === 'sticky' && cursor >= t.start && cursor < t.end) stickyActive.set(t.entryId, true)
    if (t.type === 'cooldown' && cursor >= t.start && cursor < t.end) cooldownActive.set(t.entryId, true)
  }
  // 清理已过期状态（本次调用结束游标之后）
  worldbook.pruneTimedEffects(book.id, cursor)

  const out: WorldbookEntryView[] = []
  const activated = new Set<string>() // 防同一轮重复激活
  const seenAll = new Set<string>()   // 全流程已激活（sticky/递归去重）

  // ST 排序：order 越大越靠前
  const sorted = [...rows].sort((a, b) => b.insertionOrder - a.insertionOrder)

  // 递归扫描循环
  let recursionText = ''
  const baseText = textForView(rows, messageLines, depth) // 深度截断后的基础扫描文本
  for (let loop = 0; loop < MAX_RECURSION; loop++) {
    const scanText = recursionText === '' ? baseText : baseText + '\n' + recursionText
    const isRecursion = recursionText !== ''
    const newlyActivated: WorldbookEntryView[] = []
    let newRecursionParts: string[] = []

    for (const view of sorted) {
      if (seenAll.has(view.id)) continue
      if (!view.enabled) continue
      if (view.content.trim().length === 0) continue

      // delay：cursor < delay 时强制注入（不做关键词判定）
      if (view.delay != null && view.delay > 0 && cursor < view.delay) {
        newlyActivated.push(view)
        seenAll.add(view.id)
        if (!view.preventRecursion) newRecursionParts.push(view.content)
        continue
      }

      // cooldown 抑制（sticky 优先）
      if (cooldownActive.get(view.id) && !stickyActive.get(view.id)) continue

      // delayUntilRecursion：非递归轮次跳过；递归轮次按 delay 层级激活（delay=true 视为 1，第 N 层递归 loop=N-1 激活）
      if (view.delayUntilRecursion && !isRecursion && !stickyActive.get(view.id)) continue
      const dur = view.delayUntilRecursion === true ? 1 : (typeof view.delayUntilRecursion === 'number' ? view.delayUntilRecursion : 0)
      if (view.delayUntilRecursion && isRecursion && dur > loop + 1 && !stickyActive.get(view.id)) continue

      // excludeRecursion：递归轮次跳过（非 sticky）
      if (isRecursion && view.excludeRecursion && !stickyActive.get(view.id)) continue

      // sticky 生效：无条件激活（跳过关键词与概率）
      if (stickyActive.get(view.id)) {
        newlyActivated.push(view)
        seenAll.add(view.id)
        if (!view.preventRecursion) newRecursionParts.push(view.content)
        continue
      }

      // 常驻无条件激活
      if (view.constant || view.vectorized) {
        newlyActivated.push(view)
        seenAll.add(view.id)
        if (!view.preventRecursion) newRecursionParts.push(view.content)
        continue
      }

      // 关键词判定
      if (view.keys.length === 0) continue
      const decision = evaluateEntry(view, scanText)
      if (!decision.hit) continue

      // 概率判定（sticky 期间不重roll）
      if (view.useProbability && view.probability < 100 && !stickyActive.get(view.id)) {
        if (Math.random() * 100 > view.probability) continue
      }

      newlyActivated.push(view)
      seenAll.add(view.id)
      activated.add(view.id)
      if (!view.preventRecursion) newRecursionParts.push(view.content)
    }

    if (newlyActivated.length > 0) {
      out.push(...newlyActivated)
      // 写入 timed effects：激活的 sticky/cooldown 条目
      for (const v of newlyActivated) {
        if (v.sticky != null && v.sticky > 0 && !stickyActive.get(v.id)) {
          worldbook.setTimedEffect(book.id, v.id, 'sticky', cursor, cursor + v.sticky)
        }
        if (v.cooldown != null && v.cooldown > 0 && !cooldownActive.get(v.id)) {
          worldbook.setTimedEffect(book.id, v.id, 'cooldown', cursor, cursor + v.cooldown)
        }
      }
    }

    // 递归：有新激活且未 preventRecursion 的 content → 继续下一轮
    if (newRecursionParts.length > 0) {
      recursionText = (recursionText === '' ? '' : recursionText + '\n') + newRecursionParts.join('\n')
      continue
    }
    break
  }

  return out
}

const MAX_RECURSION = 5

function textForView(rows: WorldbookEntryView[], messageLines: string[], depth: number): string {
  // 本项目全局默认深度 depth（ST scan_depth 语义：最近 N 条；0/负=全部）
  if (depth === null || depth === undefined || depth <= 0) return messageLines.join('\n')
  return messageLines.slice(-Math.max(1, Math.trunc(depth))).join('\n')
}

// 渲染注入：返回命中的条目（按 ST position→order 排序）。messageLines = 最近对话行；cursor = 模型可见消息数（sticky/cooldown/delay 时间游标）。
export function renderWorldbookInjection(messageLines: string[], opts: { depth?: number; cursor?: number } = {}): InjectedWorldEntry[] {
  const books = worldbook.listEnabled()
  if (books.length === 0) return []
  const defaultDepth = opts.depth ?? 2
  const cursor = opts.cursor ?? 0

  const db = getDb()
  const allRows = db
    .prepare('SELECT * FROM worldbook_entries WHERE is_deleted=0')
    .all() as unknown as worldbook.WorldbookEntryRow[]
  const byBook = new Map<string, WorldbookEntryView[]>()
  for (const row of allRows) {
    if (!byBook.has(row.worldbook_id)) byBook.set(row.worldbook_id, [])
    byBook.get(row.worldbook_id)!.push(worldbook.toEntryView(row))
  }

  const candidateViews: WorldbookEntryView[] = []
  for (const book of books) {
    candidateViews.push(...bookCandidates(book, byBook.get(book.id) ?? [], messageLines, { cursor, depth: defaultDepth }))
  }

  // Inclusion Group 互斥：同 group（非 groupOverride）只保留 order 最高者
  const deduped = dedupeGroups(candidateViews)

  // ST 排序：position 分组（before 0 在前，其余按其枚举顺序），组内 order 降序
  return [...deduped]
    .sort((a, b) => a.position - b.position || b.insertionOrder - a.insertionOrder)
    .map((v) => ({
      content: v.content,
      position: v.position,
      insertionOrder: v.insertionOrder,
      // 深度仅对 @D 位置有效；非 @D 位置深度无效（对齐 ST 注入逻辑）
      depth: v.position === AT_DEPTH_POSITION ? (v.depth ?? DEFAULT_AT_DEPTH) : null,
      role: v.position === AT_DEPTH_POSITION ? (v.role ?? 0) : null,
      reason: 'matched',
    }))
}

// Inclusion Group 互斥：同 group 且非 groupOverride 中，仅保留 order 最大的一个（返回扁平去重集合）。
function dedupeGroups(views: WorldbookEntryView[]): WorldbookEntryView[] {
  const self = new Set<string>() // 无 group 或 groupOverride → 全部保留
  const groups = new Map<string, WorldbookEntryView[]>()
  for (const v of views) {
    if (!v.group || v.groupOverride) {
      self.add(v.id)
      continue
    }
    for (const g of v.group.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!groups.has(g)) groups.set(g, [])
      groups.get(g)!.push(v)
    }
  }
  const out: WorldbookEntryView[] = []
  const seen = new Set<string>()
  // 先保留全部独立条目（无组/优先条目）
  for (const v of views) {
    if (self.has(v.id)) {
      seen.add(v.id)
      out.push(v)
    }
  }
  // 每个组只保留 order 最高的一个
  for (const [, list] of groups) {
    list.sort((a, b) => b.insertionOrder - a.insertionOrder)
    const winner = list[0]
    if (winner && !seen.has(winner.id)) {
      seen.add(winner.id)
      out.push(winner)
    }
  }
  return out
}

// 把模型可见消息数组转成「消息行」（每条消息一行/一段），供深度扫描与键匹配。
export function matchLinesFromMessages(messages: readonly { content?: unknown }[]): string[] {
  const lines: string[] = []
  for (const m of messages) {
    const text = contentToText(m?.content).trim()
    if (text) lines.push(text)
  }
  return lines
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === 'object' && typeof (c as { text?: unknown }).text === 'string' ? (c as { text: string }).text : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}
