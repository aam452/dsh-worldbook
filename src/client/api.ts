export interface ApiResult<T> {
  success: boolean
  data?: T
  message?: string
  code?: string
}

export interface ApiErr {
  message?: string
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `/api/worldbook${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = (await res.json()) as ApiResult<T>
  if (!json.success) throw new Error(json.message || '请求失败')
  return json.data as T
}

// 数据变更广播（独立命名空间，避免与宿主插件冲突）
export const changed = () => window.dispatchEvent(new CustomEvent('dsh-worldbook-data-changed'))
export const onChanged = (fn: () => void) => {
  const handler = () => fn()
  window.addEventListener('dsh-worldbook-data-changed', handler)
  return () => window.removeEventListener('dsh-worldbook-data-changed', handler)
}
