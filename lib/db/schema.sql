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

-- 条目对齐 ST entry（newWorldInfoEntryDefinition）的核心可编辑字段；ST 专属高级字段并入 raw 保留、导出还原。
CREATE TABLE IF NOT EXISTS worldbook_entries (
  id TEXT PRIMARY KEY,
  worldbook_id TEXT NOT NULL REFERENCES worldbooks(id),
  keys TEXT NOT NULL DEFAULT '[]',
  secondary_keys TEXT NOT NULL DEFAULT '[]',
  comment TEXT,
  content TEXT NOT NULL DEFAULT '',
  constant INTEGER NOT NULL DEFAULT 0,
  vectorized INTEGER NOT NULL DEFAULT 0,
  selective INTEGER NOT NULL DEFAULT 1,
  selective_logic INTEGER NOT NULL DEFAULT 0,
  insertion_order INTEGER NOT NULL DEFAULT 100,
  position INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER,
  case_sensitive INTEGER,
  match_whole_words INTEGER,
  scan_depth INTEGER,
  exclude_recursion INTEGER NOT NULL DEFAULT 0,
  prevent_recursion INTEGER NOT NULL DEFAULT 0,
  use_probability INTEGER,
  probability INTEGER NOT NULL DEFAULT 100,
  depth INTEGER NOT NULL DEFAULT 4,
  sticky INTEGER,
  cooldown INTEGER,
  delay INTEGER,
  display_index INTEGER NOT NULL DEFAULT 0,
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
