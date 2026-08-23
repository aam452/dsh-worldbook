import { getDb, now, uuid } from '../db/index.js'
import { parseJson, toJson } from './base.js'

// 世界书：全局共享数据（不绑定角色卡/会话），作用域随插件「启用 + 工作区生效范围」。
// 字段名全程对齐 SillyTavern World Info 编辑器内部格式（newWorldInfoEntryDefinition），
// 无映射层：DB 列名 / View / REST / 工具 schema / 客户端 UI / ST JSON 统一用 ST 字段名。
//   - 顶层(spec v2)：name / description / scan_depth / extensions
//   - 条目：key/keysecondary/content/comment/constant/vectorized/selective/selectiveLogic(0~3)/
//           order/position(0~7)/disable/caseSensitive/matchWholeWords/scanDepth/
//           useGroupScoring/excludeRecursion/preventRecursion/delayUntilRecursion/
//           probability/useProbability/depth/outletName/group/groupOverride/groupWeight/
//           sticky/cooldown/delay/automationId/role/triggers/characterFilter 等；
//           ST 高级字段并入 raw 保留、导出还原。order 为 SQL 保留字，SQL 中统一双引号 "order"。

export interface WorldbookRow {
  id: string
  name: string
  description: string | null
  enabled: number
  scan_depth: number | null
  extensions: string | null
  created_at: string
  updated_at: string
}

export interface WorldbookEntryRow {
  id: string
  worldbook_id: string
  key: string
  keysecondary: string
  comment: string | null
  content: string
  constant: number
  vectorized: number
  selective: number
  selectiveLogic: number
  order: number
  position: number
  disable: number
  caseSensitive: number | null
  matchWholeWords: number | null
  scanDepth: number | null
  excludeRecursion: number
  preventRecursion: number
  useProbability: number | null
  probability: number
  depth: number
  sticky: number | null
  cooldown: number | null
  delay: number | null
  displayIndex: number
  raw: string | null
}

// ── 规范化条目视图（注入引擎与 UI 共用，字段对齐 ST 面板） ──
export interface WorldbookEntryView {
  id: string
  key: string[]
  keysecondary: string[]
  comment: string | null
  content: string
  constant: boolean
  vectorized: boolean
  selective: boolean
  selectiveLogic: 0 | 1 | 2 | 3
  order: number
  position: number
  disable: boolean
  caseSensitive: boolean | null
  matchWholeWords: boolean | null
  scanDepth: number | null
  useGroupScoring: boolean | null
  excludeRecursion: boolean
  preventRecursion: boolean
  delayUntilRecursion: boolean | number
  probability: number
  useProbability: boolean
  depth: number
  outletName: string
  group: string
  groupOverride: boolean
  groupWeight: number
  sticky: number | null
  cooldown: number | null
  delay: number | null
  displayIndex: number
  automationId: string
  role: number | null
  triggers: string[]
  characterFilter: { isExclude: boolean; names: string[]; tags: string[] }
  matchPersonaDescription: boolean
  matchCharacterDescription: boolean
  matchCharacterPersonality: boolean
  matchCharacterDepthPrompt: boolean
  matchScenario: boolean
  matchCreatorNotes: boolean
}

