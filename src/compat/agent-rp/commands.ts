// 命令影子：在 root ctx 注册全局命令 /rp-world-info / rp-world-info-import，
// 走 CommandRuntime 的 scoped layer 机制。
// 对方全局命令被我们的全局同名定义 shadow（DSH 命令优先级：agent-scope > global scope，
// 对方 per-agent 注册的 shadow 优先于我们的全局；但对方默认走 global，
// 所以我们的全局定义在对方无 shadow 时接管）。
//
// 注意：commands 服务可能在本插件初始化时（dsh-commands 尚未 load）还未注入 ctx，
// 因此用 setImmediate 延迟到下个事件循环 tick 再注册（届时 commands 应该已在 ctx）。

import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation } from '@deepseek-ai/dsh-commands'
import { WORLDBOOK_OPERATIONS_KEY, type WorldbookOperations } from '../../integration/protocol.js'
import {
  applyConfigurationRequest,
  encodeWorldInfoConfiguration,
  parseWorldInfoConfigurationRequest,
  parseWorldInfoLibraryLaunchRequest,
  readWorldInfoConfiguration,
} from './events.js'
import { ensureSourceBook, readLibraryAsset, rememberSessionBook, sourceBookName } from './import.js'

function resolveBookName(agentRpBookId: string): string | undefined {
  return sourceBookName(agentRpBookId)
}

function editableToStPatch(entry: {
  keys?: string[]
  secondaryKeys?: string[]
  content?: string
  comment?: string
  enabled?: boolean
  insertionOrder?: number
  selective?: boolean
  constant?: boolean
  caseSensitive?: boolean
  matchWholeWords?: boolean
  secondaryLogic?: string
  scanDepth?: number
  position?: string
}): Record<string, unknown> {
  const logic = entry.secondaryLogic === 'and-all' ? 3
    : entry.secondaryLogic === 'not-all' ? 1
      : entry.secondaryLogic === 'not-any' ? 2 : 0
  return {
    ...(Array.isArray(entry.keys) ? { key: entry.keys } : {}),
    ...(Array.isArray(entry.secondaryKeys) ? { keysecondary: entry.secondaryKeys } : {}),
    ...(typeof entry.content === 'string' ? { content: entry.content } : {}),
    ...(typeof entry.comment === 'string' ? { comment: entry.comment } : {}),
    ...(entry.enabled !== undefined ? { disable: !entry.enabled } : {}),
    ...(entry.insertionOrder !== undefined ? { order: entry.insertionOrder } : {}),
    ...(entry.selective !== undefined ? { selective: entry.selective } : {}),
    ...(entry.constant !== undefined ? { constant: entry.constant } : {}),
    ...(entry.caseSensitive !== undefined ? { caseSensitive: entry.caseSensitive } : {}),
    ...(entry.matchWholeWords !== undefined ? { matchWholeWords: entry.matchWholeWords } : {}),
    ...(entry.secondaryLogic !== undefined ? { selectiveLogic: logic } : {}),
    ...(entry.scanDepth !== undefined ? { scanDepth: entry.scanDepth } : {}),
    ...(entry.position !== undefined ? { position: entry.position === 'after_char' ? 1 : 0 } : {}),
  }
}

function getOperations(invocation: CommandInvocation): WorldbookOperations {
  let operations: WorldbookOperations | undefined
  try { operations = invocation.agent.ctx.get(WORLDBOOK_OPERATIONS_KEY) as WorldbookOperations | undefined } catch { operations = undefined }
  if (!operations) throw new Error('世界书操作接口未启用，请先开启兼容模式中的操作接口')
  return operations
}

