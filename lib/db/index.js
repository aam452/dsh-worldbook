import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
let db;
export function openDb(dataDir) {
    mkdirSync(dataDir, { recursive: true });
    const instance = new DatabaseSync(join(dataDir, 'worldbook.db'));
    instance.exec('PRAGMA busy_timeout = 5000');
    instance.exec('PRAGMA journal_mode = WAL');
    instance.exec(readFileSync(join(import.meta.dirname, 'schema.sql'), 'utf8'));
    migrate(instance);
    db = instance;
    return instance;
}
// 轻量迁移：为老库补充缺失列（新表由 schema.sql 的 CREATE IF NOT EXISTS 保证）
function migrate(instance) {
    const addCol = (table, col, ddl) => {
        try {
            const cols = instance.prepare(`PRAGMA table_info(${table})`).all();
            if (!cols.some((c) => c.name === col))
                instance.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
        }
        catch {
            // 表不存在等场景忽略
        }
    };
    // ST 自定义排序序数（extensions.display_index）
    addCol('worldbook_entries', 'display_index', 'display_index INTEGER NOT NULL DEFAULT 0');
}
export function getDb() {
    if (!db)
        throw new Error('worldbook db not opened');
    return db;
}
export const now = () => new Date().toISOString();
export const uuid = () => randomUUID();
export function softDelete(table, id) {
    getDb()
        .prepare(`UPDATE ${table} SET is_deleted=1, deleted_at=?, updated_at=? WHERE id=?`)
        .run(now(), now(), id);
}
// 查询工具：只取未删除行
export function activeWhere(table) {
    return `is_deleted=0`;
}
