// 世界书主题的同步缓存：主题是后端异步设置，React 首帧拿不到，
// 靠这个缓存让首帧直接用上次的值，避免「先粉色、再切 dsh」的闪烁。
export type WorldbookTheme = 'pink' | 'dsh'

const CACHE_KEY = 'dsh-worldbook-theme'
const MISSING = Symbol('missing')

let cached: WorldbookTheme | typeof MISSING = MISSING

function normalize(v: unknown): WorldbookTheme {
  return v === 'pink' ? 'pink' : 'dsh'
}

export function readThemeCache(): WorldbookTheme {
  if (cached !== MISSING) return cached
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null
    cached = normalize(raw)
  } catch {
    cached = 'pink'
  }
  return cached
}

export function writeThemeCache(v: WorldbookTheme): void {
  cached = normalize(v)
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CACHE_KEY, cached)
  } catch {
    // 缓存不可写时忽略，仍以内存值支撑本次会话
  }
}
