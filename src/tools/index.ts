import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import * as worldbook from '../data/worldbook.js'
import * as setting from '../data/setting.js'

export const inject = ['tools']

const text = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]

// defineTool 的开放对象 output schema 要求返回 Record<string, JsonValue>；
// 业务层返回值是 lossless JSON，仅在此边界做类型收窄。
const j = <T>(v: T): Record<string, JsonValue> => v as unknown as Record<string, JsonValue>

// 工具守卫：开发世界书模式关闭时拒绝调用。只暴露接口，不提供任何「怎么写世界书」的提示词。
function devGuard(): Record<string, JsonValue> | undefined {
  if (setting.devMode()) return undefined
  return { ok: false, message: '开发世界书模式未开启（在插件设置 → 设置 → 开发世界书模式中打开）。' }
}

// 编辑作用域约束（读设置）：
// - 编辑模式：AI 只能操作指定世界书（devBookId）的指定条目（devEntryIds 非空 = 白名单；空 = 全部条目）。
// - 新建模式：AI 只能新建世界书并编辑其全部条目（不允许改已有世界书）。
// - AI 权限（devPerms）：增=create 删=delete 改=update 查=read，未授权则拒绝。
const ACTION_PERM: Record<string, setting.DevPerm> = {
  list_books: 'read',
  list_entries: 'read',
  export_book: 'read',
  create_book: 'create',
  create_entry: 'create',
  update_entry: 'update',
  delete_entry: 'delete',
}

function scopeGuard(args: Record<string, unknown>): Record<string, JsonValue> | undefined {
  const action = String(args.action ?? '')
  const bookId = typeof args.bookId === 'string' ? args.bookId : ''

  // AI 权限
  const need = ACTION_PERM[action]
  if (need && !setting.devPerms().includes(need)) {
    return { ok: false, message: `AI 没有「${need}」权限（插件设置 → 开发模式 → AI 权限中勾选后生效）。` }
  }

  if (setting.devAction() === 'edit') {
    const allowedBook = setting.devBookId()
    if (allowedBook && bookId && bookId !== allowedBook) {
      return { ok: false, message: `编辑模式仅允许操作世界书 ${allowedBook}，目标 ${bookId} 不在允许范围。` }
    }
    const allowedEntries = setting.devEntryIds()
    if (allowedEntries.length > 0 && (action === 'update_entry' || action === 'delete_entry')) {
      const entryId = String(args.entryId ?? '')
      if (entryId && !allowedEntries.includes(entryId)) {
        return { ok: false, message: '该条目不在允许编辑的条目白名单内。' }
      }
    }
    if (action === 'create_book') {
      return { ok: false, message: '编辑模式不允许新建世界书（需在设置中切换到「新建」模式）。' }
    }
  } else {
    // 新建模式：不允许编辑已有世界书（但允许读取）
    if (bookId && (action === 'update_entry' || action === 'delete_entry')) {
      return { ok: false, message: '新建模式只能编辑自己新建的世界书，不允许修改已有世界书。' }
    }
  }
  return undefined
}

// 条目可写字段（ST 全语义；工具只声明可操作的字段名，不指导如何组织内容）
const ENTRY_FIELDS = {
  keys: { type: 'array', items: { type: 'string' }, description: '触发关键词（主键）。正则表达式以 / 开头结尾。' },
  keysecondary: { type: 'array', items: { type: 'string' }, description: '副关键词。' },
  comment: { type: 'string', description: '条目标题/备注。' },
  content: { type: 'string', description: '条目内容（注入模型上下文的文本）。' },
  constant: { type: 'boolean', description: '常驻：无条件始终注入。' },
  selective: { type: 'boolean', description: '选择性：需结合副关键词。' },
  selectiveLogic: { type: 'string', enum: ['0', '1', '2', '3'], description: '0=AND ANY 1=NOT ALL 2=NOT ANY 3=AND ALL' },
  insertionOrder: { type: 'integer', description: '注入优先级（越大越优先，list_entries 返回该字段名）。' },
  order: { type: 'integer', description: '注入优先级别名，等价于 insertionOrder（ST 导出字段名）。' },
  position: { type: 'string', enum: ['0', '1', '2', '3', '4', '5', '6', '7'], description: '注入位置（ST position 枚举，0=before_char 1=after_char 4=@D）。' },
  enabled: { type: 'boolean', description: '是否启用该条目。' },
  priority: { type: 'integer', description: '优先级（ST priority 字段，0-100，高优先级覆盖 order）。' },
  vectorized: { type: 'boolean', description: '向量化。' },
  group: { type: 'string', description: '所属分组（组内按 order 胜出）。' },
  groupOverride: { type: 'boolean', description: '组内强制覆盖。' },
  groupWeight: { type: 'integer', description: '组权重。' },
  role: { type: 'string', enum: ['0', '1', '2'], description: '@D 位置角色：0=系统 1=用户 2=AI。' },
  triggers: { type: 'array', items: { type: 'string' }, description: '触发器（高级字段）。' },
  caseSensitive: { type: 'boolean', description: '关键词是否区分大小写。' },
  matchWholeWords: { type: 'boolean', description: '整词匹配。' },
  scanDepth: { type: 'integer', description: '扫描深度（扫描最近 N 条消息，<=0 全扫）。' },
  excludeRecursion: { type: 'boolean', description: '递归轮跳过该条目。' },
  preventRecursion: { type: 'boolean', description: '命中但内容不进递归 buffer。' },
  delayUntilRecursion: { type: 'boolean', description: '延迟到递归层激活。' },
  probability: { type: 'integer', description: '命中概率（0-100）。' },
  useProbability: { type: 'boolean', description: '是否启用概率。' },
  depth: { type: 'integer', description: '深度（ST depth 字段）。' },
  sticky: { type: 'integer', description: '粘性（命中后 N 条消息内强制注入）。' },
  cooldown: { type: 'integer', description: '冷却（命中后 N 条消息内不再注入）。' },
  delay: { type: 'integer', description: '延迟（cursor < delay 时强制注入）。' },
} as const satisfies Record<string, { type: 'string' | 'boolean' | 'integer' | 'array'; items?: { type: 'string' }; enum?: readonly string[]; description?: string }>

