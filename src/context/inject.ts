import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { isActiveForSession, type WorkspaceRegistryGateway } from '../data/scope.js'
import { matchLinesFromMessages, renderWorldbookInjection } from './worldbook.js'

// 世界书注入：每轮对话前把命中的世界书条目作为独立消息注入模型上下文。
// 采用 agent/pre-step 瀑布：先 await next() 拿到既有决策，再追加注入消息。
// cursor = 模型可见真实对话消息数（sticky/cooldown/delay 的时间游标，对齐 ST chat.length）。
// decision.messages 恒为本轮 inbox 取出的消息（长度不变），不能作时间游标；
// 正确来源是会话事件流里「直接用户消息 + assistant 消息」的累计数（排除插件注入消息）。
export function registerContextInjection(ctx: Context): void {
  let registry: WorkspaceRegistryGateway | undefined
  try {
    registry = ctx.get('workspaceRegistry') as WorkspaceRegistryGateway | undefined
  } catch {
    registry = undefined
  }
  ctx.on(
    'agent/pre-step',
    async ({ agent, signal }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision

      const sessionId = agent.id
      // 插件在此会话未生效（关闭 或 不在指定工作区）→ 不注入
      if (!isActiveForSession(registry, sessionId)) return decision

      const world = renderWorldbookInjection(matchLinesFromMessages(decision.messages), { cursor: visibleMessageCursor(agent) })
      const worldText = world.map((w) => w.content).join('\n')
      const worldMessages = worldText === ''
        ? []
        : [createUserMessage({
            content: [{ type: 'text', text: worldText }],
            source: { kind: 'plugin', plugin: 'dsh-worldbook', form: 'instructions' },
          })]

      if (worldMessages.length === 0) return decision

      return {
        kind: 'enter',
        messages: [
          ...decision.messages,
          ...worldMessages,
        ],
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
