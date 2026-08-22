// 拦截 agent-rp 的 import_world_info 工具：让书落本库，不让它进会话事件流。
//
// 机制（对照 README §2）：
//   - 钩 tools/execute 瀑布，仅当 exec.name === 'import_world_info'。
//   - 先跑对方的真实工具体（next()）拿到规范化结果（含 lossless ST JSON 在 meta.raw / value.raw），
//     把书迁入本库并记为「本会话活跃」，然后**替换结果为 isError**——
//     这样 DSH 写的 tool/result 事件带 isError:true，agent-rp 的 readActiveSessionWorldInfos
//     首行跳过（session-world-info.ts:182），事件流里没有书，其注入引擎注入空气。
//   - 模型侧看到的是良性文案（世界书已由 dsh-worldbook 接管导入），不影响会话。

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { parseStWorldJson } from '../../data/worldbook.js'
import { ensureSourceBook, rememberSessionBook } from './import.js'

const IMPORT_WORLD_INFO = 'import_world_info'

interface WorldInfoValueLike {
  result?: { sourceAttachmentId?: string }
  raw?: unknown
}

export function applyAgentRpToolInterception(ctx: Context): (() => void) | null {
  return ctx.on('tools/execute', async (exec: ToolDispatchExecution, next) => {
    if (exec.name !== IMPORT_WORLD_INFO || exec.agent === undefined) return next()
    const result = await next()
    if (result.isError) return result
    try {
      const value = (result.meta ?? result.value) as WorldInfoValueLike | null | undefined
      const sourceAttachmentId = value?.result?.sourceAttachmentId
      const raw = value?.raw
      if (typeof sourceAttachmentId === 'string' && sourceAttachmentId !== '' && raw !== undefined) {
        const parsed = parseStWorldJson(JSON.stringify(raw))
        const name = parsed.name && parsed.name.trim() !== '' ? parsed.name.trim() : '未命名世界书'
        const { name: importedName } = ensureSourceBook(`standalone:${sourceAttachmentId}`, {
          name,
          entries: parsed.entries,
          ...(parsed.description === undefined ? {} : { description: parsed.description }),
          ...(parsed.scanDepth === undefined ? {} : { scan_depth: parsed.scanDepth }),
        })
        rememberSessionBook(String(exec.agent.id), importedName)
        ctx.logger.info(`[dsh-worldbook] agent-rp 接管导入（工具 import_world_info）: ${importedName} -> 本库`)
      }
    } catch {
      // 迁移失败不阻塞：仍让 tool/result 为 isError，事件流里不出现书
    }
    return takeoverResult()
  }, { prepend: true })
}

function takeoverResult(): ToolExecutionResult {
  return {
    isError: true,
    error: {
      message: '世界书已由 dsh-worldbook 插件接管导入（兼容 dsh-agent-rp 模式）',
      info: { name: 'worldbook-takeover', code: 'WORLDBOOK_TAKEOVER' },
    },
    content: [{
      type: 'text',
      text: '世界书已由 dsh-worldbook 插件接管导入并存入世界书库（兼容 dsh-agent-rp 模式）。从下一次回应开始生效，无需重复导入。',
    }],
  }
}
