CREATE TABLE IF NOT EXISTS worldbooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  scan_depth INTEGER,
  extensions TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user', updated_by TEXT NOT NULL DEFAULT 'user',
  is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT
);

-- 条目字段名对齐 SillyTavern 编辑器内部格式（newWorldInfoEntryDefinition）。
-- ST 专属高级字段并入 raw 保留、导出还原；order 为 SQL 保留字，SQL 中统一用双引号 "order"。
CREATE TABLE IF NOT EXISTS worldbook_entries (
  id TEXT PRIMARY KEY,
  worldbook_id TEXT NOT NULL REFERENCES worldbooks(id),
  key TEXT NOT NULL DEFAULT '[]',
  keysecondary TEXT NOT NULL DEFAULT '[]',
  comment TEXT,
  content TEXT NOT NULL DEFAULT '',
  constant INTEGER NOT NULL DEFAULT 0,
  vectorized INTEGER NOT NULL DEFAULT 0,
  selective INTEGER NOT NULL DEFAULT 1,
  selectiveLogic INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL DEFAULT 100,
  position INTEGER NOT NULL DEFAULT 0,
  disable INTEGER NOT NULL DEFAULT 0,
  caseSensitive INTEGER,
  matchWholeWords INTEGER,
  scanDepth INTEGER,
  excludeRecursion INTEGER NOT NULL DEFAULT 0,
  preventRecursion INTEGER NOT NULL DEFAULT 0,
  useProbability INTEGER,
  probability INTEGER NOT NULL DEFAULT 100,
  depth INTEGER NOT NULL DEFAULT 4,
  sticky INTEGER,
  cooldown INTEGER,
  delay INTEGER,
  displayIndex INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user', updated_by TEXT NOT NULL DEFAULT 'user',
  is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_worldbook_entries_book ON worldbook_entries(worldbook_id);
CREATE INDEX IF NOT EXISTS idx_worldbooks_active ON worldbooks(enabled);

-- 世界书跨轮状态：sticky/cooldown 生效区间（以「模型可见消息数」为时间游标，对齐 ST chat.length）
CREATE TABLE IF NOT EXISTS worldbook_timed_effects (
  book_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('sticky', 'cooldown')),
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (book_id, entry_id, type)
);
CREATE INDEX IF NOT EXISTS idx_wb_timed_book ON worldbook_timed_effects(book_id);

-- 插件设置：启用开关 + 工作区作用域
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT,
  category TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user', updated_by TEXT NOT NULL DEFAULT 'user',
  is_deleted INTEGER NOT NULL DEFAULT 0, deleted_at TEXT
);
