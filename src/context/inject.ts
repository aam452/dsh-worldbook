import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { isActiveForSession, type WorkspaceRegistryGateway } from '../data/scope.js'
import { injectMode } from '../data/setting.js'
import { resolveSessionInjection } from '../integration/source.js'
import { matchLinesFromMessages, renderWorldbookInjection, AT_DEPTH_POSITION, DEFAULT_AT_DEPTH } from './worldbook.js'
import { scanWorldbookConflicts } from '../compat.js'

// 世界书注入：每轮对话前把命中的世界书条目作为独立消息注入模型上下文。
// 采用 agent/pre-step 瀑布：先 await next() 拿到既有决策，再追加注入消息。
// cursor = 模型可见真实对话消息数（sticky/cooldown/delay 的时间游标，对齐 ST chat.length）。
// decision.messages 恒为本轮 inbox 取出的消息（长度不变），不能作时间游标；
// 正确来源是会话事件流里「直接用户消息 + assistant 消息」的累计数（排除插件注入消息）。
//
// 注入时机设置（settings.injectMode）：
// - 'every-step'：每个 step 都注入（含工具调用后的思考轮）。
// - 'per-turn'（默认）：用户输出后注入一次——只在本 step 由「新用户输入」触发时注入，
//   后续工具调用/思考轮不再注入。判定不依赖 step 号或模型思维链标签（think/thinking），
//   只看本 step 从 inbox 取出的消息里是否含 source.kind==='user' 的直接用户消息。
export function registerContextInjection(ctx: Context): void {
  let registry: WorkspaceRegistryGateway | undefined
  try {
    registry = ctx.get('workspaceRegistry') as WorkspaceRegistryGateway | undefined
  } catch {
    registry = undefined
  }
  ctx.on(
    'agent/pre-step',
    async ({ agent, signal, messages }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision

      const sessionId = agent.id
      // 插件在此会话未生效（关闭 或 不在指定工作区）→ 不注入
      if (!isActiveForSession(registry, sessionId)) return decision

      // per-turn 模式：仅当本 step 由用户新输入触发时注入
      if (injectMode() === 'per-turn') {
        const hasUserInput = messages.some((m) => (m.source as { kind?: string } | null | undefined)?.kind === 'user')
        if (!hasUserInput) return decision
      }

      // 兼容上下文（协议 §5）：兼容总开关关闭时不含任何角色卡绑定数据（characterFilter / 绑定书 / source），
      // 插件为「全局世界书」单模式；开启后才有角色卡绑定部分。
      const compat = resolveSessionInjection(ctx, agent)

      const world = renderWorldbookInjection(matchLinesFromMessages(decision.messages), {
        cursor: visibleMessageCursor(agent),
        character: compat.character,
        sourceBooks: compat.sourceBooks,
        boundBookNames: compat.boundBookNames,
      })
      // @D 位置（4）的条目按 ST 逻辑以「聊天指定深度」插入：depth = 距最新消息的条数；
      // 其余位置的条目维持原有追加行为（合并为一条指令消息）。
      const contextMessages: typeof decision.messages = [...decision.messages]
      const depthEntries = world.filter((w) => w.position === AT_DEPTH_POSITION)
      const normalEntries = world.filter((w) => w.position !== AT_DEPTH_POSITION)

      if (depthEntries.length > 0) {
        const byDepth = new Map<number, string[]>()
        for (const w of depthEntries) {
          const d = w.depth ?? DEFAULT_AT_DEPTH
          if (!byDepth.has(d)) byDepth.set(d, [])
          byDepth.get(d)!.push(w.content)
        }
        // 深度大者先插，浅者后插，保证各深度相对位置正确（同深度内容合并为一条消息）
        const groups = [...byDepth.entries()].sort((a, b) => b[0] - a[0])
        for (const [d, contents] of groups) {
          const index = Math.max(0, Math.min(contextMessages.length, contextMessages.length - d))
          contextMessages.splice(index, 0, createInjectedMessage(contents.join('\n')))
        }
      }

      if (normalEntries.length > 0) {
        contextMessages.push(createInjectedMessage(normalEntries.map((w) => w.content).join('\n')))
      }

      if (contextMessages.length === decision.messages.length) return decision

      // 注入后立即做重复注入检测：以本次注入为锚点，扫描连续注入段内其它插件是否注入了相同内容
      try {
        scanWorldbookConflicts(agent)
      } catch {
        // 检测失败不影响注入
      }

      return {
        kind: 'enter',
        messages: contextMessages,
      }
    },
    { prepend: true },
  )
}

// 模型可见真实对话消息数：会话事件流里「直接用户消息(kind=user) + assistant 消息」的累计。
// 排除插件注入（kind=plugin）与系统快照，使 cursor 只随真实对话推进（对齐 ST chat.length）。
function visibleMessageCursor(agent: Agent): number {
  let cursor = 0
  for (const e of agent.session.events) {
    const source = (e.data as { source?: { kind?: string } | null }).source
    if (e.type === 'user/message' && source?.kind === 'user') cursor++
    else if (e.type === 'assistant/message') cursor++
  }
  return cursor
}

function createInjectedMessage(text: string) {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-worldbook', form: 'instructions' },
  })
}
