import * as setting from './setting.js'

// 插件生效判定：把「会话 id」映射到「所在工作区」，再套用启用开关 + 工作区作用域。
// - enabled 关闭：全局失效。
// - workspaceMode=all：全区生效。
// - workspaceMode=selected：仅当会话所在工作区在指定集合内才生效。
// Host 侧经 ctx.get('workspaceRegistry') 提供 WorkspaceRegistryGateway。
export interface WorkspaceRegistryGateway {
  list(): readonly { id: string; sessionIds: readonly string[] }[]
}

// 会话 → 所在工作区 id；找不到返回 undefined（视为无工作区归属）。
export function workspaceOfSession(
  registry: WorkspaceRegistryGateway | undefined,
  sessionId: string,
): string | undefined {
  if (!registry) return undefined
  try {
    return registry.list().find((w) => w.sessionIds.includes(sessionId))?.id
  } catch {
    return undefined
  }
}

// 综合判定插件是否在该会话生效。
export function isActiveForSession(
  registry: WorkspaceRegistryGateway | undefined,
  sessionId: string,
  opts: { defaultOn?: boolean } = {},
): boolean {
  if (!setting.enabled()) return false
  if (setting.workspaceMode() === 'all') return true
  const ws = workspaceOfSession(registry, sessionId)
  // 拿不到工作区时按选项回退：默认开启（避免环境缺 workspace 导致静默全禁），或保守关闭。
  if (ws === undefined) return opts.defaultOn ?? true
  return setting.workspaceIds().includes(ws)
}
