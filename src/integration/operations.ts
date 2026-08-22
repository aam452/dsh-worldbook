import type { Context } from '@deepseek-ai/cordis'
import * as worldbook from '../data/worldbook.js'
import * as setting from '../data/setting.js'
import {
  WORLDBOOK_OPERATIONS_KEY,
  type Worldbook,
  type WorldbookBookSummary,
  type WorldbookOperations,
  WorldbookProtocolError,
} from './protocol.js'

export interface WorldbookDeleteTarget {
  readonly id: string
  readonly name: string
}

export type WorldbookDeleteGuard = (book: WorldbookDeleteTarget) => void
export type WorldbookDeleteHook = (book: WorldbookDeleteTarget) => void

const deleteGuards = new Set<WorldbookDeleteGuard>()
const deleteHooks = new Set<WorldbookDeleteHook>()

/** 注册一个宿主适配层的删除策略；通用层不识别任何宿主来源格式。 */
export function registerDeleteGuard(guard: WorldbookDeleteGuard): () => void {
  deleteGuards.add(guard)
  return () => deleteGuards.delete(guard)
}

export function assertBookDeletable(book: WorldbookDeleteTarget): void {
  for (const guard of deleteGuards) guard(book)
}

export function registerDeleteHook(hook: WorldbookDeleteHook): () => void {
  deleteHooks.add(hook)
  return () => deleteHooks.delete(hook)
}

export function notifyBookDeleted(book: WorldbookDeleteTarget): void {
  for (const hook of deleteHooks) hook(book)
}

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
  // 与 toStWorldJson 一致的条目顺序，供书籍输出保持稳定；操作本身使用持久化 entryId。
  const entriesInStOrder = (bookId: string) =>
    [...worldbook.entries(bookId)].sort((a, b) => a.displayIndex - b.displayIndex || a.order - b.order)

  const resolve = (name: string) => {
    if (typeof name !== 'string' || name.length === 0) throw new WorldbookProtocolError('INVALID_ARGUMENT', '世界书名称必须是非空字符串')
    const row = worldbook.findByName(name)
    if (!row) throw new WorldbookProtocolError('NOT_FOUND', `世界书「${name}」不存在`)
    return row
  }

  const resolveEntry = (bookName: string, entryId: string) => {
    const row = resolve(bookName)
    const list = entriesInStOrder(row.id)
    const target = list.find(entry => entry.id === entryId)
    if (!target) throw new WorldbookProtocolError('NOT_FOUND', `世界书「${bookName}」没有条目「${entryId}」`)
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
      const orderedRows = entriesInStOrder(row.id)
      const book: Worldbook = {
        name: parsed.name ?? row.name,
        entries: parsed.entries.map((e, index) => ({ ...e, id: orderedRows[index]?.id })),
      }
      if (parsed.description !== undefined) book.description = parsed.description
      if (parsed.scanDepth !== undefined) book.scan_depth = parsed.scanDepth
      if (parsed.recursiveScanning !== undefined) book.recursive_scanning = parsed.recursiveScanning
      if (parsed.extensions !== undefined) book.extensions = parsed.extensions
      return book
    },

    createBook: (book) => {
      if (typeof book.name !== 'string' || book.name.trim() === '') throw new WorldbookProtocolError('INVALID_ARGUMENT', '世界书名称必须是非空字符串')
      const name = book.name.trim()
      if (worldbook.findByName(name)) throw new WorldbookProtocolError('NAME_CONFLICT', `世界书「${name}」已存在`)
       const row = worldbook.create(name, {
         description: book.description,
         scanDepth: book.scan_depth ?? null,
         extensions: {
           ...(book.extensions ?? {}),
           ...(book.recursive_scanning !== undefined ? { recursive_scanning: book.recursive_scanning } : {}),
         },
       })
      worldbook.replaceEntries(row.id, book.entries ?? [])
    },

    updateBook: (name, book) => {
      const row = resolve(name)
      if (typeof book.name !== 'string' || book.name.trim() === '') throw new WorldbookProtocolError('INVALID_ARGUMENT', '世界书名称必须是非空字符串')
      const nextName = book.name.trim()
      const conflict = worldbook.findByName(nextName)
      if (conflict && conflict.id !== row.id) throw new WorldbookProtocolError('NAME_CONFLICT', `世界书「${nextName}」已存在`)
       worldbook.update(row.id, {
          name: nextName,
         description: book.description ?? null,
         scanDepth: book.scan_depth ?? null,
         extensions: {
           ...(book.extensions ?? {}),
           ...(book.recursive_scanning !== undefined ? { recursive_scanning: book.recursive_scanning } : {}),
         },
       })
      worldbook.replaceEntries(row.id, book.entries ?? [])
    },

    deleteBook: (name) => {
      const row = worldbook.findByName(name)
      if (row) {
        assertBookDeletable(row)
        worldbook.remove(row.id)
        notifyBookDeleted(row)
      }
    },

    updateEntry: (bookName, entryId, entry) => {
       const { row } = resolveEntry(bookName, entryId)
      worldbook.updateEntry(row.id, entryId, entry)
    },

    toggleEntry: (bookName, entryId, enabled) => {
       const { row, disable } = resolveEntry(bookName, entryId)
      const next = enabled !== undefined ? !enabled : !disable
      worldbook.updateEntry(row.id, entryId, { disable: next })
    },

    setBookEnabled: (name, enabled) => {
      worldbook.setEnabled(resolve(name).id, enabled)
    },
  }
}