export function toEntryView(row: WorldbookEntryRow): WorldbookEntryView {
  const raw = parseJson<Record<string, unknown> | null>(row.raw, null)
  const rawMap = raw ?? {}
  const key = parseJson<string[]>(row.key, [])
  const secondary = parseJson<string[]>(row.keysecondary, [])
  const triggers = Array.isArray(rawMap.triggers) ? rawMap.triggers.filter((x): x is string => typeof x === 'string') : []
  const cf = (rawMap.characterFilter ?? {}) as Record<string, unknown>
  const names = Array.isArray(cf.names) ? cf.names.filter((x): x is string => typeof x === 'string') : []
  const tags = Array.isArray(cf.tags) ? cf.tags.filter((x): x is string => typeof x === 'string') : []
  const delayUntil: boolean | number =
    typeof raw?.delayUntilRecursion === 'number' ? (raw.delayUntilRecursion as number)
      : raw?.delayUntilRecursion === true || raw?.delayUntilRecursion === 1 ? 1
        : false
  const view: WorldbookEntryView = {
    id: row.id,
    key: Array.isArray(key) ? key : [],
    keysecondary: Array.isArray(secondary) ? secondary : [],
    comment: row.comment,
    content: row.content ?? '',
    constant: row.constant === 1,
    vectorized: row.vectorized === 1,
    selective: row.selective === 1,
    selectiveLogic: (row.selectiveLogic as 0 | 1 | 2 | 3) ?? 0,
    order: row.order,
    position: row.position,
    disable: row.disable === 1,
    caseSensitive: row.caseSensitive === null ? null : row.caseSensitive === 1,
    matchWholeWords: row.matchWholeWords === null ? null : row.matchWholeWords === 1,
    scanDepth: row.scanDepth,
    useGroupScoring: typeof raw?.useGroupScoring === 'boolean' ? (raw.useGroupScoring as boolean) : null,
    excludeRecursion: row.excludeRecursion === 1,
    preventRecursion: row.preventRecursion === 1,
    delayUntilRecursion: delayUntil,
    probability: row.probability,
    useProbability: row.useProbability === null ? true : row.useProbability === 1,
    depth: row.depth,
    outletName: typeof raw?.outletName === 'string' ? raw.outletName : '',
    group: typeof raw?.group === 'string' ? raw.group : '',
    groupOverride: raw?.groupOverride === true,
    groupWeight: typeof raw?.groupWeight === 'number' ? raw.groupWeight : 100,
    sticky: row.sticky,
    cooldown: row.cooldown,
    delay: row.delay,
    displayIndex: row.displayIndex,
    automationId: typeof raw?.automationId === 'string' ? raw.automationId : '',
    role: typeof raw?.role === 'number' ? raw.role : null,
    triggers,
    characterFilter: { isExclude: cf.isExclude === true, names, tags },
    matchPersonaDescription: rawMap.matchPersonaDescription === true,
    matchCharacterDescription: rawMap.matchCharacterDescription === true,
    matchCharacterPersonality: rawMap.matchCharacterPersonality === true,
    matchCharacterDepthPrompt: rawMap.matchCharacterDepthPrompt === true,
    matchScenario: rawMap.matchScenario === true,
    matchCreatorNotes: rawMap.matchCreatorNotes === true,
  }
  return view
}

// ST 世界书条目对象 → 注入用视图（宿主 source / operations 传来的书不在本库，无 DB 行）。
// 复用 normalizeEntry 规范化 + toEntryView 解码高级字段（advanced 字段在 src.raw 里）。
export function stEntryToView(src: Record<string, unknown>, fallbackId: string): WorldbookEntryView {
  const n = normalizeEntry(src)
  const row: WorldbookEntryRow = {
    id: fallbackId,
    worldbook_id: '',
    key: toJson(n.key),
    keysecondary: toJson(n.keysecondary),
    comment: n.comment,
    content: n.content,
    constant: n.constant ? 1 : 0,
    vectorized: n.vectorized ? 1 : 0,
    selective: n.selective ? 1 : 0,
    selectiveLogic: n.selectiveLogic,
    order: n.order,
    position: n.position,
    disable: n.disable ? 1 : 0,
    caseSensitive: n.caseSensitive === null ? null : n.caseSensitive ? 1 : 0,
    matchWholeWords: n.matchWholeWords === null ? null : n.matchWholeWords ? 1 : 0,
    scanDepth: n.scanDepth,
    excludeRecursion: n.excludeRecursion ? 1 : 0,
    preventRecursion: n.preventRecursion ? 1 : 0,
    useProbability: n.useProbability ? 1 : 0,
    probability: n.probability,
    depth: n.depth,
    sticky: n.sticky,
    cooldown: n.cooldown,
    delay: n.delay,
    displayIndex: n.displayIndex,
    raw: src.raw !== undefined && src.raw !== null ? toJson(src.raw) : toJson({}),
  }
  return toEntryView(row)
}

// ── 世界书 ──
export function list(): WorldbookRow[] {
  return getDb()
    .prepare('SELECT * FROM worldbooks WHERE is_deleted=0 ORDER BY created_at ASC')
    .all() as unknown as WorldbookRow[]
}

export function listEnabled(): WorldbookRow[] {
  return getDb()
    .prepare('SELECT * FROM worldbooks WHERE is_deleted=0 AND enabled=1 ORDER BY created_at ASC')
    .all() as unknown as WorldbookRow[]
}

// 按书名精确查找；跨边界引用区分大小写，不做模糊或大小写兜底。
export function findByName(name: string): WorldbookRow | null {
  if (typeof name !== 'string' || name.trim() === '') return null
  return (getDb()
    .prepare('SELECT * FROM worldbooks WHERE name=? AND is_deleted=0 LIMIT 1')
    .get(name) as WorldbookRow | undefined) ?? null
}

