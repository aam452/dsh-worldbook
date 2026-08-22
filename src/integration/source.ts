import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { resolveBoundBooks, resolveCharacterContext, type CharacterContext } from '../data/character.js'
import * as setting from '../data/setting.js'
import { WORLDBOOK_SOURCE_KEY, type Worldbook, type WorldbookSource } from './protocol.js'

// 会话世界书来源解析（协议 §4.3 + §4.2）：
// - sourceBooks：Host 提供的 worldbook.source.readBooks(sessionId) 结果（ST 格式）
// - boundBookNames：worldbook.context.books（绑定到本会话的书名，按名查 WB 库）
// 任何一步失败都静默降级为空，不阻塞注入。
export interface SessionBooks {
  sourceBooks?: Worldbook[]
  boundBookNames: string[]
}

export function resolveSessionBooks(ctx: Context, agent: Agent): SessionBooks {
  let source: WorldbookSource | undefined
  try {
    source = ctx.get(WORLDBOOK_SOURCE_KEY) as WorldbookSource | undefined
  } catch {
    source = undefined
  }
  let sourceBooks: Worldbook[] | undefined
  if (source && typeof source.readBooks === 'function') {
    try {
      const books = source.readBooks(String(agent.id))
      sourceBooks = Array.isArray(books)
        ? books.filter((b): b is Worldbook => !!b && typeof b.name === 'string' && Array.isArray(b.entries))
        : undefined
    } catch {
      sourceBooks = undefined
    }
  }
  return { sourceBooks, boundBookNames: resolveBoundBooks(ctx, agent.id) }
}

// 组装一轮注入需要的兼容上下文（协议 §5）。
// 兼容总开关关闭时，不消费任何宿主数据：角色卡绑定世界书（characterFilter + 绑定书 + source）
// 整体不运行，插件退化为「全局世界书」单模式；开启后才有角色卡绑定部分。
export interface SessionInjection {
  character?: CharacterContext
  sourceBooks?: Worldbook[]
  boundBookNames: string[]
}

export function resolveSessionInjection(ctx: Context, agent: Agent): SessionInjection {
  if (!setting.compatEnabled()) return { boundBookNames: [] }
  const books = resolveSessionBooks(ctx, agent)
  return {
    character: resolveCharacterContext(ctx, agent.id),
    sourceBooks: books.sourceBooks,
    boundBookNames: books.boundBookNames,
  }
}
