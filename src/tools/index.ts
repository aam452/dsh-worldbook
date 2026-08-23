import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import * as worldbook from '../data/worldbook.js'
import * as setting from '../data/setting.js'
import { assertBookDeletable, notifyBookDeleted } from '../integration/operations.js'

export const inject = ['tools']

const text = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]

// defineTool 的开放对象 output schema 要求返回 Record<string, JsonValue>；
// 业务层返回值是 lossless JSON，仅在此边界做类型收窄。
const j = <T>(v: T): Record<string, JsonValue> => v as unknown as Record<string, JsonValue>

// 工具守卫：开发世界书模式关闭时拒绝调用。只暴露接口，不提供任何「怎么写世界书」的提示词。
function devGuard(): Record<string, JsonValue> | undefined {
  if (setting.devMode()) return undefined
  return { ok: false, error_type: 'dev_mode_disabled', message: '开发世界书模式未开启（在插件设置 → 设置 → 开发世界书模式中打开）。' }
}

// 编辑作用域约束（读设置）：
// - 编辑模式：AI 只能操作指定世界书（devBookId）的指定条目（devEntryIds 非空 = 白名单；空 = 全部已有条目）。
// - 新建模式：AI 只能新建世界书并编辑其全部条目（不允许改已有世界书）。
// - AI 权限（devPerms）：增=create 删=delete 改=update 查=read，未授权则拒绝。
// 新建模式的归属持久化在 SQLite，Survives plugin re-registration & session restarts。
//
// 所有 guard 返回值附加 error_type，便于 AI 区分失败原因（权限不足 / 超出作用域 / 资源缺失 / 格式错误）。

function guardResult(errorType: string, message: string): Record<string, JsonValue> {
  return { ok: false, error_type: errorType, message }
}

const ACTION_PERM: Record<string, setting.DevPerm> = {
  list_books: 'read',
  list_entries: 'read',
  export_book: 'read',
  create_book: 'create',
  create_entry: 'create',
  update_entry: 'update',
  delete_entry: 'delete',
  delete_book: 'delete',
}

export function scopeGuard(args: Record<string, unknown>): Record<string, JsonValue> | undefined {
  const action = String(args.action ?? '')
  // 编辑模式下当前选中的书就是工具的默认目标；模型无需重复猜测或询问书名。
  // 全域模式下 bookId 必须由 AI 显式提供。
  const devAction = setting.devAction()
  const bookId = typeof args.bookId === 'string' && args.bookId !== ''
    ? args.bookId
    : devAction === 'edit' ? setting.devBookId() : ''

  // AI 权限
  const need = ACTION_PERM[action]
  if (need && !setting.devPerms().includes(need)) {
    return guardResult('permission_denied', `AI 没有「${need}」权限（插件设置 → 开发模式 → AI 权限中勾选后生效）。`)
  }

  if (action === 'list_available') {
    return undefined
  }

  // 全域模式：跳过 bookId / entryId 作用域限制，仅遵守 devPerms 权限
  if (devAction === 'global') {
    // 仍然需要校验 bookId 是否存在（对编辑/删除操作）
    if (action === 'create_entry' || action === 'update_entry' || action === 'delete_entry' || action === 'delete_book' || action === 'list_entries' || action === 'export_book') {
      const book = bookId ? worldbook.get(bookId) : null
      if (!book) {
        return guardResult('not_found', `bookId ${bookId || '""'} 对应的世界书不存在，请先用 list_books 确认，或用 create_book 新建。`)
      }
    }
    return undefined
  }

  if (devAction === 'edit') {
    const allowedBook = setting.devBookId()
    if (!allowedBook && action !== 'list_books') {
      return guardResult('scope_denied', '编辑模式尚未选择允许操作的世界书（插件设置 → 开发模式 → 编辑模式 → 选择世界书）。')
    }
    if (allowedBook && bookId !== allowedBook && action !== 'list_books') {
      return guardResult('scope_denied', `编辑模式仅允许操作世界书 ${allowedBook}，目标 ${bookId} 不在允许范围。请在设置中更换当前编辑世界书，或切换到「新建」模式。`)
    }
    const allowedEntries = setting.devEntryIds()
    if (allowedEntries.length > 0 && (action === 'update_entry' || action === 'delete_entry')) {
      const entryId = typeof args.entryId === 'string' ? args.entryId : ''
      if (!entryId || !allowedEntries.includes(entryId)) {
        return guardResult('entry_not_whitelisted', `条目 ${entryId} 不在允许编辑的条目白名单内（${allowedEntries.join(', ')}）。请在 list_entries 返回的 allowed_entries 中选择，或清空条目白名单以编辑全部条目。`)
      }
    }
    if (action === 'create_book') {
      return guardResult('action_blocked', '编辑模式不允许新建世界书（需在设置中切换到「新建」模式）。')
    }
  } else {
    // 新建模式：不允许编辑已有世界书（但允许读取）
    if (bookId && (action === 'create_entry' || action === 'update_entry' || action === 'delete_entry' || action === 'delete_book')) {
      if (setting.devCreatedBooks().has(bookId)) {
        return undefined
      }
      // 区分「格式不合法」、「不存在」、「已有世界书」
      if (typeof bookId !== 'string' || bookId.length > 36) {
        return guardResult('invalid_id', 'bookId 格式不合法，请使用 list_books 返回的 UUID。')
      }
      const book = worldbook.get(bookId)
      if (!book) {
        return guardResult('not_found', `bookId ${bookId} 对应的世界书不存在，请先用 list_books 确认，或用 create_book 新建。`)
      }
      return guardResult('scope_denied', `新建模式只能编辑自己新建的世界书，不允许修改已有世界书 ${book.name || bookId}（id=${bookId}）。`)
    }
  }
  return undefined
}

