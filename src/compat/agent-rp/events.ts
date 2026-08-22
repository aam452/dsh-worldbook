// agent-rp 会话事件格式解析（只读适配，不依赖 @deepseek-ai/dsh-session 类型）。
//
// 这是本模块唯一的「对方事件/状态格式」接触面：所有 agent-rp 私有格式的解析都隔离在这里，
// 其余文件（adapter / commands / character）只消费这里导出的结构化结果。
// 解析全部宽松容错：拿不到或字段不符就跳过，绝不因对方事件格式变化阻塞注入。
// 事件格式要点（对照 agent-rp 源码）：
//   - agent-rp/world-info-library-seed  data.meta = { format:0, result, raw }（raw=完整 ST 世界书 JSON）
//   - command/done success 文本前缀：agent-rp-world-info-v0:(覆盖态) / agent-rp-world-info-library-v0:(导入) /
//       agent-rp-tavern-helper-v0:(TavernHelperState) / agent-rp-character-library-v0:(角色库启动)
//   - agent-rp/character-card-seed  data.meta = { format:0, result, raw }（raw=角色卡 JSON）
//   - agent-rp/tavern-state  data = TavernHelperState
//   - tool/result success + tool/call(name=import_world_info / import_character_card) 配对

import { pickCharacterBook, parseStWorldJson } from '../../data/worldbook.js'

// ── 结构化事件（宽松窄化） ──

type EventLike = {
  type?: string
  seq?: number
  data?: unknown
  sourceEventSeqs?: number[]
}

function eventData(event: EventLike): Record<string, unknown> | undefined {
  return typeof event.data === 'object' && event.data !== null && !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : undefined
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// tool/result 的 message.content 是内容块数组（首块带 toolCallId/isError），
// 取首块；兼容个别形态下 content 直接是对象。
function resultContent(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const message = object(data?.message)
  if (!message) return undefined
  if (Array.isArray(message.content)) return object(message.content[0])
  return object(message.content)
}

// ── 世界书条目 → ST 条目对象 ──

// Tavern Helper 世界书条目（TavernWorldbookEntry 子集）→ ST 编辑器内部格式条目。
// 对齐 agent-rp world-info-configuration-core.ts importedScriptEntry 的语义映射。
export interface TavernWorldbookEntryLike {
  uid: number
  name?: string
  enabled: boolean
  strategy?: {
    type?: string
    keys?: string[]
    keys_secondary?: { logic?: string; keys?: string[] }
    scan_depth?: 'same_as_global' | number
  }
  position?: { type?: string; role?: string; depth?: number; order?: number }
  content: string
  probability?: number
  ignoreBudget?: boolean
}

export function tavernEntryToStEntry(entry: TavernWorldbookEntryLike): Record<string, unknown> {
  const strategy = object(entry.strategy)
  const secondary = object(strategy?.keys_secondary)
  const position = object(entry.position)
  const type = strategy?.type === 'selective' || strategy?.type === 'vectorized' ? strategy.type : 'constant'
  const logic = secondary?.logic === 'and_all' ? 3 : secondary?.logic === 'not_all' ? 1 : secondary?.logic === 'not_any' ? 2 : 0
  const positionType = str(position?.type) ?? 'at_depth'
  const before = positionType === 'before_character_definition'
    || positionType === 'before_example_messages' || positionType === 'before_author_note'
  const probability = num(entry.probability) ?? 100
  const keys = Array.isArray(strategy?.keys) ? strategy.keys.filter((x): x is string => typeof x === 'string') : []
  const secondaryKeys = Array.isArray(secondary?.keys) ? secondary.keys.filter((x): x is string => typeof x === 'string') : []
  const scanDepth = strategy?.scan_depth === 'same_as_global' || strategy?.scan_depth === undefined
    ? undefined : num(strategy.scan_depth)
  const out: Record<string, unknown> = {
    key: keys,
    keysecondary: secondaryKeys,
    content: str(entry.content) ?? '',
    comment: typeof entry.name === 'string' ? entry.name : '',
    constant: type === 'constant',
    vectorized: type === 'vectorized',
    selective: type === 'selective',
    selectiveLogic: logic,
    order: num(position?.order) ?? 100,
    position: before ? 0 : 1,
    disable: !(entry.enabled === true && probability > 0),
    caseSensitive: false,
    matchWholeWords: false,
    probability,
    useProbability: probability < 100,
  }
  if (scanDepth !== undefined) out.scanDepth = scanDepth
  if (entry.ignoreBudget === true) out.ignoreBudget = true
  return out
}

// ── Tavern Helper 状态（只取世界书相关字段，宽松） ──

export interface TavernHelperStateLike {
  worldbooks?: Record<string, TavernWorldbookEntryLike[]>
  deletedWorldbookNames?: string[]
  worldbookBindings?: {
    global?: string[]
    character?: { primary?: string | null; additional?: string[] }
    chat?: string | null
  }
}

const TAVERN_STATE_PREFIX = 'agent-rp-tavern-helper-v0:'

function parseTavernWorldbookEntries(value: unknown): TavernWorldbookEntryLike[] {
  if (!Array.isArray(value)) return []
  const out: TavernWorldbookEntryLike[] = []
  for (const raw of value) {
    const e = object(raw)
    if (!e) continue
    const uid = num(e.uid)
    if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0) continue
    const entry: TavernWorldbookEntryLike = {
      uid,
      ...(typeof e.name === 'string' ? { name: e.name } : {}),
      enabled: e.enabled !== false,
      ...(object(e.strategy) ? { strategy: e.strategy as TavernWorldbookEntryLike['strategy'] } : {}),
      ...(object(e.position) ? { position: e.position as TavernWorldbookEntryLike['position'] } : {}),
      content: typeof e.content === 'string' ? e.content : '',
      ...(num(e.probability) !== undefined ? { probability: num(e.probability) } : {}),
      ...(e.ignoreBudget === true ? { ignoreBudget: true } : {}),
    }
    out.push(entry)
  }
  return out
}