// 书名集合 → 命中的世界书（保持去重；不存在的名字静默跳过）。
export function findByNameMany(names: Iterable<string>): WorldbookRow[] {
  const seen = new Set<string>()
  const out: WorldbookRow[] = []
  for (const name of names) {
    const row = findByName(name)
    if (row && !seen.has(row.id)) {
      seen.add(row.id)
      out.push(row)
    }
  }
  return out
}

export function get(id: string): WorldbookRow | null {
  return (
    (getDb().prepare('SELECT * FROM worldbooks WHERE id=? AND is_deleted=0 LIMIT 1').get(id) as
      | WorldbookRow
      | undefined) ?? null
  )
}

export function create(name: string, opts: { description?: string; scanDepth?: number | null; extensions?: unknown } = {}): WorldbookRow {
  const db = getDb()
  const t = now()
  const id = uuid()
  db.prepare(
    'INSERT INTO worldbooks (id, name, description, enabled, scan_depth, extensions, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at) VALUES (?,?,?,0,?,?,?,?,?,?,0,NULL)',
  ).run(
    id, name, opts.description ?? null,
    opts.scanDepth ?? null,
    opts.extensions !== undefined ? toJson(opts.extensions) : null,
    t, t, 'user', 'user',
  )
  return get(id)!
}

export function update(id: string, patch: { name?: string; description?: string | null; enabled?: boolean; scanDepth?: number | null; extensions?: unknown }): WorldbookRow | null {
  const existing = get(id)
  if (!existing) return null
  const db = getDb()
  const t = now()
  if (patch.name !== undefined) db.prepare('UPDATE worldbooks SET name=?, updated_at=? WHERE id=?').run(patch.name, t, id)
  if (patch.description !== undefined) db.prepare('UPDATE worldbooks SET description=?, updated_at=? WHERE id=?').run(patch.description, t, id)
  if (patch.scanDepth !== undefined) db.prepare('UPDATE worldbooks SET scan_depth=?, updated_at=? WHERE id=?').run(patch.scanDepth, t, id)
  if (patch.extensions !== undefined) db.prepare('UPDATE worldbooks SET extensions=?, updated_at=? WHERE id=?').run(toJson(patch.extensions), t, id)
  if (patch.enabled !== undefined) db.prepare('UPDATE worldbooks SET enabled=?, updated_at=? WHERE id=?').run(patch.enabled ? 1 : 0, t, id)
  return get(id)
}

export function setEnabled(id: string, enabled: boolean): WorldbookRow | null {
  return update(id, { enabled })
}

export function remove(id: string): void {
  const db = getDb()
  const t = now()
  db.prepare('UPDATE worldbook_entries SET is_deleted=1, deleted_at=?, updated_at=? WHERE worldbook_id=?').run(t, t, id)
  db.prepare('UPDATE worldbooks SET is_deleted=1, deleted_at=?, updated_at=? WHERE id=?').run(t, t, id)
  clearTimedEffects(id)
}

// ── 条目 ──
export function entries(bookId: string): WorldbookEntryRow[] {
  return getDb()
    .prepare('SELECT * FROM worldbook_entries WHERE worldbook_id=? AND is_deleted=0 ORDER BY displayIndex ASC, "order" DESC')
    .all(bookId) as unknown as WorldbookEntryRow[]
}

export interface EntryPageOptions {
  query?: string
  sort?: string
  order?: string
  page: number
  pageSize: number
}