// 条目可写字段（ST 全语义；工具只声明可操作的字段名，不指导如何组织内容）
const ENTRY_FIELDS = {
  key: { type: 'array', items: { type: 'string' }, description: '触发关键词（主键）。正则表达式以 / 开头结尾。' },
  keysecondary: { type: 'array', items: { type: 'string' }, description: '副关键词。' },
  comment: { type: 'string', description: '条目标题/备注。' },
  content: { type: 'string', description: '条目内容（注入模型上下文的文本）。' },
  constant: { type: 'boolean', description: '常驻：无条件始终注入。' },
  selective: { type: 'boolean', description: '选择性：需结合副关键词。' },
  selectiveLogic: { type: 'integer', enum: [0, 1, 2, 3], description: '0=AND ANY 1=NOT ALL 2=NOT ANY 3=AND ALL' },
  order: { type: 'integer', description: '注入优先级（越大越优先，list_entries 返回该字段名）。' },
  position: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6, 7] as readonly number[], description: '注入位置（ST position 枚举：0=before_char 1=after_char 4=@D；list_entries 返回为数字）。' },
  disable: { type: 'boolean', description: '是否禁用该条目（ST disable 字段，true=禁用）。' },
  vectorized: { type: 'boolean', description: '向量化。' },
  group: { type: 'string', description: '所属分组（组内按 order 胜出）。' },
  groupOverride: { type: 'boolean', description: '组内强制覆盖。' },
  groupWeight: { type: 'integer', description: '组权重。' },
  role: { type: 'integer', enum: [0, 1, 2], description: '@D 位置角色：0=系统 1=用户 2=AI。' },
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
} as const satisfies Record<string, { type: 'string' | 'boolean' | 'integer' | 'array'; items?: { type: 'string' }; enum?: readonly (string | number)[]; description?: string }>

function pick<T extends Record<string, unknown>>(args: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (args[k] !== undefined) out[k] = args[k]
  return out
}

let disposeTool: (() => void) | null = null

