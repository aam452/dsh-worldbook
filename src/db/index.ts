import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

let db: DatabaseSync | undefined

export function openDb(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true })
  const instance = new DatabaseSync(join(dataDir, 'worldbook.db'))
  instance.exec('PRAGMA busy_timeout = 5000')
  instance.exec('PRAGMA journal_mode = WAL')
  instance.exec(readFileSync(join(import.meta.dirname, 'schema.sql'), 'utf8'))
  migrate(instance)
  db = instance
  return instance
}

// 轻量迁移：为老库补充缺失列（新表由 schema.sql 的 CREATE IF NOT EXISTS 保证）。
// 老库列名曾用 snake_case（keys/secondary_keys/selective_logic/insertion_order/enabled/case_sensitive/
// match_whole_words/scan_depth/exclude_recursion/prevent_recursion/use_probability/display_index），
// 现统一为 ST 字段名；enabled→disable 语义取反（ST disable=true 表示禁用）。
function migrate(instance: DatabaseSync): void {
  const renameCol = (table: string, from: string, to: string, invert?: boolean): void => {
    try {
      const cols = instance.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]
      const hasFrom = cols.some((c) => c.name === from)
      const hasTo = cols.some((c) => c.name === to)
      if (hasFrom && !hasTo) {
        instance.exec(`ALTER TABLE ${table} RENAME COLUMN "${from}" TO "${to}"`)
        if (invert) instance.exec(`UPDATE ${table} SET "${to}" = 1 - "${to}"`)
      }
    } catch {
      // 表不存在等场景忽略
    }
  }
  renameCol('worldbook_entries', 'keys', 'key')
  renameCol('worldbook_entries', 'secondary_keys', 'keysecondary')
  renameCol('worldbook_entries', 'selective_logic', 'selectiveLogic')
  renameCol('worldbook_entries', 'insertion_order', 'order')
  renameCol('worldbook_entries', 'enabled', 'disable', true)
  renameCol('worldbook_entries', 'case_sensitive', 'caseSensitive')
  renameCol('worldbook_entries', 'match_whole_words', 'matchWholeWords')
  renameCol('worldbook_entries', 'scan_depth', 'scanDepth')
  renameCol('worldbook_entries', 'exclude_recursion', 'excludeRecursion')
  renameCol('worldbook_entries', 'prevent_recursion', 'preventRecursion')
  renameCol('worldbook_entries', 'use_probability', 'useProbability')
  renameCol('worldbook_entries', 'display_index', 'displayIndex')
  // ST 无 priority 字段：老库遗留列直接删除
  try {
    const cols = instance.prepare('PRAGMA table_info(worldbook_entries)').all() as unknown as { name: string }[]
    if (cols.some((c) => c.name === 'priority')) instance.exec('ALTER TABLE worldbook_entries DROP COLUMN priority')
  } catch {
    // 忽略（DROP COLUMN 依赖 SQLite 版本）
  }
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('worldbook db not opened')
  return db
}

export const now = () => new Date().toISOString()
export const uuid = () => randomUUID()

export function softDelete(table: string, id: string): void {
  getDb()
    .prepare(`UPDATE ${table} SET is_deleted=1, deleted_at=?, updated_at=? WHERE id=?`)
    .run(now(), now(), id)
}

// 查询工具：只取未删除行
export function activeWhere(table: string): string {
  return `is_deleted=0`
}