function executeConfiguration(invocation: CommandInvocation): { kind: 'success'; text: string } {
  const operations = getOperations(invocation)
  const request = parseWorldInfoConfigurationRequest(invocation.rawInput)
  const current = readWorldInfoConfiguration(invocation.agent.session.events)
  if (request.operation === 'reset-all' || request.operation === 'set-budget') {
    return { kind: 'success', text: encodeWorldInfoConfiguration(applyConfigurationRequest(current, request)) }
  }
  const bookName = resolveBookName(request.bookId)
  if (bookName === undefined) throw new Error('目标世界书不存在（未迁移到 dsh-worldbook 库）')
  const book = operations.getBook(bookName)
  if (request.operation === 'reset-book' || request.operation === 'set-book-enabled') {
    const enable = request.operation === 'reset-book' ? true : request.enabled
    for (const entry of book.entries) {
      if (entry.id) operations.toggleEntry(bookName, entry.id, enable)
    }
    return { kind: 'success', text: encodeWorldInfoConfiguration(applyConfigurationRequest(current, request)) }
  }
  const entry = book.entries[request.entryIndex]
  if (entry === undefined) throw new Error('目标世界书条目不存在')
  if (!entry.id) throw new Error('目标世界书条目缺少稳定标识')
  if (request.operation === 'edit') {
    operations.updateEntry(bookName, entry.id, editableToStPatch(request.entry))
  } else if (request.operation === 'toggle') {
    operations.toggleEntry(bookName, entry.id, request.enabled)
  } else if (request.operation === 'delete') {
    operations.toggleEntry(bookName, entry.id, !request.deleted)
  } else if (request.operation === 'reset-entry') {
    operations.toggleEntry(bookName, entry.id, true)
  }
  return { kind: 'success', text: encodeWorldInfoConfiguration(applyConfigurationRequest(current, request)) }
}

function executeLibraryImport(invocation: CommandInvocation): { kind: 'success'; text: string } {
  const request = parseWorldInfoLibraryLaunchRequest(invocation.rawInput)
  const asset = readLibraryAsset(request.importId)
  if (asset === null) throw new Error('这本世界书已不可用，请重新选择 JSON 文件')
  const { name: importedName } = ensureSourceBook(`standalone:library:${request.importId}`, asset.book)
  rememberSessionBook(String(invocation.agent.id), importedName)
  invocation.agent.ctx.logger.info(`[dsh-worldbook] agent-rp 接管导入（命令 /rp-world-info-import）: ${importedName} -> 本库`)
  return { kind: 'success', text: `已由 dsh-worldbook 接管导入世界书：${importedName}` }
}

function makeCommand(
  name: string,
  handler: (invocation: CommandInvocation) => { kind: 'success'; text: string },
  description: string,
): CommandDefinition {
  return {
    name,
    description,
    input: { hint: '<dsh-worldbook agent-rp compat>' },
    recordInput: false,
    handler(invocation) {
      try {
        return handler(invocation)
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : '操作失败' }
      }
    },
  }
}

export function applyAgentRpCommands(ctx: Context): (() => void) | null {
  let registered = false
  const disposeRegistrations: (() => void)[] = []
  const tryRegister = (): void => {
    if (registered) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commands = (ctx as any).commands
      if (!commands) return
      registered = true
       const first = commands.register(makeCommand('rp-world-info', executeConfiguration, 'manage this roleplay Session world info (dsh-worldbook)')) as unknown as (() => void)
       const second = commands.register(makeCommand('rp-world-info-import', executeLibraryImport, 'import one Host-owned World Info source (dsh-worldbook)')) as unknown as (() => void)
       if (typeof first === 'function') disposeRegistrations.push(first)
       if (typeof second === 'function') disposeRegistrations.push(second)
    } catch (error) {
      ctx.logger.warn(`[dsh-worldbook] agent-rp 命令注册失败（commands 服务尚未就绪）: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  // 延迟到下个 tick：插件初始化时 commands 可能还未注入 ctx
  setImmediate(tryRegister)
  return () => {
     for (const dispose of disposeRegistrations.splice(0).reverse()) {
       try { dispose() } catch { /* ignore */ }
     }
    registered = false
  }
}
