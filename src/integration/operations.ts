import type { Context } from '@deepseek-ai/cordis'
import * as worldbook from '../data/worldbook.js'
import * as setting from '../data/setting.js'
import {
  WORLDBOOK_OPERATIONS_KEY,
  type Worldbook,
  type WorldbookBookSummary,
  type WorldbookOperations,
} from './protocol.js'

// 世界书操作（协议 §4.4）：把 data 层包成服务键，供宿主脚本 / 能力调用。
// 协议按书名 / 条目标引引用，data 层用 id → 这里做映射。

// 同步注册状态：exposeOperations 开则 provide、关则注销（REST 保存设置时调用）。
let disposeOperations: (() => Promise<void> | void) | null = null

export function syncOperations(ctx: Context): void {
  const should = setting.exposeOperations()
  if (should && disposeOperations === null) {
    disposeOperations = ctx.provide(WORLDBOOK_OPERATIONS_KEY, createOperations())
  } else if (!should && disposeOperations !== null) {
    disposeOperations()
    disposeOperations = null
  }
}

export function createOperations(): WorldbookOperations {
  // 与 toStWorldJson 一致的条目顺序（displayIndex 升序，order 升序），保证 entryIndex 与 getBook 返回一致。
  const entriesInStOrder = (bookId: string) =>
    [...worldbook.entries(bookId)].sort((a, b) => a.displayIndex - b.displayIndex || a.order - b.order)

  const resolve = (name: string) => {
    const row = worldbook.findByName(name)
    if (!row) throw new Error(`世界书「${name}」不存在`)
    return row
  }

  const resolveIndex = (bookName: string, entryIndex: number) => {
    const row = resolve(bookName)
    const list = entriesInStOrder(row.id)
    const target = list[entryIndex]
    if (!target) throw new Error(`世界书「${bookName}」没有第 ${entryIndex} 个条目`)
    return { row, entryId: target.id, disable: target.disable === 1 }
  }

  return {
    listBooks: () =>
      worldbook.list().map((row) => ({
        name: row.name,
        entryCount: worldbook.entries(row.id).length,
        enabled: row.enabled === 1,
      })) as WorldbookBookSummary[],

    getBook: (name) => {
      const row = resolve(name)
      const parsed = worldbook.parseStWorldJson(worldbook.toStWorldJson(row.id))
      const book: Worldbook = {
        name: parsed.name ?? row.name,
        entries: parsed.entries.map((e) => ({ ...e })),
      }
      if (parsed.description !== undefined) book.description = parsed.description
      if (parsed.scanDepth !== undefined) book.scan_depth = parsed.scanDepth
      return book
    },

    createBook: (book) => {
      const name = typeof book.name === 'string' && book.name.trim() !== '' ? book.name.trim() : '未命名世界书'
      const row = worldbook.create(name, { description: book.description, scanDepth: book.scan_depth ?? null })
      worldbook.replaceEntries(row.id, book.entries ?? [])
    },

    updateBook: (name, book) => {
      const row = resolve(name)
      worldbook.update(row.id, {
        ...(typeof book.name === 'string' && book.name.trim() !== '' ? { name: book.name.trim() } : {}),
        ...(book.description !== undefined ? { description: book.description } : {}),
        ...(book.scan_depth !== undefined ? { scanDepth: book.scan_depth } : {}),
      })
      worldbook.replaceEntries(row.id, book.entries ?? [])
    },

    deleteBook: (name) => {
      const row = worldbook.findByName(name)
      if (row) worldbook.remove(row.id)
    },

    updateEntry: (bookName, entryIndex, entry) => {
      const { row, entryId } = resolveIndex(bookName, entryIndex)
      worldbook.updateEntry(row.id, entryId, entry)
    },

    toggleEntry: (bookName, entryIndex, enabled) => {
      const { row, entryId, disable } = resolveIndex(bookName, entryIndex)
      const next = enabled !== undefined ? !enabled : !disable
      worldbook.updateEntry(row.id, entryId, { disable: next })
    },

    setBookEnabled: (name, enabled) => {
      worldbook.setEnabled(resolve(name).id, enabled)
    },
  }
}
