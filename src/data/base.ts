// JSON 列读写辅助（从 MindLink 项目移植，仅保留世界书所需函数）
export function parseJson<T = unknown>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value)
}