function parseTavernHelperState(value: unknown): TavernHelperStateLike | undefined {
  const state = object(value)
  if (!state || num(state.format) !== 0) return undefined
  const out: TavernHelperStateLike = {}
  if (object(state.worldbooks)) {
    const worldbooks: Record<string, TavernWorldbookEntryLike[]> = {}
    for (const [name, entries] of Object.entries(object(state.worldbooks) ?? {})) {
      worldbooks[name] = parseTavernWorldbookEntries(entries)
    }
    out.worldbooks = worldbooks
  }
  if (Array.isArray(state.deletedWorldbookNames)) {
    out.deletedWorldbookNames = state.deletedWorldbookNames.filter((x): x is string => typeof x === 'string')
  }
  const bindings = object(state.worldbookBindings)
  if (bindings) {
    const parsed: TavernHelperStateLike['worldbookBindings'] = {}
    if (Array.isArray(bindings.global)) {
      parsed.global = bindings.global.filter((x): x is string => typeof x === 'string')
    }
    const character = object(bindings.character)
    if (character) {
      parsed.character = {
        primary: character.primary === null ? null : str(character.primary),
        additional: Array.isArray(character.additional)
          ? character.additional.filter((x): x is string => typeof x === 'string') : [],
      }
    }
    if (bindings.chat !== undefined && bindings.chat !== null) parsed.chat = str(bindings.chat)
    out.worldbookBindings = parsed
  }
  return out
}

// 读取最新 Tavern Helper 快照（agent-rp/tavern-state 事件，或 command/done 的 agent-rp-tavern-helper-v0: 文本）。
export function readTavernHelperState(events: readonly unknown[]): TavernHelperStateLike | undefined {
  let latest: TavernHelperStateLike | undefined
  for (const raw of events) {
    const event = raw as EventLike
    if (event.type === 'agent-rp/tavern-state') {
      const parsed = parseTavernHelperState(event.data)
      if (parsed) latest = parsed
      continue
    }
    if (event.type !== 'command/done') continue
    const done = eventData(event)
    if (done?.kind !== 'success' || typeof done.text !== 'string') continue
    const text = done.text
    if (!text.startsWith(TAVERN_STATE_PREFIX)) continue
    let value: unknown
    try {
      value = JSON.parse(text.slice(TAVERN_STATE_PREFIX.length))
    } catch {
      continue
    }
    const parsed = parseTavernHelperState(value)
    if (parsed) latest = parsed
  }
  return latest
}

