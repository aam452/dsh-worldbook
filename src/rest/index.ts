import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import * as worldbook from '../data/worldbook.js'
import * as setting from '../data/setting.js'
import { lastCompatReport } from '../compat.js'
import { agentRpDiagnostic } from '../compat/agent-rp/diagnostic.js'
import { syncDevTool } from '../tools/index.js'
import { assertBookDeletable, notifyBookDeleted, syncOperations } from '../integration/operations.js'
import { syncAgentRpCompat } from '../compat/agent-rp/index.js'
import { WORLDBOOK_CHARACTER_BOOKS_KEY, type WorldbookCharacterBooks } from '../integration/protocol.js'

const PREFIX = '/api/worldbook'

export function registerRest(ctx: Context): void {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return

  ctx.effect(
    () =>
      webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: (req: IncomingMessage, res: ServerResponse) => {
          if (!isLocalOrigin(req)) {
            res.writeHead(403)
            res.end('forbidden')
            return
          }
          route(ctx, req, res).catch((err) => {
            const message = err instanceof Error ? err.message : String(err)
            console.error('[dsh-worldbook-rest]', message)
            json(res, 200, { success: false, message })
          })
        },
      }),
    'worldbook: rest route',
  )
}

// ── 路由分派 ─────────────────────────────────────────────────────────────
async function route(ctx: Context, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  const seg = pathname.slice(PREFIX.length).split('/').filter(Boolean)
  const method = (req.method ?? 'GET').toUpperCase()

  // GET /compat → 最近一次重复注入检测结果
  if (seg[0] === 'compat' && method === 'GET') {
    return ok(res, lastCompatReport())
  }

  // GET /compat/agent-rp → agent-rp 兼容诊断（开关状态 + 每个 agent-rp 会话本插件看到了什么）
  if (seg[0] === 'compat' && seg[1] === 'agent-rp' && method === 'GET') {
    return ok(res, agentRpDiagnostic())
  }

  if (seg[0] === 'character-books' && method === 'GET') {
    if (!setting.compatEnabled()) return ok(res, [])
    const requestedSessionId = new URL(req.url ?? '/', 'http://x').searchParams.get('sessionId') ?? undefined
    let provider: WorldbookCharacterBooks | undefined
    try { provider = ctx.get(WORLDBOOK_CHARACTER_BOOKS_KEY) as WorldbookCharacterBooks | undefined } catch { provider = undefined }
    try { return ok(res, typeof provider?.list === 'function' && requestedSessionId !== undefined ? provider.list(requestedSessionId) : []) } catch { return ok(res, []) }
  }

  // 世界书（全局共享，不绑会话；作用域随插件工作区生效范围）
  if (seg[0] === 'worldbooks') {
    // GET /worldbooks → 列表（含条目数）
    if (method === 'GET' && seg[1] === undefined) {
      return ok(res, worldbook.list().map(worldbook.toBookView))
    }
    // POST /worldbooks { name, description? } → 新建空本（默认不启用）
    if (method === 'POST' && seg[1] === undefined) {
      const body = (await readJson(req)) ?? {}
      const name = typeof body.name === 'string' && body.name.trim() !== '' ? body.name.trim() : '未命名世界书'
      const row = worldbook.create(name, { description: typeof body.description === 'string' ? body.description : undefined })
      return ok(res, worldbook.toBookView(row))
    }
    // PUT /worldbooks/:id { name?|description?|enabled?|scanDepth? } → 更新/切换启用
    if (seg[1] && method === 'PUT' && seg[2] === undefined) {
      const body = (await readJson(req)) ?? {}
      const patch: Parameters<typeof worldbook.update>[1] = {}
      if (typeof body.name === 'string') patch.name = body.name
      if (body.description !== undefined) patch.description = body.description === null ? null : String(body.description)
      if (body.enabled !== undefined) patch.enabled = body.enabled === true || body.enabled === 'true'
      if (body.scanDepth !== undefined) patch.scanDepth = body.scanDepth === null ? null : Number(body.scanDepth)
      const row = worldbook.update(seg[1], patch)
      if (!row) return notFound(res, '世界书不存在')
      return ok(res, worldbook.toBookView(row))
    }
    // POST /worldbooks/:id/import → ST JSON 导入，覆盖替换全部条目
    if (seg[1] && seg[2] === 'import' && method === 'POST') {
      const body = (await readJson(req)) ?? {}
      const bookWorld = worldbook.get(seg[1])
      if (!bookWorld) return notFound(res, '世界书不存在')
      const entriesJson = body.json
      if (typeof entriesJson !== 'string') return json(res, 400, { success: false, message: '缺少世界书 JSON 内容' })
      let parsed
      try {
        parsed = worldbook.parseStWorldJson(entriesJson)
      } catch (e) {
        return json(res, 400, { success: false, message: `导入失败：${(e as Error).message}` })
      }
      worldbook.replaceEntries(seg[1], parsed.entries)
       if (body.name !== undefined) worldbook.update(seg[1], { name: String(body.name) })
      if (parsed.scanDepth !== undefined) worldbook.update(seg[1], { scanDepth: parsed.scanDepth })
      return ok(res, worldbook.toBookView(worldbook.get(seg[1])!))
    }
    // GET /worldbooks/:id/entries?q=&sort=&order=&page=&pageSize= → 条目列表（分页/搜索/排序）
    if (seg[1] && seg[2] === 'entries' && !seg[3] && method === 'GET') {
      const bookWorld = worldbook.get(seg[1])
      if (!bookWorld) return notFound(res, '世界书不存在')
      const qs = new URLSearchParams(req.url?.split('?')[1] ?? '')
      const q = (qs.get('q') ?? '').trim()
      const sort = qs.get('sort') ?? 'custom'
      const order = qs.get('order') ?? 'asc'
      const page = Math.max(1, Number(qs.get('page')) || 1)
      const pageSize = Math.min(200, Math.max(1, Number(qs.get('pageSize')) || 50))
       const result = worldbook.entryPage(seg[1], { query: q, sort, order, page, pageSize })
       const items = result.rows.map((row, i) => {
         const v = worldbook.toEntryView(row)
         const keysNote = v.key.length > 0 ? v.key.join('、') : '(无触发词)'
         const stateName = v.constant ? '常驻' : v.vectorized ? '向量' : v.disable ? '禁用' : '普通'
         return {
          ...v,
          digest: `${keysNote} [${stateName}] ${v.content.slice(0, 120)}`,
           uid: (page - 1) * pageSize + i,
         }
       })
       return ok(res, { total: result.total, page, pageSize, items })
    }
    // GET /worldbooks/:id/entries/ids → 全选当前世界书条目，仅返回 ID，不参与列表渲染
    if (seg[1] && seg[2] === 'entries' && seg[3] === 'ids' && method === 'GET') {
      if (!worldbook.get(seg[1])) return notFound(res, '世界书不存在')
      return ok(res, { ids: worldbook.entryIds(seg[1]) })
    }
    // POST /worldbooks/:id/entries { entry?: {...} } → 在末尾新增一条（无 JSON 时插入空条目）
    if (seg[1] && seg[2] === 'entries' && method === 'POST') {
      const bookWorld = worldbook.get(seg[1])
      if (!bookWorld) return notFound(res, '世界书不存在')
      const body = (await readJson(req)) ?? {}
      const row = worldbook.addEntry(seg[1], body.entry as Record<string, unknown> | undefined)
      return ok(res, worldbook.toEntryItem(row))
    }
    // PUT /worldbooks/:id/entries/reorder { orderedIds: string[] } → ST Custom 拖拽排序（按数组顺序重写 display_index）
    if (seg[1] && seg[2] === 'entries' && seg[3] === 'reorder' && method === 'PUT') {
      const body = (await readJson(req)) ?? {}
      const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.filter((x): x is string => typeof x === 'string') : []
      worldbook.reorderEntries(seg[1], orderedIds)
      return ok(res, { reordered: orderedIds.length })
    }
    // PUT /worldbooks/:id/entries/:eid → 更新一条条目
    if (seg[1] && seg[2] === 'entries' && seg[3] && method === 'PUT') {
      const body = (await readJson(req)) ?? {}
      const row = worldbook.updateEntry(seg[1], seg[3], body)
      if (!row) return notFound(res, '条目不存在')
      return ok(res, worldbook.toEntryItem(row))
    }
    // DELETE /worldbooks/:id/entries/:eid → 删除一条条目
    if (seg[1] && seg[2] === 'entries' && seg[3] && method === 'DELETE') {
      const okRow = worldbook.getEntry(seg[1], seg[3])
      if (!okRow) return notFound(res, '条目不存在')
      worldbook.removeEntry(seg[1], seg[3])
      return ok(res, { deleted: true })
    }
    // GET /worldbooks/:id/export → 导出为 ST 世界书 JSON（下载）
    if (seg[1] && seg[2] === 'export' && method === 'GET') {
      const bookWorld = worldbook.get(seg[1])
      if (!bookWorld) return notFound(res, '世界书不存在')
      return ok(res, { name: bookWorld.name, json: worldbook.toStWorldJson(seg[1]) })
    }
    // DELETE /worldbooks/:id → 删除（含条目）
    if (seg[1] && method === 'DELETE') {
      const exists = worldbook.get(seg[1])
      if (exists) assertBookDeletable(exists)
      worldbook.remove(seg[1])
      if (exists) notifyBookDeleted(exists)
      return ok(res, { deleted: true })
    }
  }

  // 设置（插件启用开关 + 工作区作用域 + 主题 + 开发模式）
  if (seg[0] === 'settings') {
    if (method === 'GET') return ok(res, settingAll())
    if (method === 'PUT') {
      const body = (await readJson(req)) ?? {}
      const current = setting.settings()
      const next = { ...current, ...body } as setting.SettingsDocument
      const saved = setting.saveSettings(next)
      // 开发模式开关变化时同步工具注册（开则暴露 schema，关则注销）
      syncDevTool(ctx)
      // 操作接口开关变化时同步服务注册（开则 provide，关则注销）
      syncOperations(ctx)
      // agent-rp 兼容开关变化时同步挂载/卸载适配
      syncAgentRpCompat(ctx)
      return ok(res, saved)
    }
  }

  notFound(res, '未找到路由: ' + pathname)
}

function settingAll(): setting.SettingsDocument {
  return setting.settings()
}

// ── 辅助 ────────────────────────────────────────────────────────────────
function ok(res: ServerResponse, data: unknown): void {
  json(res, 200, { success: true, data })
}

function notFound(res: ServerResponse, message: string): void {
  json(res, 200, { success: false, message })
}

function json(res: ServerResponse, code: number, body: unknown): void {
  const buf = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(buf)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const raw = (await readRaw(req)).toString('utf8').trim()
  if (raw === '') return undefined
  try {
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

async function readRaw(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer))
  }
  return Buffer.concat(chunks)
}

function isLocalOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
}
