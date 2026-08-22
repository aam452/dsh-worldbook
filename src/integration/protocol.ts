import type { WorldbookContext } from '../data/character.js'

// 世界书接管协议（见 docs/DEVELOPMENT.md）：服务键常量与跨边界类型。
// 通用实现，不绑定任何具体宿主插件。
// 约定：跨边界书引用一律用书名；世界书数据统一 SillyTavern 世界书格式。

export const WORLDBOOK_ENGINE_KEY = 'worldbook.engine'
export const WORLDBOOK_CONTEXT_KEY = 'worldbook.context'
export const WORLDBOOK_SOURCE_KEY = 'worldbook.source'
export const WORLDBOOK_OPERATIONS_KEY = 'worldbook.operations'

export type { WorldbookContext }

// 跨边界世界书数据：SillyTavern 世界书格式（entries 为 ST 条目对象）。
export interface Worldbook {
  name: string
  description?: string
  scan_depth?: number | null
  recursive_scanning?: boolean
  entries: Array<Record<string, unknown>>
  extensions?: Record<string, unknown>
}

// 接管声明（§4.1）：Host 检测到 active === true 即让位。
export interface WorldbookEngine {
  active: boolean
  /** 可选：Host 不再解析自己的世界书，直接向 WB 要书。 */
  getBooks?(events: readonly unknown[]): Worldbook[]
}

// 世界书数据源（§4.3）：Host 提供，WB 读取。
export interface WorldbookSource {
  readBooks(events: readonly unknown[]): Worldbook[]
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
  updateEntry(bookName: string, entryIndex: number, entry: Record<string, unknown>): void
  toggleEntry(bookName: string, entryIndex: number, enabled?: boolean): void
  setBookEnabled(name: string, enabled: boolean): void
}