// ── 角色卡书 ──

// 从角色卡 JSON 提取书信息：character_book 对象 + 卡名（昵称兜底）+ sourceAttachmentId。
function readCardBook(value: unknown): { book: Record<string, unknown>; name: string } | undefined {
  const card = object(value)
  if (!card) return undefined
  const book = pickCharacterBook(card)
  if (!book) return undefined
  const bookName = str(book.name)
  const data = object(card.data)
  const cardName = str(card.name) ?? str(data?.name) ?? ''
  const nickname = str(card.nickname) ?? str(data?.nickname) ?? ''
  return {
    book,
    name: bookName && bookName.trim() !== '' ? bookName.trim() : `${nickname.trim() || cardName || '角色' }的世界书`,
  }
}

// 从会话事件解析活动角色卡书（agent-rp/character-card-seed 或 import_character_card 工具结果）。
// 返回 ST 世界书构建信息；无角色卡 / 卡无书 / 解析失败返回 undefined。
export function activeCharacterBook(events: readonly unknown[]): { sourceKey: string; name: string; entries: Array<Record<string, unknown>>; description?: string; scanDepth?: number | null } | undefined {
  let meta: { result?: { sourceAttachmentId?: string }; raw?: unknown } | undefined
  for (const raw of events) {
    const event = raw as EventLike
    if (event.type === 'agent-rp/character-card-seed') {
      const data = eventData(event)
      const m = object(data?.meta)
      if (m) meta = { result: object(m.result) ?? {}, raw: m.raw }
      continue
    }
    if (event.type === 'command/done') {
      const done = eventData(event)
      if (done?.kind !== 'success' || typeof done.text !== 'string') continue
      const text = done.text
      if (!text.startsWith('agent-rp-character-library-v0:')) continue
      let record: unknown
      try {
        record = JSON.parse(text.slice('agent-rp-character-library-v0:'.length))
      } catch {
        continue
      }
      const m = object(object(record)?.meta)
      if (m) meta = { result: object(m.result) ?? {}, raw: m.raw }
      continue
    }
    if (event.type !== 'tool/result') continue
    const data = eventData(event)
    const content = resultContent(data)
    if (!content || data?.kind !== undefined || content.isError === true) continue
    const callId = str(content.toolCallId)
    if (callId === undefined) continue
    const call = (events as EventLike[]).find(candidate =>
      candidate.type === 'tool/call' && str((eventData(candidate) as { callId?: unknown } | undefined)?.callId) === callId
      && str((eventData(candidate) as { name?: unknown } | undefined)?.name) === 'import_character_card')
    if (!call) continue
    const m = object((eventData(event) as { meta?: unknown } | undefined)?.meta)
    if (m) meta = { result: object(m.result) ?? {}, raw: m.raw }
  }
  if (!meta) return undefined
  const sourceAttachmentId = str(meta.result?.sourceAttachmentId)
  if (!sourceAttachmentId) return undefined
  const card = readCardBook(meta.raw)
  if (!card) return undefined
  try {
    const parsed = parseStWorldJson(JSON.stringify(card.book))
    return {
      sourceKey: `character:${sourceAttachmentId}`,
      name: card.name,
      entries: parsed.entries,
      ...(parsed.description === undefined ? {} : { description: parsed.description }),
      ...(parsed.scanDepth === undefined ? {} : { scanDepth: parsed.scanDepth }),
    }
  } catch {
    return undefined
  }
}

// ── 独立世界书（import_world_info 工具 / rp-world-info-import 命令 / 启动种子） ──

export interface StandaloneBook {
  sourceKey: string
  name: string
  entries: Array<Record<string, unknown>>
  description?: string
  scanDepth?: number | null
}

function parseWorldInfoMeta(raw: unknown): { result?: { sourceAttachmentId?: string }; value?: unknown } | undefined {
  const m = object(raw)
  if (!m) return undefined
  return { result: object(m.result) ?? {}, value: m.raw }
}

