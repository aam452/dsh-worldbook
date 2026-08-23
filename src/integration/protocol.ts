import type { WorldbookContext, WorldbookContextProvider } from '../data/character.js'

// 世界书接管协议（见 docs/DEVELOPMENT.md）：服务键常量与跨边界类型。
// 通用实现，不绑定任何具体宿主插件。
// 约定：跨边界书引用一律用书名；数据使用 ST World Info 对齐的规范化 profile。

export const WORLDBOOK_ENGINE_KEY = 'worldbook.engine'
export const WORLDBOOK_CONTEXT_KEY = 'worldbook.context'
export const WORLDBOOK_SOURCE_KEY = 'worldbook.source'
export const WORLDBOOK_OPERATIONS_KEY = 'worldbook.operations'
export const WORLDBOOK_CHARACTER_BOOKS_KEY = 'worldbook.character-books'

export type { WorldbookContext, WorldbookContextProvider }

/** ST World Info 对齐的规范化书籍对象，不等同于 ST 原始导出 JSON。 */
export interface Worldbook {
  name: string
  description?: string
  scan_depth?: number | null
  recursive_scanning?: boolean
  entries: WorldbookEntry[]
  extensions?: Record<string, unknown>
}

/**
 * 这些字段对应 ST 运行时 World Info entry 的字段名；宿主若使用 ST
 * 原始导出对象（keys、secondary_keys、extensions.*），应在适配层转换。
 * `id` 是协议操作元数据，不得写入宿主原始 ST 文档。
 */
export interface WorldbookEntry {
  id?: string
  key?: string[]
  keysecondary?: string[]
  comment?: string | null
  content?: string
  constant?: boolean
  vectorized?: boolean
  selective?: boolean
  selectiveLogic?: 0 | 1 | 2 | 3
  addMemo?: boolean
  order?: number
  position?: number
  disable?: boolean
  ignoreBudget?: boolean
  caseSensitive?: boolean | null
  matchWholeWords?: boolean | null
  scanDepth?: number | null
  excludeRecursion?: boolean
  preventRecursion?: boolean
  matchPersonaDescription?: boolean
  matchCharacterDescription?: boolean
  matchCharacterPersonality?: boolean
  matchCharacterDepthPrompt?: boolean
  matchScenario?: boolean
  matchCreatorNotes?: boolean
  useProbability?: boolean | null
  probability?: number
  depth?: number
  sticky?: number | null
  cooldown?: number | null
  delay?: number | null
  outletName?: string
  group?: string
  groupOverride?: boolean
  groupWeight?: number
  useGroupScoring?: boolean | null
  automationId?: string
  role?: number
  triggers?: string[]
  characterFilter?: { isExclude?: boolean; names?: string[]; tags?: string[] }
  extensions?: Record<string, unknown>
  [key: string]: unknown
}

// 接管声明（§4.1）：Host 检测到 active === true 即让位。
export interface WorldbookEngine {
  active: boolean
}

// 世界书数据源（§4.3）：Host 提供，WB 读取。
export interface WorldbookSource {
  readBooks(sessionId: string): Worldbook[]
}

// 世界书操作（§4.4）：WB 提供，Host 消费。
export interface WorldbookBookSummary {
  name: string
  entryCount: number
  enabled: boolean
}

export interface WorldbookOperations {
  listBooks(): WorldbookBookSummary[]
  getBook(name: string): Worldbook
  createBook(book: Worldbook): void
  updateBook(name: string, book: Worldbook): void
  deleteBook(name: string): void
  updateEntry(bookName: string, entryId: string, entry: Partial<WorldbookEntry>): void
  toggleEntry(bookName: string, entryId: string, enabled?: boolean): void
  setBookEnabled(name: string, enabled: boolean): void
}

export type WorldbookErrorCode =
  | 'NOT_FOUND'
  | 'NAME_CONFLICT'
  | 'INVALID_ARGUMENT'
  | 'CONFLICT'
  | 'UNAVAILABLE'

export class WorldbookProtocolError extends Error {
  readonly code: WorldbookErrorCode

  constructor(code: WorldbookErrorCode, message: string) {
    super(message)
    this.name = 'WorldbookProtocolError'
    this.code = code
  }
}

export interface WorldbookCharacterBookReference {
  id: string
  name: string
  entryCount: number
  source: string
  localBookId?: string
}

export interface WorldbookCharacterBooks {
  list(sessionId?: string): WorldbookCharacterBookReference[]
}