export function entryPage(bookId: string, options: EntryPageOptions): { total: number; rows: WorldbookEntryRow[] } {
  const db = getDb()
  const q = options.query?.trim() ?? ''
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, '\\$&')}%`
  const where = q
    ? `AND (LOWER(COALESCE(comment, '')) LIKE ? ESCAPE '\\'
        OR LOWER(content) LIKE ? ESCAPE '\\'
        OR LOWER(key) LIKE ? ESCAPE '\\'
        OR LOWER(keysecondary) LIKE ? ESCAPE '\\'
        OR LOWER(COALESCE(raw, '')) LIKE ? ESCAPE '\\')`
    : ''
  const params = q ? [bookId, pattern, pattern, pattern, pattern, pattern] : [bookId]
  const total = Number((db.prepare(`SELECT COUNT(*) AS total FROM worldbook_entries WHERE worldbook_id=? AND is_deleted=0 ${where}`).get(...params) as { total: number }).total)
  const direction = options.order === 'desc' ? 'DESC' : 'ASC'
  const sortSql: Record<string, string> = {
    custom: 'displayIndex',
    comment: "LOWER(COALESCE(comment, ''))",
    content: 'LENGTH(content)',
    depth: 'depth',
    order: '"order"',
    uid: 'rowid',
    probability: 'probability',
    priority: 'CASE WHEN constant=1 THEN 0 WHEN disable=1 THEN 2 ELSE 1 END',
  }
  const sort = sortSql[options.sort ?? 'custom'] ?? sortSql.custom
  const offset = Math.max(0, (options.page - 1) * options.pageSize)
  const rows = db.prepare(
    `SELECT * FROM worldbook_entries WHERE worldbook_id=? AND is_deleted=0 ${where}
     ORDER BY ${sort} ${direction}, displayIndex ASC, "order" DESC LIMIT ? OFFSET ?`,
  ).all(...params, options.pageSize, offset) as unknown as WorldbookEntryRow[]
  return { total, rows }
}

export function entryIds(bookId: string): string[] {
  const rows = getDb().prepare('SELECT id FROM worldbook_entries WHERE worldbook_id=? AND is_deleted=0 ORDER BY displayIndex ASC, "order" DESC').all(bookId) as { id: string }[]
  return rows.map((row) => row.id)
}

// 替换整本条目集（导入用）：删旧插新。
export function replaceEntries(bookId: string, items: Array<Record<string, unknown>>): void {
  const db = getDb()
  const t = now()
  db.prepare('UPDATE worldbook_entries SET is_deleted=1, deleted_at=?, updated_at=? WHERE worldbook_id=?').run(t, t, bookId)
  const insert = db.prepare(
    `INSERT INTO worldbook_entries (id, worldbook_id, key, keysecondary, comment, content, constant, vectorized, selective, selectiveLogic, "order", position, disable, caseSensitive, matchWholeWords, scanDepth, excludeRecursion, preventRecursion, useProbability, probability, depth, sticky, cooldown, delay, displayIndex, raw, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL)`,
  )
  items.forEach((item, index) => {
    const v = normalizeEntry(item)
    if (item.displayIndex === undefined) v.displayIndex = index
    insert.run(
      uuid(), bookId,
      toJson(v.key), toJson(v.keysecondary), v.comment, v.content,
      v.constant ? 1 : 0, v.vectorized ? 1 : 0, v.selective ? 1 : 0, v.selectiveLogic,
      v.order, v.position, v.disable ? 1 : 0,
      v.caseSensitive === null ? null : v.caseSensitive ? 1 : 0,
      v.matchWholeWords === null ? null : v.matchWholeWords ? 1 : 0,
      v.scanDepth, v.excludeRecursion ? 1 : 0, v.preventRecursion ? 1 : 0,
      v.useProbability ? 1 : 0, v.probability, v.depth, v.sticky, v.cooldown, v.delay,
      v.displayIndex,
      item.raw !== undefined && item.raw !== null ? toJson(item.raw) : null,
      t, t, 'user', 'user',
    )
  })
}

interface NormalizedEntry {
  key: string[]
  keysecondary: string[]
  comment: string | null
  content: string
  constant: boolean
  vectorized: boolean
  selective: boolean
  selectiveLogic: number
  order: number
  position: number
  disable: boolean
  caseSensitive: boolean | null
  matchWholeWords: boolean | null
  scanDepth: number | null
  excludeRecursion: boolean
  preventRecursion: boolean
  useProbability: boolean
  probability: number
  depth: number
  sticky: number | null
  cooldown: number | null
  delay: number | null
  displayIndex: number
}

function strArray(v: unknown): string[] {
  if (v === undefined || v === null) return []
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

function bool(v: unknown, fallback = false): boolean {
  if (v === undefined || v === null) return fallback
  return v === true || v === 1 || v === '1' || v === 'true'
}

function num(v: unknown, fallback?: number): number | null {
  if (v === undefined || v === null) return fallback ?? null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : (fallback ?? null)
}

function tri(v: unknown): boolean | null {
  if (v === undefined || v === null) return null
  if (v === true || v === 1 || v === '1' || v === 'true') return true
  if (v === false || v === 0 || v === '0' || v === 'false') return false
  return null
}

// 从 ST 条目对象规范化为行字段。UI 与导入共用；字段名即 ST 编辑器内部格式（key/keysecondary/order/disable/...）。
export function normalizeEntry(src: Record<string, unknown>): NormalizedEntry {
  const key = strArray(src.key ?? src.keys)
  const keysecondary = strArray(src.keysecondary ?? src.secondary_keys)
  const raw = src.raw as Record<string, unknown> | undefined
  const ext = src.extensions as Record<string, unknown> | undefined
  const value = (name: string, ...fallbacks: string[]) => {
    for (const key of [name, ...fallbacks]) {
      if (src[key] !== undefined) return src[key]
      if (ext?.[key] !== undefined) return ext[key]
      if (raw?.[key] !== undefined) return raw[key]
    }
    return undefined
  }
  const delayUntil = value('delayUntilRecursion', 'delay_until_recursion') ?? false
  let position = num(value('position'), 0) ?? 0
  // 兼容 spec v2 的字符串 position（before_char/after_char）
  if (typeof src.position === 'string') {
    if (src.position === 'after_char') position = 1
    else if (src.position === 'before_char') position = 0
  }
  return {
    key,
    keysecondary,
    comment: typeof src.comment === 'string' ? src.comment : null,
    content: typeof src.content === 'string' ? src.content : '',
    constant: bool(src.constant),
    vectorized: bool(src.vectorized) || (raw?.vectorized === true),
    selective: bool(src.selective, false),
    selectiveLogic: num(src.selectiveLogic ?? raw?.selectiveLogic, 0) ?? 0,
    order: num(value('order', 'insertionOrder', 'insertion_order'), 100) ?? 100,
    position,
    disable: src.disable !== undefined ? bool(src.disable) : (src.enabled !== undefined ? !bool(src.enabled) : false),
    caseSensitive: value('caseSensitive', 'case_sensitive') !== undefined ? tri(value('caseSensitive', 'case_sensitive')) : null,
    matchWholeWords: value('matchWholeWords', 'match_whole_words') !== undefined ? tri(value('matchWholeWords', 'match_whole_words')) : null,
    scanDepth: num(value('scanDepth', 'scan_depth')),
    excludeRecursion: bool(value('excludeRecursion', 'exclude_recursion'), true),
    preventRecursion: bool(value('preventRecursion', 'prevent_recursion')),
    useProbability: value('useProbability') !== undefined ? bool(value('useProbability'), true) : true,
    probability: num(value('probability'), 100) ?? 100,
    depth: num(value('depth'), 4) ?? 4,
    sticky: value('sticky') !== undefined ? num(value('sticky'), 0) : null,
    cooldown: value('cooldown') !== undefined ? num(value('cooldown'), 0) : null,
    delay: value('delay') !== undefined ? num(value('delay'), 0) : null,
    displayIndex: src.displayIndex !== undefined ? num(src.displayIndex, 0) ?? 0 : num(ext?.display_index ?? raw?.displayIndex, 0) ?? 0,
  }
}

// ST 高级字段 → 需要写回 raw 的部分（余下所有字段原样保留）。
function advancedFrom(src: Record<string, unknown>): Record<string, unknown> {
  const raw = (src.raw as Record<string, unknown> | undefined) ?? {}
  const out: Record<string, unknown> = {}
  for (const key of ['outletName', 'group', 'groupOverride', 'groupWeight', 'automationId', 'role', 'triggers', 'useGroupScoring', 'delayUntilRecursion', 'characterFilter', 'matchPersonaDescription', 'matchCharacterDescription', 'matchCharacterPersonality', 'matchCharacterDepthPrompt', 'matchScenario', 'matchCreatorNotes', 'useProbability']) {
    if (src[key] !== undefined) out[key] = src[key]
  }
  // 工具 schema 的 enum 用字符串（Gemini 要求），这里把 role 转回数字存储。
  if (typeof out.role === 'string' && out.role !== '') out.role = num(out.role, 0)
  return { ...raw, ...out }
}

// ── 条目 CRUD ──
export type EntryPatch = Record<string, unknown>

// 对齐 ST：role 仅用于 @D 位置（系统/用户/AI）。非 @D 位置不携带 role（ST 切换位置时会清空）。
function applyRoleByPosition(src: Record<string, unknown>, position: number): void {
  const raw = src.raw as Record<string, unknown> | undefined
  if (!raw) return
  if (position === 4) {
    if (raw.role === undefined) raw.role = 0
  } else {
    delete raw.role
  }
}

export function getEntry(bookId: string, entryId: string): WorldbookEntryRow | null {
  return (
    (getDb().prepare('SELECT * FROM worldbook_entries WHERE worldbook_id=? AND id=? AND is_deleted=0 LIMIT 1').get(bookId, entryId) as
      | WorldbookEntryRow
      | undefined) ?? null
  )
}

export function addEntry(bookId: string, patch?: EntryPatch): WorldbookEntryRow {
  const src = { ...(patch ?? {}) }
  src.raw = advancedFrom(src)
  const v = normalizeEntry(src)
  if (src.displayIndex === undefined) {
    const max = getDb().prepare('SELECT COALESCE(MAX(displayIndex), -1) AS m FROM worldbook_entries WHERE worldbook_id=? AND is_deleted=0').get(bookId) as { m: number }
    v.displayIndex = max.m + 1
  }
  applyRoleByPosition(src, v.position)
  const db = getDb()
  const t = now()
  const id = uuid()
  db.prepare(
    `INSERT INTO worldbook_entries (id, worldbook_id, key, keysecondary, comment, content, constant, vectorized, selective, selectiveLogic, "order", position, disable, caseSensitive, matchWholeWords, scanDepth, excludeRecursion, preventRecursion, useProbability, probability, depth, sticky, cooldown, delay, displayIndex, raw, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL)`,
  ).run(
    id, bookId,
    toJson(v.key), toJson(v.keysecondary), v.comment, v.content,
    v.constant ? 1 : 0, v.vectorized ? 1 : 0, v.selective ? 1 : 0, v.selectiveLogic,
    v.order, v.position, v.disable ? 1 : 0,
    v.caseSensitive === null ? null : v.caseSensitive ? 1 : 0,
    v.matchWholeWords === null ? null : v.matchWholeWords ? 1 : 0,
    v.scanDepth, v.excludeRecursion ? 1 : 0, v.preventRecursion ? 1 : 0,
    v.useProbability ? 1 : 0, v.probability, v.depth, v.sticky, v.cooldown, v.delay,
    v.displayIndex, toJson(src.raw),
    t, t, 'user', 'user',
  )
  return getEntry(bookId, id)!
}

export function updateEntry(bookId: string, entryId: string, patch: EntryPatch): WorldbookEntryRow | null {
  const existing = getEntry(bookId, entryId)
  if (!existing) return null
  // 以现有条目视图为底（数组/布尔已解码），叠加新 patch，再规范化为列。
  const view = toEntryView(existing)
  const src: Record<string, unknown> = { ...(view as unknown as Record<string, unknown>), ...patch }
  // 保留 existing.raw 作为基础，叠加新高级字段
  const prevRaw = parseJson<Record<string, unknown>>(existing.raw, {})
  src.raw = { ...prevRaw, ...advancedFrom(src) }
  const v = normalizeEntry(src)
  applyRoleByPosition(src, v.position)
  const db = getDb()
  const t = now()
  db.prepare(
    `UPDATE worldbook_entries SET key=?, keysecondary=?, comment=?, content=?, constant=?, vectorized=?, selective=?, selectiveLogic=?, "order"=?, position=?, disable=?, caseSensitive=?, matchWholeWords=?, scanDepth=?, excludeRecursion=?, preventRecursion=?, useProbability=?, probability=?, depth=?, sticky=?, cooldown=?, delay=?, displayIndex=?, raw=?, updated_at=? WHERE id=?`,
  ).run(
    toJson(v.key), toJson(v.keysecondary), v.comment, v.content,
    v.constant ? 1 : 0, v.vectorized ? 1 : 0, v.selective ? 1 : 0, v.selectiveLogic,
    v.order, v.position, v.disable ? 1 : 0,
    v.caseSensitive === null ? null : v.caseSensitive ? 1 : 0,
    v.matchWholeWords === null ? null : v.matchWholeWords ? 1 : 0,
    v.scanDepth, v.excludeRecursion ? 1 : 0, v.preventRecursion ? 1 : 0,
    v.useProbability ? 1 : 0, v.probability, v.depth, v.sticky, v.cooldown, v.delay,
    v.displayIndex, toJson(src.raw), t, entryId,
  )
  return getEntry(bookId, entryId)
}

export function removeEntry(bookId: string, entryId: string): void {
  const t = now()
  getDb()
    .prepare('UPDATE worldbook_entries SET is_deleted=1, deleted_at=?, updated_at=? WHERE worldbook_id=? AND id=?')
    .run(t, t, bookId, entryId)
}

// 按给定顺序批量重写 displayIndex（ST Custom 拖拽排序）。
export function reorderEntries(bookId: string, orderedIds: string[]): void {
  const db = getDb()
  const t = now()
  const run = db.prepare('UPDATE worldbook_entries SET displayIndex=?, updated_at=? WHERE worldbook_id=? AND id=?')
  db.exec('BEGIN')
  try {
    orderedIds.forEach((id, index) => run.run(index, t, bookId, id))
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ── ST 双向兼容 ──
// 从角色卡 JSON 顶层抽取世界书对象（CCv2：character_book 在顶层；CCv3：在 data.character_book）。
// 纯世界书 JSON 无 character_book 时原样返回。仅取世界书部分，剔除角色卡的角色数据。
export function pickCharacterBook(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const root = parsed as Record<string, unknown>
  if (typeof root.character_book === 'object' && root.character_book !== null && !Array.isArray(root.character_book)) {
    return root.character_book as Record<string, unknown>
  }
  const data = root.data
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const inner = (data as Record<string, unknown>).character_book
    if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
      return inner as Record<string, unknown>
    }
  }
  return null
}

// 解析 ST 世界书 JSON(text) → { name, description, scanDepth, entries }
// 兼容三种形态：spec v2 entries(数组)、ST 编辑器内部 entries(对象，键为字符串序数)、
// 角色卡 JSON（CCv2/CCv3，自动抽取 character_book 只导入世界书内容）。
export function parseStWorldJson(json: string): {
  name?: string
  description?: string
  scanDepth?: number
  recursiveScanning?: boolean
  extensions?: Record<string, unknown>
  entries: Array<Record<string, unknown> & { raw: unknown; key: string[]; keysecondary: string[]; content: string }>
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('世界书不是合法 JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('世界书顶层必须是对象')
  }
  const root = (pickCharacterBook(parsed) ?? parsed) as Record<string, unknown>
  const entries = root.entries
  if (typeof entries !== 'object' || entries === null) {
    throw new Error('世界书缺少 entries 字段')
  }
  const pairs: Array<[string, unknown]> = Array.isArray(entries)
    ? entries.map((e, i) => [String(i), e] as [string, unknown])
    : Object.entries(entries)

  const out: ReturnType<typeof parseStWorldJson>['entries'] = []
  for (const [uid, rawEntry] of pairs) {
    if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
      throw new Error(`世界书条目 ${uid} 必须是对象`)
    }
    const e = rawEntry as Record<string, unknown>
    const v = normalizeEntry(e)
    const ext = (e.extensions ?? {}) as Record<string, unknown>
    out.push({
      ...v,
      key: v.key,
      keysecondary: v.keysecondary,
      content: v.content,
      displayIndex: typeof ext.display_index === 'number' ? ext.display_index : undefined,
      raw: rawEntry,
    } as ReturnType<typeof parseStWorldJson>['entries'][number])
  }
  return {
    ...(typeof root.name === 'string' ? { name: root.name } : {}),
    ...(typeof root.description === 'string' ? { description: root.description } : {}),
    ...(num(root.scan_depth) !== null ? { scanDepth: num(root.scan_depth) as number } : {}),
    ...(typeof root.recursive_scanning === 'boolean' ? { recursiveScanning: root.recursive_scanning } : {}),
    ...(typeof root.extensions === 'object' && root.extensions !== null && !Array.isArray(root.extensions)
      ? { extensions: root.extensions as Record<string, unknown> } : {}),
    entries: out,
  }
}

// 导出为一本 ST 世界书 JSON 文本（entries 用序数字符串键，兼容 ST 编辑器内部格式）。
// 字段名即 ST 编辑器内部格式，直接写出，无需映射。
export function toStWorldJson(bookId: string): string {
  const book = get(bookId)
  if (!book) throw new Error('世界书不存在')
  const rows = [...entries(bookId)].sort((a, b) => a.displayIndex - b.displayIndex || a.order - b.order)
  const outEntries: Record<string, unknown> = {}
  rows.forEach((row, i) => {
    const view = toEntryView(row)
    const raw = parseJson<Record<string, unknown>>(row.raw, {})
    const base: Record<string, unknown> = { ...raw }
    base.key = view.key
    base.keysecondary = view.keysecondary
    base.content = view.content
    base.comment = view.comment ?? ''
    base.constant = view.constant
    base.vectorized = view.vectorized
    base.selective = view.selective
    base.selectiveLogic = view.selectiveLogic
    base.order = view.order
    base.position = view.position
    base.disable = view.disable
    if (view.caseSensitive !== null) base.caseSensitive = view.caseSensitive
    if (view.matchWholeWords !== null) base.matchWholeWords = view.matchWholeWords
    if (view.scanDepth !== null) base.scanDepth = view.scanDepth
    if (view.delayUntilRecursion !== false) base.delayUntilRecursion = view.delayUntilRecursion
    if (view.role !== null) base.role = view.role
    base.useProbability = view.useProbability
    base.probability = view.probability
    base.depth = view.depth
    if (view.sticky !== null) base.sticky = view.sticky
    if (view.cooldown !== null) base.cooldown = view.cooldown
    if (view.delay !== null) base.delay = view.delay
    const baseExt = (base.extensions ?? {}) as Record<string, unknown>
    base.extensions = { ...baseExt, display_index: view.displayIndex }
    base.uid = i
    outEntries[String(i)] = base
  })
  const out: Record<string, unknown> = { entries: outEntries }
  if (book.name) out.name = book.name
  if (book.description) out.description = book.description
  if (book.scan_depth !== null && book.scan_depth !== undefined) out.scan_depth = book.scan_depth
  const bookExtensions = parseJson<Record<string, unknown>>(book.extensions, {})
  if (bookExtensions.recursive_scanning !== undefined) out.recursive_scanning = bookExtensions.recursive_scanning
  if (Object.keys(bookExtensions).length > 0) out.extensions = bookExtensions
  return toJson(out)
}

// 视图
export function toBookView(row: WorldbookRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled === 1,
    scanDepth: row.scan_depth,
    entryCount: entries(row.id).length,
  }
}

export function toEntryItem(row: WorldbookEntryRow): Record<string, unknown> {
  const v = toEntryView(row)
  const stateName = v.constant ? '常驻' : v.vectorized ? '向量' : v.disable ? '禁用' : '普通'
  const keysNote = v.key.length > 0 ? v.key.join('、') : '(无触发词)'
  return {
    id: v.id,
    comment: v.comment,
    content: v.content,
    key: v.key,
    keysecondary: v.keysecondary,
    constant: v.constant,
    vectorized: v.vectorized,
    selective: v.selective,
    selectiveLogic: v.selectiveLogic,
    order: v.order,
    position: v.position,
    disable: v.disable,
    caseSensitive: v.caseSensitive,
    matchWholeWords: v.matchWholeWords,
    scanDepth: v.scanDepth,
    useGroupScoring: v.useGroupScoring,
    excludeRecursion: v.excludeRecursion,
    preventRecursion: v.preventRecursion,
    delayUntilRecursion: v.delayUntilRecursion,
    probability: v.probability,
    useProbability: v.useProbability,
    depth: v.depth,
    outletName: v.outletName,
    group: v.group,
    groupOverride: v.groupOverride,
    groupWeight: v.groupWeight,
    sticky: v.sticky,
    cooldown: v.cooldown,
    delay: v.delay,
    automationId: v.automationId,
    role: v.role,
    triggers: v.triggers,
    characterFilter: v.characterFilter,
    matchPersonaDescription: v.matchPersonaDescription,
    matchCharacterDescription: v.matchCharacterDescription,
    matchCharacterPersonality: v.matchCharacterPersonality,
    matchCharacterDepthPrompt: v.matchCharacterDepthPrompt,
    matchScenario: v.matchScenario,
    matchCreatorNotes: v.matchCreatorNotes,
    displayIndex: v.displayIndex,
    digest: `${keysNote} [${stateName}] ${v.content.slice(0, 120)}`,
  }
}

// ── 跨轮状态（sticky/cooldown）：以「模型可见消息数」为时间游标，对齐 ST chat.length ──

export interface TimedEffect {
  bookId: string
  entryId: string
  type: 'sticky' | 'cooldown'
  start: number
  end: number
}

/** 读取某世界书当前的 sticky/cooldown 生效区间 */
export function getTimedEffects(bookId: string): TimedEffect[] {
  const rows = getDb()
    .prepare('SELECT * FROM worldbook_timed_effects WHERE book_id=?')
    .all(bookId) as unknown as { book_id: string; entry_id: string; type: 'sticky' | 'cooldown'; start: number; end: number }[]
  return rows.map((r) => ({ bookId: r.book_id, entryId: r.entry_id, type: r.type, start: r.start, end: r.end }))
}

/** 为某条目设置一个 sticky/cooldown 生效区间（覆盖同类型旧值） */
export function setTimedEffect(bookId: string, entryId: string, type: 'sticky' | 'cooldown', start: number, end: number): void {
  getDb().prepare(
    `INSERT INTO worldbook_timed_effects (book_id, entry_id, type, start, end, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(book_id, entry_id, type) DO UPDATE SET start=excluded.start, end=excluded.end`,
  ).run(bookId, entryId, type, start, end, now())
}

/** 移除已过期的生效区间（start < cursor 且被覆盖，或 end < cursor） */
export function pruneTimedEffects(bookId: string, cursor: number): void {
  getDb().prepare('DELETE FROM worldbook_timed_effects WHERE book_id=? AND end <= ?').run(bookId, cursor)
}

/** 清空某世界书全部跨轮状态（重命名/切换时） */
export function clearTimedEffects(bookId: string): void {
  getDb().prepare('DELETE FROM worldbook_timed_effects WHERE book_id=?').run(bookId)
}
