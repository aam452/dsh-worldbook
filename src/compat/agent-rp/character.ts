// worldbook.context 提供方：桥接 agent-rp 的角色上下文 → 我方协议键。
//
// agent-rp 用自己的 `worldbook.characterContext` 键暴露/消费每会话角色解析器：
//   - host 模式：agent-rp 自己 provide 该键（我们只读，不 provide，避免 Cordis 冲突）。
//   - character 模式（默认）：agent-rp 不 provide，但会注册进任何提供该键的注册表 → 我们 provide。
// 两种路径都收敛到同一个注册表：getCurrentCharacter(sessionId)。
//
// 我方 `worldbook.context`（协议 §4.2，消费侧已在 src/integration/source.ts 实现）：
//   get(sessionId) → {
//     character: 当前角色 { name, tags }（characterFilter 用）
//     books:     本会话应注入的本库书名（已迁移的角色卡书 + 本会话接管导入的独立书）
//   }
// 未迁移的角色卡书 / 脚本书由 adapter（worldbook.source）从事件原样注入，不在此重复。
//
// 会话注册表是模块级共享状态：供 provider 与诊断（agentRpContextSnapshot）复用。

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CONTEXT_PROVIDER_KEY, type CharacterContext, type WorldbookContextProvider } from '../../data/character.js'
import { activeCharacterBook, type SessionBook } from './events.js'
import { isMigrated, sourceBookName, sessionActiveBooks, forgetSession, ensureSessionCardBook } from './import.js'
import { createAgentRpSource } from './adapter.js'

const CHARACTER_CONTEXT_KEY = 'worldbook.characterContext'

interface WorldbookCharacterContext {
  name: string
  tags: string[]
}

type CharacterResolver = () => WorldbookCharacterContext | undefined

interface WorldbookCharacterContextRegistry {
  getCurrentCharacter(sessionId: string): WorldbookCharacterContext | undefined
  register(sessionId: string, resolve: CharacterResolver): () => void
}

function createRegistry(): WorldbookCharacterContextRegistry {
  const sessions = new Map<string, { token: symbol; resolve: CharacterResolver }>()
  return {
    getCurrentCharacter(sessionId) {
      return sessions.get(sessionId)?.resolve()
    },
    register(sessionId, resolve) {
      const token = Symbol(sessionId)
      sessions.set(sessionId, { token, resolve })
      return () => {
        if (sessions.get(sessionId)?.token === token) sessions.delete(sessionId)
      }
    },
  }
}

function isRegistry(value: unknown): value is WorldbookCharacterContextRegistry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.register === 'function' && typeof record.getCurrentCharacter === 'function'
}

// 模块级共享状态：会话注册表 + 角色解析注册表（挂载时建立，供 provider 与诊断读取）。
const sessions = new Map<string, Agent>()
let registry: WorldbookCharacterContextRegistry | undefined

// 某会话应注入的本库书名：会话内接管导入的独立书 + 角色卡内嵌书（未迁则迁入）。
function sessionBooks(agent: Agent | undefined): string[] {
  if (agent === undefined) return []
  const names = new Set<string>(sessionActiveBooks(String(agent.id)))
  try {
    const cardName = ensureSessionCardBook(String(agent.id), agent.session.events)
    if (cardName) names.add(cardName)
  } catch {
    // 解析失败不影响其余书名
  }
  return [...names]
}

/** 协议 §4.2：某会话的角色 + 绑定书。 */
export function contextForSession(sessionId: string): { character?: CharacterContext; books?: string[] } {
  const character = registry?.getCurrentCharacter(sessionId)
  const characterContext: CharacterContext | undefined = character && typeof character.name === 'string'
    ? { name: character.name, tags: Array.isArray(character.tags) ? character.tags.filter((x): x is string => typeof x === 'string') : [] }
    : undefined
  const books = sessionBooks(sessions.get(sessionId))
  return {
    ...(characterContext === undefined ? {} : { character: characterContext }),
    ...(books.length === 0 ? {} : { books }),
  }
}

// 会话是否由 agent-rp 驱动：事件里出现 agent-rp 私有格式即视为活跃。
export function agentRpActiveInSession(agent: Agent): boolean {
  for (const raw of agent.session.events) {
    const event = raw as { type?: string; data?: Record<string, unknown> }
    const type = event.type
    if (typeof type === 'string' && type.startsWith('agent-rp/')) return true
    if (type === 'tool/call') {
      const name = (event.data as { name?: string } | undefined)?.name
      if (name === 'import_world_info' || name === 'import_character_card') return true
    }
    if (type === 'command/done') {
      const data = event.data as { kind?: string; text?: string } | undefined
      if (data?.kind === 'success' && typeof data.text === 'string'
        && (data.text.startsWith('agent-rp-world-info-v0:')
          || data.text.startsWith('agent-rp-world-info-library-v0:')
          || data.text.startsWith('agent-rp-character-library-v0:')
          || data.text.startsWith('agent-rp-tavern-helper-v0:'))) return true
    }
  }
  return false
}

/** 诊断快照：本插件视角下，每个 agent-rp 会话看到了什么。 */
export interface AgentRpSessionSnapshot {
  id: string
  agentRpActive: boolean
  character: { name: string; tags: string[] } | null
  contextBooks: string[]
  sourceBooks: Array<{ name: string; migrated: boolean }>
}

export function agentRpContextSnapshot(): AgentRpSessionSnapshot[] {
  const source = createAgentRpSource()
  const out: AgentRpSessionSnapshot[] = []
  for (const [sessionId, agent] of sessions) {
    if (!agentRpActiveInSession(agent)) continue
    const context = contextForSession(sessionId)
    const eventBooks: SessionBook[] = []
    try {
      eventBooks.push(...(source.readBooks(agent.session.events) as SessionBook[]))
    } catch {
      // 忽略
    }
    out.push({
      id: sessionId,
      agentRpActive: true,
      character: context.character && typeof context.character.name === 'string'
        ? { name: context.character.name, tags: context.character.tags }
        : null,
      contextBooks: Array.isArray(context.books) ? context.books : [],
      sourceBooks: eventBooks.map(book => ({
        name: book.name,
        migrated: book.sourceKey.startsWith('script:') ? false : isMigrated(book.sourceKey),
      })),
    })
  }
  return out
}

export function applyAgentRpContext(ctx: Context): (() => void) | null {
  const disposers: (() => void)[] = []
  // agent-rp host 模式已 provide → 消费它；否则提供自己的注册表让 agent-rp 注册进来。
  try {
    const candidate = ctx.get(CHARACTER_CONTEXT_KEY) as unknown
    if (isRegistry(candidate)) registry = candidate
  } catch {
    registry = undefined
  }
  if (registry === undefined) {
    registry = createRegistry()
    disposers.push(ctx.provide(CHARACTER_CONTEXT_KEY, registry))
  }

  disposers.push(ctx.on('agent/created', ({ agent }) => {
    sessions.set(String(agent.id), agent)
    sessions.set(String(agent.session.id), agent)
  }, { global: true }))
  disposers.push(ctx.on('agent/disposed', ({ agent }) => {
    for (const id of [String(agent.id), String(agent.session.id)]) sessions.delete(id)
    forgetSession(String(agent.id))
  }, { global: true }))

  const provider: WorldbookContextProvider = {
    get(sessionId) {
      return contextForSession(sessionId)
    },
  }
  disposers.push(ctx.provide(CONTEXT_PROVIDER_KEY, provider))

  return () => {
    for (const dispose of disposers.reverse()) dispose()
    registry = undefined
  }
}