function bookFromRaw(raw: unknown): { name: string; entries: Array<Record<string, unknown>>; description?: string; scanDepth?: number | null } | undefined {
  try {
    const parsed = parseStWorldJson(JSON.stringify(raw))
    const name = parsed.name && parsed.name.trim() !== '' ? parsed.name.trim() : '未命名世界书'
    return {
      name,
      entries: parsed.entries,
      ...(parsed.description === undefined ? {} : { description: parsed.description }),
      ...(parsed.scanDepth === undefined ? {} : { scanDepth: parsed.scanDepth }),
    }
  } catch {
    return undefined
  }
}

const LIBRARY_IMPORT_PREFIX = 'agent-rp-world-info-library-v0:'

// 读取会话内的独立世界书（启动种子 + rp-world-info-import 命令 + import_world_info 工具结果），去重保序。
export function readStandaloneBooks(events: readonly unknown[]): StandaloneBook[] {
  const active = new Map<string, StandaloneBook>()
  for (const raw of events) {
    const event = raw as EventLike
    if (event.type === 'agent-rp/world-info-library-seed') {
      const data = eventData(event)
      const libraryId = str(data?.worldInfoLibraryId)
      if (typeof data?.format === 'number' && data.format === 0 && libraryId) {
        const meta = parseWorldInfoMeta(data.meta)
        const book = bookFromRaw(meta?.value)
        const sourceKey = `standalone:library:${libraryId}`
        if (book) active.set(sourceKey, { sourceKey, ...book })
      }
      continue
    }
    if (event.type !== 'command/done') {
      if (event.type !== 'tool/result') continue
      const data = eventData(event)
      const content = resultContent(data)
      if (!content || content.isError === true) continue
      const callId = str(content.toolCallId)
      if (callId === undefined) continue
      const call = (events as EventLike[]).find(candidate =>
        candidate.type === 'tool/call' && str((eventData(candidate) as { callId?: unknown } | undefined)?.callId) === callId
        && str((eventData(candidate) as { name?: unknown } | undefined)?.name) === 'import_world_info')
      if (!call) continue
      const meta = parseWorldInfoMeta((eventData(event) as { meta?: unknown } | undefined)?.meta)
      const sourceAttachmentId = str(meta?.result?.sourceAttachmentId)
      const book = bookFromRaw(meta?.value)
      if (sourceAttachmentId && book) {
        active.set(`standalone:${sourceAttachmentId}`, { sourceKey: `standalone:${sourceAttachmentId}`, ...book })
      }
      continue
    }
    const done = eventData(event)
    if (done?.kind !== 'success' || typeof done.text !== 'string') continue
    const text = done.text
    if (!text.startsWith(LIBRARY_IMPORT_PREFIX)) continue
    let record: unknown
    try {
      record = JSON.parse(text.slice(LIBRARY_IMPORT_PREFIX.length))
    } catch {
      continue
    }
    const importId = str(object(record)?.importId)
    if (!importId) continue
    const meta = parseWorldInfoMeta(object(record)?.meta)
    const book = bookFromRaw(meta?.value)
    if (book) {
      active.set(`standalone:library:${importId}`, { sourceKey: `standalone:library:${importId}`, ...book })
    }
  }
  return [...active.values()]
}

// ── 组装会话作用域的书（对齐 agent-rp readSessionLorebookSourcesFromEvents + activeTavernWorldbooks） ──

export interface SessionBook {
  sourceKey: string
  name: string
  entries: Array<Record<string, unknown>>
  description?: string
  scanDepth?: number | null
  source: 'character' | 'standalone' | 'script'
}

