import { getDb, now, uuid } from '../db/index.js'

export function get(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=? AND is_deleted=0 LIMIT 1').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function getAll(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings WHERE is_deleted=0').all() as { key: string; value: string }[]
  const out: Record<string, string> = {}
  for (const row of rows) out[row.key] = row.value
  return out
}

export function set(key: string, value: string, category = 'general'): void {
  const db = getDb()
  const t = now()
  const existing = db.prepare('SELECT id FROM settings WHERE key=? AND is_deleted=0').get(key) as { id: string } | undefined
  if (existing) {
    db.prepare('UPDATE settings SET value=?, category=?, updated_at=?, updated_by=? WHERE id=?').run(value, category, t, 'user', existing.id)
  } else {
    db.prepare('INSERT INTO settings (id, key, value, category, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at) VALUES (?,?,?,?,?,?,?,?,0,NULL)')
      .run(uuid(), key, value, category, t, t, 'user', 'user')
  }
}

// ── 注入时机 ──
// 'every-step' = 每轮（每个 step，含工具调用后的思考）都注入；
// 'per-turn' = 正文注入，一次 turn 只注入一次（在 turn 的第一个 step 注入）。
export type InjectMode = 'every-step' | 'per-turn'

export function injectMode(): InjectMode {
  return get('injectMode') === 'every-step' ? 'every-step' : 'per-turn'
}

export function setInjectMode(value: InjectMode): void {
  set('injectMode', value === 'every-step' ? 'every-step' : 'per-turn', 'general')
}

// 抑制其它世界书插件注入：开启后，注入引擎在每轮把「其它插件（非 dsh-worldbook）的 instructions 注入消息」过滤掉，
// 避免与 prompt-manager / LorebookMD 等世界书插件重复注入。
export function suppressOtherWorldbook(): boolean {
  return get('suppressOtherWorldbook') === 'true'
}

export function setSuppressOtherWorldbook(value: boolean): void {
  set('suppressOtherWorldbook', value ? 'true' : 'false', 'general')
}

// ── 插件启用开关 ──
export function enabled(): boolean {
  return get('enabled') !== 'false'
}

export function setEnabled(value: boolean): void {
  set('enabled', value ? 'true' : 'false', 'general')
}

// ── 主题 ──
// 'dsh' = 跟随 dsh 主题（默认）；'pink' = 独立粉色主题
export function theme(): string {
  return get('theme') ?? 'dsh'
}

export function setTheme(value: string): void {
  set('theme', value === 'pink' ? 'pink' : 'dsh', 'theme')
}

// ── 开发世界书模式 ──
// 开启后暴露 worldbook 编辑工具给 AI（AI 可直接写 ST 格式世界书）。
export function devMode(): boolean {
  return get('devMode') === 'true'
}

export function setDevMode(value: boolean): void {
  set('devMode', value ? 'true' : 'false', 'general')
}

// 开发模式动作：create=新建（AI 可新建世界书并编辑全部条目）；edit=编辑（AI 编辑指定世界书的指定条目）
export function devAction(): 'create' | 'edit' {
  return get('devAction') === 'edit' ? 'edit' : 'create'
}

export function setDevAction(value: 'create' | 'edit'): void {
  set('devAction', value, 'general')
}

export function devBookId(): string {
  return get('devBookId') ?? ''
}

export function setDevBookId(value: string): void {
  set('devBookId', value, 'general')
}

export function devEntryIds(): string[] {
  try {
    const raw = get('devEntryIds')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function setDevEntryIds(value: string[]): void {
  set('devEntryIds', JSON.stringify(Array.from(new Set(value))), 'general')
}

// AI 工具权限：增=create（增条目）删=delete（删条目）改=update（改条目）查=read（读取）
export type DevPerm = 'create' | 'delete' | 'update' | 'read'

const ALL_PERMS: DevPerm[] = ['create', 'delete', 'update', 'read']

export function devPerms(): DevPerm[] {
  try {
    const raw = get('devPerms')
    if (!raw) return ALL_PERMS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is DevPerm => ALL_PERMS.includes(x as DevPerm)) : ALL_PERMS
  } catch {
    return ALL_PERMS
  }
}

export function setDevPerms(value: DevPerm[]): void {
  const allowed: DevPerm[] = ['create', 'delete', 'update', 'read']
  set('devPerms', JSON.stringify(Array.from(new Set(value)).filter((x): x is DevPerm => allowed.includes(x))), 'general')
}

// ── 工作区作用域 ──
export type WorkspaceMode = 'all' | 'selected'

export function workspaceMode(): WorkspaceMode {
  return get('workspaceMode') === 'selected' ? 'selected' : 'all'
}

export function workspaceIds(): string[] {
  try {
    const raw = get('workspaceIds')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function setWorkspaceScope(mode: WorkspaceMode, ids: string[]): void {
  set('workspaceMode', mode, 'general')
  set('workspaceIds', JSON.stringify(Array.from(new Set(ids))), 'general')
}

// 判定：给定当前所在工作区 id，插件是否在该工作区生效。
// 规则：总开关关闭 → 全局失效；开启后按 全部/指定 工作区过滤。
export function isActive(workspaceId: string | undefined): boolean {
  if (!enabled()) return false
  const mode = workspaceMode()
  if (mode === 'all') return true
  return workspaceId !== undefined && workspaceIds().includes(workspaceId)
}