// 工具定义：开发模式专用，仅当设置开启时注册（关闭时不暴露 schema 给模型）。
const worldbookTool = defineTool({
  name: 'worldbook_edit',
  description:
    '世界书（World Info）编辑工具：管理世界书与条目。开发模式专用，仅当插件设置开启「开发世界书模式」时可用。' +
       '提供 worldbook/list_books、list_entries、list_available、create_book、create_entry、update_entry、delete_entry、delete_book、export_book 九类操作。' +
       'list_available=查询当前权限与作用域摘要；三种模式：create=新建（仅编辑自己创建的书）、edit=编辑（仅编辑指定书/条目）、global=全域（编辑全部书/条目，遵守 AI 权限）。' +
       '返回 JSON，字段对齐 SillyTavern World Info 格式。编辑模式下 bookId 可省略，默认操作设置中选定的世界书。',
   parameters: {
     action: {
       type: 'string',
       required: true,
       enum: ['list_books', 'list_entries', 'list_available', 'create_book', 'create_entry', 'update_entry', 'delete_entry', 'delete_book', 'export_book'],
       description: 'list_books=列出全部世界书；list_entries=列出某世界书条目；list_available=查询当前权限与作用域；create_book=新建世界书；create_entry=在某世界书下新增条目；update_entry=更新条目；delete_entry=删除条目；delete_book=删除世界书及其条目；export_book=导出世界书为 ST JSON。',
     },
    bookId: { type: 'string', description: '世界书 id（list_books 返回）。编辑模式可省略，默认使用设置中已选的世界书。' },
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
    const bookId = typeof args.bookId === 'string' && args.bookId !== ''
      ? args.bookId
      : setting.devAction() === 'edit' ? setting.devBookId() : ''

    if (action === 'list_books') {
      // 编辑模式只向 AI 暴露设置页选中的世界书，避免模型从全局列表中自行猜目标。
      const books = setting.devAction() === 'edit'
        ? (setting.devBookId() ? [worldbook.get(setting.devBookId())].filter((book): book is NonNullable<typeof book> => book !== null) : [])
        : worldbook.list()
      return j({ books: books.map(worldbook.toBookView) })
    }

    if (action === 'list_available') {
      const devMode = setting.devMode()
      const devAction = setting.devAction()
      const allowedBook = setting.devBookId()
      const allowedEntries = setting.devEntryIds()
      const perms = setting.devPerms()
      const entryCount = allowedBook ? worldbook.entries(allowedBook).length : 0
      return j({
        devMode,
        devAction,
        devBookId: allowedBook,
        devEntryIds: allowedEntries,
        devCreatedBooks: Array.from(setting.devCreatedBooks()),
        devPerms: perms,
        currentBook: allowedBook
          ? { id: allowedBook, name: worldbook.get(allowedBook)?.name ?? null, total_entries: entryCount, allowed_entries: allowedEntries.length }
          : null,
        message: !devMode
          ? '开发模式未开启，无法编辑世界书。'
          : devAction === 'global'
            ? '全域模式：可编辑全部世界书及条目（遵守 AI 权限）。'
            : devAction === 'edit' && !allowedBook
            ? '编辑模式尚未选择允许操作的世界书。'
            : devAction === 'edit' && allowedEntries.length > 0
              ? `编辑模式：当前可编辑世界书 ${allowedBook}，条目白名单限制为 ${allowedEntries.length} 个条目。`
              : devAction === 'create'
                ? `新建模式：可新建世界书并编辑已创建的世界书（${Array.from(setting.devCreatedBooks()).length} 本）。`
                : null,
      })
    }

    if (action === 'list_entries') {
      if (!bookId) throw new Error('action=list_entries 需要 bookId')
      const allowedEntries = setting.devAction() === 'edit' ? setting.devEntryIds() : []
      const entries = worldbook.entries(bookId)
      const visibleEntries = allowedEntries.length > 0
        ? entries.filter((entry) => allowedEntries.includes(entry.id))
        : entries
      return j({
        entries: visibleEntries.map((r) => worldbook.toEntryView(r)),
        total_entries: entries.length,
        allowed_entries: allowedEntries.length > 0 ? allowedEntries.length : entries.length,
        entry_whitelist: allowedEntries.length > 0 ? allowedEntries : null,
      })
    }

    if (action === 'create_book') {
      const name = typeof args.name === 'string' && args.name.trim() !== '' ? args.name.trim() : '未命名世界书'
      const row = worldbook.create(name, { description: typeof args.description === 'string' ? args.description : undefined })
      if (setting.devAction() === 'create') {
        // 新建模式下，仅保留最近创建的一本世界书为可编辑；切换书籍时旧书失去编辑权限
        const prev = setting.devCreatedBooks()
        for (const id of prev) setting.removeDevCreatedBook(id)
        setting.addDevCreatedBook(row.id)
      }
      const entry = args.entry as Record<string, unknown> | undefined
      let entryRow = null
      if (entry && Object.keys(entry).length > 0) entryRow = worldbook.addEntry(row.id, entry)
      return j({ book: worldbook.toBookView(row), entry: entryRow ? worldbook.toEntryView(entryRow) : null })
    }

    if (action === 'create_entry') {
      if (!bookId) throw new Error('action=create_entry 需要 bookId')
      const entry = (args.entry as Record<string, unknown> | undefined) ?? {}
      const row = worldbook.addEntry(bookId, entry)
      return j({ entry: worldbook.toEntryView(row) })
    }

    if (action === 'update_entry') {
      if (!bookId || typeof args.entryId !== 'string') throw new Error('action=update_entry 需要 bookId 和 entryId')
      const patch = pick(args, ['name', 'description']) as Record<string, unknown>
      if (args.entry && typeof args.entry === 'object') {
        const e = args.entry as Record<string, unknown>
        for (const [k, v] of Object.entries(e)) patch[k] = v
      }
      const row = worldbook.updateEntry(bookId, args.entryId, patch)
      if (!row) return j({ ok: false, message: '条目不存在' })
      return j({ ok: true, entry: worldbook.toEntryView(row) })
    }

    if (action === 'delete_entry') {
      if (!bookId || typeof args.entryId !== 'string') throw new Error('action=delete_entry 需要 bookId 和 entryId')
      const exists = worldbook.getEntry(bookId, args.entryId)
      if (!exists) return j({ ok: false, message: '条目不存在' })
      worldbook.removeEntry(bookId, args.entryId)
      return j({ ok: true, deleted: true })
    }

    if (action === 'delete_book') {
      if (!bookId) throw new Error('action=delete_book 需要 bookId')
      const exists = worldbook.get(bookId)
      if (!exists) return j({ ok: false, message: '世界书不存在' })
      assertBookDeletable(exists)
      worldbook.remove(bookId)
      notifyBookDeleted(exists)
      setting.removeDevCreatedBook(bookId)
      return j({ ok: true, deleted: true })
    }

      if (action === 'export_book') {
        if (!bookId) throw new Error('action=export_book 需要 bookId')
        const book = worldbook.get(bookId)
        if (!book) return j({ ok: false, message: '世界书不存在' })
        return j({ name: book.name, json: worldbook.toStWorldJson(bookId) })
      }

      throw new Error('未知 action: ' + action)
    },
})
export function syncDevTool(ctx: Context): void {
  const tools = ctx.get('tools')
  if (tools === undefined) return
  const should = setting.devMode()
  if (should) {
    if (disposeTool === null) {
      // 过滤掉已删除的世界书，避免累积僵尸 bookId
      const created = setting.devCreatedBooks()
      for (const id of created) {
        if (!worldbook.get(id)) {
          setting.removeDevCreatedBook(id)
        }
      }
      disposeTool = tools.register(worldbookTool)
    }
  } else {
    if (disposeTool !== null) {
      disposeTool()
      disposeTool = null
      // 关闭时清空本轮创建记录，避免新旧会话串共享残留 bookId
      const created = setting.devCreatedBooks()
      for (const id of created) {
        setting.removeDevCreatedBook(id)
      }
    }
  }
}

export function apply(ctx: Context): void {
  syncDevTool(ctx)
}