// 生成一个会话的「该注入的书」：角色卡书 + 独立书 + 脚本书，应用脚本替换/删除/绑定。
// 迁移状态不在这里判断——调用方（adapter）负责跳过已迁入本库的书。
export function assembleSessionBooks(events: readonly unknown[]): SessionBook[] {
  const sources: SessionBook[] = []
  const character = activeCharacterBook(events)
  if (character) {
    sources.push({ sourceKey: character.sourceKey, name: character.name, entries: character.entries, ...(character.description === undefined ? {} : { description: character.description }), ...(character.scanDepth === undefined ? {} : { scanDepth: character.scanDepth }), source: 'character' })
  }
  for (const book of readStandaloneBooks(events)) {
    sources.push({ ...book, source: 'standalone' })
  }

  const state = readTavernHelperState(events)
  if (state === undefined) return sources

  // withTavernWorldbooks：脚本替换/删除/新建（按名）。
  const deleted = new Set(state.deletedWorldbookNames ?? [])
  const replacements = state.worldbooks ?? {}
  const names = new Set<string>()
  const result: SessionBook[] = sources.flatMap(source => {
    names.add(source.name)
    if (deleted.has(source.name)) return []
    const scriptEntries = replacements[source.name]
    if (scriptEntries === undefined) return [source]
    return [{
      ...source,
      entries: scriptEntries.map(tavernEntryToStEntry),
      source: source.source === 'character' ? 'character' : 'standalone',
    }]
  })
  for (const [name, entries] of Object.entries(replacements)) {
    if (names.has(name) || deleted.has(name)) continue
    result.push({ sourceKey: `script:${name}`, name, entries: entries.map(tavernEntryToStEntry), source: 'script' })
  }

  // activeTavernWorldbooks：按脚本显式绑定过滤。
  const bindings = state.worldbookBindings
  if (bindings === undefined) return result.filter(source => source.source !== 'script')
  const active = new Set<string>()
  if (bindings.character === undefined) {
    for (const source of result) if (source.source === 'character') active.add(source.name)
  } else {
    if (bindings.character.primary != null) active.add(bindings.character.primary)
    for (const name of bindings.character.additional ?? []) active.add(name)
  }
  if (bindings.global === undefined) {
    for (const source of result) {
      if (source.source === 'standalone' && !source.sourceKey.startsWith('script:')) active.add(source.name)
    }
  } else {
    for (const name of bindings.global) active.add(name)
  }
  if (bindings.chat != null) active.add(bindings.chat)
  return result.filter(source => active.has(source.name))
}

// ── 世界书覆盖态（agent-rp-world-info-v0:）——供命令影子维护 UI 一致 ──

export interface WorldInfoEditableEntry {
  name?: string
  comment?: string
  keys: string[]
  secondaryKeys: string[]
  content: string
  enabled: boolean
  insertionOrder: number
  selective: boolean
  constant: boolean
  caseSensitive: boolean
  matchWholeWords: boolean
  secondaryLogic: string
  scanDepth?: number
  position: string
  priority?: number
  ignoreBudget: boolean
}

export interface WorldInfoEntryOverride {
  bookId: string
  entryIndex: number
  deleted: boolean
  entry?: WorldInfoEditableEntry
}

export interface WorldInfoConfigurationState {
  format: 0
  revision: number
  overrides: WorldInfoEntryOverride[]
  tokenBudget?: number
}

const CONFIG_PREFIX = 'agent-rp-world-info-v0:'

// 读取会话内最新覆盖态（从右往左取最后一个成功结果）。
export function readWorldInfoConfiguration(events: readonly unknown[]): WorldInfoConfigurationState | undefined {
  let latest: WorldInfoConfigurationState | undefined
  for (const raw of events) {
    const event = raw as EventLike
    if (event.type !== 'command/done') continue
    const done = eventData(event)
    if (done?.kind !== 'success' || typeof done.text !== 'string') continue
    const text = done.text
    if (!text.startsWith(CONFIG_PREFIX)) continue
    let value: unknown
    try {
      value = JSON.parse(text.slice(CONFIG_PREFIX.length))
    } catch {
      continue
    }
    const state = object(value)
    if (!state || state.format !== 0 || !Array.isArray(state.overrides)) continue
    const overrides: WorldInfoEntryOverride[] = []
    for (const item of state.overrides) {
      const o = object(item)
      if (!o || typeof o.bookId !== 'string' || typeof o.entryIndex !== 'number' || typeof o.deleted !== 'boolean') continue
      overrides.push({
        bookId: o.bookId,
        entryIndex: o.entryIndex,
        deleted: o.deleted,
        ...(object(o.entry) ? { entry: o.entry as WorldInfoEditableEntry } : {}),
      })
    }
    latest = {
      format: 0,
      revision: typeof state.revision === 'number' ? state.revision : 0,
      overrides,
      ...(state.tokenBudget !== undefined ? { tokenBudget: state.tokenBudget as number } : {}),
    }
  }
  return latest
}

