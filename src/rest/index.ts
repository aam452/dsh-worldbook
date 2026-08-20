import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import * as worldbook from '../data/worldbook.js'
import * as setting from '../data/setting.js'

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
          route(req, res).catch((err) => {
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
async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  const seg = pathname.slice(PREFIX.length).split('/').filter(Boolean)
  const method = (req.method ?? 'GET').toUpperCase()

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
      if ((parsed.name && worldbook.get(seg[1])?.name === '未命名世界书') || (parsed.name && body.name === undefined)) {
        worldbook.update(seg[1], { name: parsed.name })
      }
      if (body.name !== undefined) worldbook.update(seg[1], { name: String(body.name) })
      if (parsed.scanDepth !== undefined) worldbook.update(seg[1], { scanDepth: parsed.scanDepth })
      return ok(res, worldbook.toBookView(worldbook.get(seg[1])!))
    }
    // GET /worldbooks/:id/entries?q=&sort=&order=&page=&pageSize= → 条目列表（分页/搜索/排序）
    if (seg[1] && seg[2] === 'entries' && method === 'GET') {
      const bookWorld = worldbook.get(seg[1])
      if (!bookWorld) return notFound(res, '世界书不存在')
      const qs = new URLSearchParams(req.url?.split('?')[1] ?? '')
      const q = (qs.get('q') ?? '').trim()
      const sort = qs.get('sort') ?? 'custom'
      const order = qs.get('order') ?? 'asc'
      const page = Math.max(1, Number(qs.get('page')) || 1)
      const pageSize = Math.min(200, Math.max(1, Number(qs.get('pageSize')) || 50))
      const all = worldbook.entries(seg[1])
      const rows = all
        .map((row, i) => ({ row, rowid: i }))
        .filter(({ row }) => {
          if (!q) return true
          const v = worldbook.toEntryView(row)
          const hay = [v.comment ?? '', v.content, ...v.keys, ...v.keysecondary].join('\n').toLowerCase()
          return hay.includes(q.toLowerCase())
        })
        .sort((a, b) => {
          const va = worldbook.toEntryView(a.row)
          const vb = worldbook.toEntryView(b.row)
          const sign = order === 'desc' ? -1 : 1
          let cmp = 0
          switch (sort) {
            case 'priority': {
              const pa = va.constant ? 0 : va.enabled ? 1 : 2
              const pb = vb.constant ? 0 : vb.enabled ? 1 : 2
              cmp = pa - pb
              break
            }
            case 'custom': cmp = va.displayIndex - vb.displayIndex; break
            case 'comment': cmp = (va.comment ?? '').localeCompare(vb.comment ?? ''); break
            case 'content': cmp = va.content.length - vb.content.length; break
            case 'depth': cmp = va.depth - vb.depth; break
            case 'order': cmp = va.insertionOrder - vb.insertionOrder; break
            case 'uid': cmp = a.rowid - b.rowid; break
            case 'probability': cmp = va.probability - vb.probability; break
            default: cmp = va.displayIndex - vb.displayIndex; break
          }
          return cmp === 0 ? sign * (va.insertionOrder - vb.insertionOrder) : sign * cmp
        })
        .map(({ row }) => row)
      const total = rows.length
      const paged = rows.slice((page - 1) * pageSize, page * pageSize)
      const items = paged.map((row, i) => ({
        ...worldbook.toEntryItem(row),
        uid: (page - 1) * pageSize + i,
      }))
      return ok(res, { total, page, pageSize, items })
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
      worldbook.remove(seg[1])
      return ok(res, { deleted: true })
    }
  }

  // 设置（插件启用开关 + 工作区作用域）
  if (seg[0] === 'settings') {
    if (method === 'GET') return ok(res, settingAll())
    if (method === 'PUT') {
      const body = (await readJson(req)) ?? {}
      for (const [key, value] of Object.entries(body)) {
        if (key === 'enabled') setting.setEnabled(value === true || value === 'true')
        else if (key === 'workspaceMode') setting.setWorkspaceScope(value === 'selected' ? 'selected' : 'all', setting.workspaceIds())
        else if (key === 'workspaceIds') setting.setWorkspaceScope(setting.workspaceMode(), Array.isArray(value) ? (value as unknown[]).filter((x): x is string => typeof x === 'string') : [])
      }
      return ok(res, settingAll())
    }
  }

  notFound(res, '未找到路由: ' + pathname)
}

function settingAll(): Record<string, string> {
  const s = setting.getAll()
  return {
    enabled: setting.enabled() ? 'true' : 'false',
    workspaceMode: setting.workspaceMode(),
    workspaceIds: s.workspaceIds ?? '[]',
  }
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