function pick<T extends Record<string, unknown>>(args: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (args[k] !== undefined) out[k] = args[k]
  return out
}

export function apply(ctx: Context): void {
  const tools = ctx.get('tools')
  if (tools === undefined) return

  tools.register(defineTool({
    name: 'worldbook_edit',
    description:
      '世界书（World Info）编辑工具：管理世界书与条目。开发模式专用，仅当插件设置开启「开发世界书模式」时可用。' +
      '提供 worldbook/list_books、list_entries、create_book、create_entry、update_entry、delete_entry、export_book 七类操作。' +
      '返回 JSON，字段对齐 SillyTavern World Info 格式。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list_books', 'list_entries', 'create_book', 'create_entry', 'update_entry', 'delete_entry', 'export_book'],
        description: 'list_books=列出全部世界书；list_entries=列出某世界书条目；create_book=新建世界书；create_entry=在某世界书下新增条目；update_entry=更新条目；delete_entry=删除条目；export_book=导出世界书为 ST JSON。',
      },
      bookId: { type: 'string', description: '世界书 id（list_books 返回）' },
      entryId: { type: 'string', description: '条目 id（list_entries 返回）' },
      name: { type: 'string', description: '世界书名称（create_book 用）' },
      description: { type: 'string', description: '世界书描述' },
      entry: {
        type: 'object',
        additionalProperties: false,
        properties: ENTRY_FIELDS,
        description: '条目字段（create_entry/update_entry 用）。',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: text,
    },
    async execute(args: Record<string, unknown>) {
      const guard = devGuard()
      if (guard) return guard
      const scope = scopeGuard(args)
      if (scope) return scope
      const action = String(args.action ?? '')

      if (action === 'list_books') {
        return j({ books: worldbook.list().map(worldbook.toBookView) })
      }

      if (action === 'list_entries') {
        if (typeof args.bookId !== 'string') throw new Error('action=list_entries 需要 bookId')
        return j({ entries: worldbook.entries(args.bookId).map((r) => worldbook.toEntryView(r)) })
      }

      if (action === 'create_book') {
        const name = typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim() : '未命名世界书'
        const row = worldbook.create(name, { description: typeof args.description === 'string' ? args.description : undefined })
        const entry = args.entry as Record<string, unknown> | undefined
        let entryRow = null
        if (entry && Object.keys(entry).length > 0) entryRow = worldbook.addEntry(row.id, entry)
        return j({ book: worldbook.toBookView(row), entry: entryRow ? worldbook.toEntryView(entryRow) : null })
      }

      if (action === 'create_entry') {
        if (typeof args.bookId !== 'string') throw new Error('action=create_entry 需要 bookId')
        const entry = (args.entry as Record<string, unknown> | undefined) ?? {}
        const row = worldbook.addEntry(args.bookId, entry)
        return j({ entry: worldbook.toEntryView(row) })
      }

      if (action === 'update_entry') {
        if (typeof args.bookId !== 'string' || typeof args.entryId !== 'string') throw new Error('action=update_entry 需要 bookId 和 entryId')
        const patch = pick(args, ['name', 'description']) as Record<string, unknown>
        if (args.entry && typeof args.entry === 'object') {
          const e = args.entry as Record<string, unknown>
          for (const [k, v] of Object.entries(e)) patch[k] = v
        }
        const row = worldbook.updateEntry(args.bookId, args.entryId, patch)
        if (!row) return j({ ok: false, message: '条目不存在' })
        return j({ ok: true, entry: worldbook.toEntryView(row) })
      }

      if (action === 'delete_entry') {
        if (typeof args.bookId !== 'string' || typeof args.entryId !== 'string') throw new Error('action=delete_entry 需要 bookId 和 entryId')
        const exists = worldbook.getEntry(args.bookId, args.entryId)
        if (!exists) return j({ ok: false, message: '条目不存在' })
        worldbook.removeEntry(args.bookId, args.entryId)
        return j({ ok: true, deleted: true })
      }

      if (action === 'export_book') {
        if (typeof args.bookId !== 'string') throw new Error('action=export_book 需要 bookId')
        const book = worldbook.get(args.bookId)
        if (!book) return j({ ok: false, message: '世界书不存在' })
        return j({ name: book.name, json: worldbook.toStWorldJson(args.bookId) })
      }

      throw new Error('未知 action: ' + action)
    },
  }))
}