export function encodeWorldInfoConfiguration(state: WorldInfoConfigurationState): string {
  return `${CONFIG_PREFIX}${JSON.stringify(state)}`
}

// ── 命令请求解析（agent-rp 私有命令输入） ──

// rp-world-info-import 的输入：{ format:0, importId }
export function parseWorldInfoLibraryLaunchRequest(source: string): { format: 0; importId: string } {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('世界书导入请求不是有效 JSON')
  }
  const record = object(value)
  if (!record || record.format !== 0 || typeof record.importId !== 'string'
    || !/^world-info-[a-f0-9]{32}$/u.test(record.importId)) {
    throw new Error('世界书导入请求字段无效')
  }
  return { format: 0, importId: record.importId }
}

export type WorldInfoConfigurationRequest =
  | { operation: 'toggle'; revision: number; bookId: string; entryIndex: number; enabled: boolean }
  | { operation: 'set-book-enabled'; revision: number; bookId: string; enabled: boolean }
  | { operation: 'reset-book'; revision: number; bookId: string }
  | { operation: 'edit'; revision: number; bookId: string; entryIndex: number; entry: WorldInfoEditableEntry }
  | { operation: 'delete'; revision: number; bookId: string; entryIndex: number; deleted: boolean }
  | { operation: 'reset-entry'; revision: number; bookId: string; entryIndex: number }
  | { operation: 'reset-all'; revision: number }
  | { operation: 'set-budget'; revision: number; tokenBudget: number }

function parseEditable(value: unknown): WorldInfoEditableEntry {
  const e = object(value)
  if (!e) throw new Error('世界书条目字段无效')
  const secondaryLogic = e.secondaryLogic
  const position = e.position
  if (secondaryLogic !== 'and-any' && secondaryLogic !== 'and-all'
    && secondaryLogic !== 'not-any' && secondaryLogic !== 'not-all') throw new Error('secondaryLogic 无效')
  if (position !== 'before_char' && position !== 'after_char') throw new Error('position 无效')
  return {
    ...(typeof e.name === 'string' ? { name: e.name } : {}),
    ...(typeof e.comment === 'string' ? { comment: e.comment } : {}),
    keys: Array.isArray(e.keys) ? e.keys.filter((x): x is string => typeof x === 'string') : [],
    secondaryKeys: Array.isArray(e.secondaryKeys) ? e.secondaryKeys.filter((x): x is string => typeof x === 'string') : [],
    content: typeof e.content === 'string' ? e.content : '',
    enabled: e.enabled === true,
    insertionOrder: typeof e.insertionOrder === 'number' ? e.insertionOrder : 100,
    selective: e.selective === true,
    constant: e.constant === true,
    caseSensitive: e.caseSensitive === true,
    matchWholeWords: e.matchWholeWords === true,
    secondaryLogic,
    ...(e.scanDepth !== undefined && typeof e.scanDepth === 'number' ? { scanDepth: e.scanDepth } : {}),
    position,
    ...(e.priority !== undefined && typeof e.priority === 'number' ? { priority: e.priority } : {}),
    ignoreBudget: e.ignoreBudget === true,
  }
}

export function parseWorldInfoConfigurationRequest(source: string): WorldInfoConfigurationRequest {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new Error('世界书操作请求不是有效 JSON')
  }
  const record = object(value)
  if (!record) throw new Error('世界书操作请求必须是对象')
  const revision = typeof record.revision === 'number' && Number.isSafeInteger(record.revision) && record.revision >= 0
    ? record.revision : 0
  const bookId = (): string => {
    if (typeof record.bookId !== 'string' || record.bookId.trim() === '') throw new Error('bookId 无效')
    return record.bookId
  }
  const entryIndex = (): number => {
    if (!Number.isSafeInteger(record.entryIndex) || (record.entryIndex as number) < 0) throw new Error('entryIndex 无效')
    return record.entryIndex as number
  }
  if (record.operation === 'reset-all') return { operation: 'reset-all', revision }
  if (record.operation === 'set-budget') {
    if (typeof record.tokenBudget !== 'number' || record.tokenBudget < 0) throw new Error('tokenBudget 无效')
    return { operation: 'set-budget', revision, tokenBudget: record.tokenBudget }
  }
  if (record.operation === 'reset-book') return { operation: 'reset-book', revision, bookId: bookId() }
  if (record.operation === 'set-book-enabled') {
    if (typeof record.enabled !== 'boolean') throw new Error('enabled 必须是布尔值')
    return { operation: 'set-book-enabled', revision, bookId: bookId(), enabled: record.enabled }
  }
  if (record.operation === 'toggle') {
    if (typeof record.enabled !== 'boolean') throw new Error('enabled 必须是布尔值')
    return { operation: 'toggle', revision, bookId: bookId(), entryIndex: entryIndex(), enabled: record.enabled }
  }
  if (record.operation === 'edit') {
    return { operation: 'edit', revision, bookId: bookId(), entryIndex: entryIndex(), entry: parseEditable(record.entry) }
  }
  if (record.operation === 'delete') {
    if (typeof record.deleted !== 'boolean') throw new Error('deleted 必须是布尔值')
    return { operation: 'delete', revision, bookId: bookId(), entryIndex: entryIndex(), deleted: record.deleted }
  }
  if (record.operation === 'reset-entry') {
    return { operation: 'reset-entry', revision, bookId: bookId(), entryIndex: entryIndex() }
  }
  throw new Error('未知的世界书操作')
}

// 把一次请求应用到覆盖态（供命令影子返回给 agent-rp UI 的编码；真实状态在本库）。
// revision 与配置一致：请求 revision 必须等于当前，否则拒绝（对齐 agent-rp 乐观锁）。
export function applyConfigurationRequest(
  state: WorldInfoConfigurationState | undefined,
  request: WorldInfoConfigurationRequest,
): WorldInfoConfigurationState {
  const current = state ?? { format: 0, revision: 0, overrides: [] }
  if (request.revision !== current.revision) throw new Error('世界书已在别处改变，请刷新后重试')
  if (request.operation === 'reset-all') return { ...current, revision: current.revision + 1, overrides: [] }
  if (request.operation === 'set-budget') {
    if (request.tokenBudget === 0) {
      const { tokenBudget: _removed, ...rest } = current
      return { ...rest, revision: current.revision + 1 }
    }
    return { ...current, revision: current.revision + 1, tokenBudget: request.tokenBudget }
  }
  if (request.operation === 'reset-book') {
    return {
      ...current,
      revision: current.revision + 1,
      overrides: current.overrides.filter(item => item.bookId !== request.bookId),
    }
  }
  if (request.operation === 'set-book-enabled') {
    return {
      ...current,
      revision: current.revision + 1,
      overrides: current.overrides.filter(item => item.bookId !== request.bookId),
    }
  }
  const bookId = request.bookId
  const entryIndex = request.entryIndex
  const replace = (update: (current: WorldInfoEntryOverride) => WorldInfoEntryOverride | undefined): WorldInfoConfigurationState => {
    const currentOverride = current.overrides.find(item => item.bookId === bookId && item.entryIndex === entryIndex)
      ?? { bookId, entryIndex, deleted: false }
    const next = update(currentOverride)
    return {
      ...current,
      revision: current.revision + 1,
      overrides: [
        ...current.overrides.filter(item => item.bookId !== bookId || item.entryIndex !== entryIndex),
        ...(next === undefined || (next.deleted === false && next.entry === undefined) ? [] : [next]),
      ],
    }
  }
  if (request.operation === 'reset-entry') return replace(() => undefined)
  if (request.operation === 'edit') return replace(current => ({ ...current, entry: request.entry }))
  if (request.operation === 'toggle') {
    return replace(current => ({
      ...current,
      entry: { ...(current.entry as WorldInfoEditableEntry | undefined), enabled: request.enabled } as WorldInfoEditableEntry,
    }))
  }
  return replace(current => ({ ...current, deleted: request.deleted }))
}
