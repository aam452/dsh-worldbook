import { createElement as h } from 'react'
import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { api, changed } from './api'
import { showAlert } from './wb-confirm.tsx'
import { writeThemeCache } from './wb-theme.ts'

export interface WorkItem {
  workspaceId: string
  title: string
  path: string
}

export interface WorkspacesService {
  list: {
    getSnapshot(): readonly { id?: string; workspaceId?: string; title?: string; path?: string }[]
    subscribe(fn: () => void): () => void
  }
}

interface SettingsRecord {
  enabled: string
  workspaceMode: string
  workspaceIds: string
  theme: string
  injectMode: string
  devMode: string
  devAction: string
  devBookId: string
  devEntryIds: string
  devPerms: string
}

interface StWorldBook {
  id: string
  name: string
  description: string | null
  enabled: boolean
  scanDepth: number | null
  entryCount: number
}

interface StWorldEntry {
  id: string
  comment: string | null
  content: string
  keys: string[]
  enabled: boolean
}

function mapWork(w: { id?: string; workspaceId?: string; title?: string; path?: string }): WorkItem {
  const wid = (w.workspaceId ?? w.id) as string
  return { workspaceId: wid, title: w.title ?? wid, path: w.path ?? '' }
}

// 条目多选卡片（memo：on 为布尔原始值，勾选单条目时其它卡片 props 不变，跳过重渲染）
const EntryCard = memo(function EntryCard({ entry, on, onToggle }: { entry: StWorldEntry; on: boolean; onToggle: (id: string) => void }) {
  return h('label', {
    className: 'wb-entry-card' + (on ? ' on' : ''),
    style: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderRadius: 10,
      border: '1px solid ' + (on ? 'var(--ml-pink-4)' : 'var(--ml-line)'),
      background: on ? 'var(--ml-pink-0)' : 'var(--ml-bg-card-solid)',
      minWidth: 0,
    },
  },
    h('input', {
      type: 'checkbox', className: 'wb-radio', style: { width: 16, height: 16, flex: 'none' },
      checked: on,
      onChange: () => onToggle(entry.id),
    }),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--ml-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.comment || entry.keys.join(', ') || '（无标题）'),
      h('div', { className: 'wb-meta', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (entry.content || '').slice(0, 40) || '（空内容）'),
    ),
  )
})

// 世界书插件设置表单：启用开关 + 工作区作用域 + 主题 + 开发模式（含 AI 权限）。
// variant='dialog'：模态框外壳（世界书页顶部「设置」按钮打开）；
// variant='card'：内嵌卡片外壳（宿主设置页内嵌，无关闭按钮）。表单逻辑两形态完全一致。
export function WorldbookSettingsDialog({ workspaces, onClose, variant = 'dialog' }: { workspaces?: WorkspacesService; onClose?: () => void; variant?: 'dialog' | 'card' }) {
  const [loaded, setLoaded] = useState<SettingsRecord | null>(null)
  const [editable, setEditable] = useState<SettingsRecord | null>(null)
  const [saved, setSaved] = useState(false)
  const [ws, setWs] = useState<WorkItem[]>([])

  useEffect(() => {
    api<SettingsRecord>('/settings').then(setLoaded).catch(() => setLoaded({ enabled: 'true', workspaceMode: 'all', workspaceIds: '[]', theme: 'dsh', injectMode: 'per-turn', devMode: 'false', devAction: 'create', devBookId: '', devEntryIds: '[]', devPerms: '["create","delete","update","read"]' }))
  }, [])

  useEffect(() => {
    if (loaded && editable === null) setEditable(loaded)
  }, [loaded, editable])

  useEffect(() => {
    if (!workspaces) return
    const read = () => {
      const snap = workspaces.list.getSnapshot()
      const arr = Array.isArray(snap) ? snap : ((snap && 'items' in snap ? (snap as { items?: unknown[] }).items : undefined) ?? [])
      setWs((arr as readonly unknown[]).filter((x): x is object => typeof x === 'object' && x !== null).map((x) => mapWork(x as { id?: string; workspaceId?: string; title?: string; path?: string })))
    }
    read()
    return workspaces.list.subscribe(read)
  }, [workspaces])

  const settings = editable ?? loaded ?? { enabled: 'true', workspaceMode: 'all', workspaceIds: '[]', theme: 'dsh', injectMode: 'per-turn', devMode: 'false', devAction: 'create', devBookId: '', devEntryIds: '[]', devPerms: '["create","delete","update","read"]' }
  const enabled = String(settings.enabled ?? '') !== 'false'
  const mode = settings.workspaceMode === 'selected' ? 'selected' : 'all'
  const theme = settings.theme === 'dsh' ? 'dsh' : 'pink'
  const injectMode = settings.injectMode === 'every-step' ? 'every-step' : 'per-turn'
  const devModeOn = String(settings.devMode ?? '') === 'true'
  const devAction = settings.devAction === 'edit' ? 'edit' : 'create'
  const devBookId = settings.devBookId ?? ''
  const selected: string[] = useMemo(() => {
    try {
      const raw = settings.workspaceIds
      if (!raw) return []
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.filter((x: unknown): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }, [settings.workspaceIds])
  const devEntries: string[] = useMemo(() => {
    try {
      const raw = settings.devEntryIds
      if (!raw) return []
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.filter((x: unknown): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }, [settings.devEntryIds])
  const devPerms: string[] = useMemo(() => {
    try {
      const raw = settings.devPerms
      if (!raw) return []
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p.filter((x: unknown): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }, [settings.devPerms])

  const [books, setBooks] = useState<StWorldBook[]>([])
  const [devBookEntries, setDevBookEntries] = useState<StWorldEntry[]>([])
  // 重复注入警告：检测到与本插件连续注入段内重复注入时显示红色横幅（5 秒）
  const [compatAlert, setCompatAlert] = useState<{ plugin: string; sample: string; count: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    let lastKey = ''
    const poll = () => {
      api<{ duplicated?: boolean; conflicts?: { plugin: string; sample: string; count: number }[]; checkedAt?: number }>('/compat').then((r) => {
        if (cancelled) return
        if (r?.duplicated && r.conflicts && r.conflicts.length > 0) {
          const key = r.checkedAt + '|' + r.conflicts[0].plugin
          if (key !== lastKey) {
            lastKey = key
            setCompatAlert(r.conflicts[0])
            setTimeout(() => { if (!cancelled) setCompatAlert(null) }, 5000)
          }
        }
      }).catch(() => { /* 轮询失败忽略 */ })
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])
  useEffect(() => {
    api<StWorldBook[]>('/worldbooks').then(setBooks).catch(() => setBooks([]))
  }, [])
  useEffect(() => {
    if (devAction !== 'edit' || !devBookId) { setDevBookEntries([]); return }
    api<{ total?: number; pageSize?: number; items?: StWorldEntry[] } | StWorldEntry[]>(`/worldbooks/${devBookId}/entries?pageSize=500`).then((r) => {
      const items = Array.isArray(r) ? r : (r?.items ?? [])
      setDevBookEntries(items)
    }).catch(() => setDevBookEntries([]))
  }, [devAction, devBookId])

  // 搜索框 state（世界书 / 条目）
  const [bookSearch, setBookSearch] = useState('')
  const [entrySearch, setEntrySearch] = useState('')
  const filteredBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase()
    if (!q) return books
    return books.filter((b) => b.name.toLowerCase().includes(q))
  }, [books, bookSearch])
  const filteredEntries = useMemo(() => {
    const q = entrySearch.trim().toLowerCase()
    if (!q) return devBookEntries
    return devBookEntries.filter((e) => (e.comment ?? '').toLowerCase().includes(q) || (e.content ?? '').toLowerCase().includes(q) || e.keys.join(' ').toLowerCase().includes(q))
  }, [devBookEntries, entrySearch])

  // 条目分页（前端分页；每页渲染当前页，避免大列表一次性渲染卡顿）
  const [entryPage, setEntryPage] = useState(1)
  const [entryPageSize, setEntryPageSize] = useState(20)
  const entryTotalPages = Math.max(1, Math.ceil(filteredEntries.length / entryPageSize))
  const currentEntryPage = Math.min(entryPage, entryTotalPages)
  const pageEntries = useMemo(() => filteredEntries.slice((currentEntryPage - 1) * entryPageSize, currentEntryPage * entryPageSize), [filteredEntries, currentEntryPage, entryPageSize])
  // 切换世界书/搜索词时回到第一页
  useEffect(() => { setEntryPage(1) }, [devBookId, entrySearch])

  function patch(next: Record<string, unknown>) {
    setEditable((prev) => Object.assign({}, prev ?? loaded ?? {}, next) as unknown as SettingsRecord)
  }

  function toggleWorkspace(id: string) {
    const has = selected.includes(id)
    if (has) patch({ workspaceIds: JSON.stringify(selected.filter((x) => x !== id)) })
    else patch({ workspaceIds: JSON.stringify([...selected, id]) })
  }

  const toggleDevEntry = useCallback((id: string) => {
    setEditable((prev) => {
      const base = prev ?? loaded ?? {}
      const raw = String((base as SettingsRecord).devEntryIds ?? '[]')
      let cur: string[] = []
      try {
        const p = JSON.parse(raw)
        if (Array.isArray(p)) cur = p.filter((x: unknown): x is string => typeof x === 'string')
      } catch { /* 忽略 */ }
      const has = cur.includes(id)
      const next = Object.assign({}, base, { devEntryIds: JSON.stringify(has ? cur.filter((x) => x !== id) : [...cur, id]) }) as unknown as SettingsRecord
      return next
    })
  }, [loaded])

  function selectAllEntries() {
    patch({ devEntryIds: JSON.stringify(Array.from(new Set([...devEntries, ...filteredEntries.map((e) => e.id)]))) })
  }

  function clearEntries() {
    patch({ devEntryIds: JSON.stringify([]) })
  }

  function togglePerm(p: string) {
    const has = devPerms.includes(p)
    if (has) patch({ devPerms: JSON.stringify(devPerms.filter((x) => x !== p)) })
    else patch({ devPerms: JSON.stringify([...devPerms, p]) })
  }

  // AI 权限多选区块（增删改查；默认全选，不做一键全选/清空，用户手动逐项勾选）
  function permBlock() {
    const PERMS = [
      { key: 'create', label: '增加条目', hint: 'AI 可在世界书中新增条目' },
      { key: 'delete', label: '删除条目', hint: 'AI 可删除世界书中的条目' },
      { key: 'update', label: '修改条目', hint: 'AI 可修改世界书中的条目' },
      { key: 'read', label: '读取', hint: 'AI 可读取世界书与条目' },
    ]
    return h('div', { className: 'wb-row', style: { cursor: 'default', background: 'var(--ml-bg-surface)', flexWrap: 'wrap' } },
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { className: 'wb-name' }, '开发权限'),
        h('div', { className: 'wb-meta' }, '控制 AI 编写世界书时的操作权限，可多选。'),
      ),
      h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
        PERMS.map((p) => h('button', {
          key: p.key,
          className: 'wb-btn' + (devPerms.includes(p.key) ? ' active' : ''),
          title: p.hint,
          onClick: () => togglePerm(p.key),
        }, p.label)),
      ),
    )
  }

  async function save() {
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify({ enabled, workspaceMode: mode, workspaceIds: selected, theme, injectMode, devMode: devModeOn, devAction, devBookId, devEntryIds: devEntries, devPerms }) })
      writeThemeCache(theme)
      setSaved(true)
      changed()
      setLoaded(editable ?? loaded)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      await showAlert({ title: '保存失败', message: (e as Error).message })
    }
  }

  // 设置表单内容体（弹窗与内嵌卡片共用）
  const renderBody = () => h('div', null,
    // 启用开关
    h('div', { className: 'wb-row', style: { cursor: 'default', background: 'var(--ml-bg-surface)' } },
      h('div', { style: { flex: 1 } },
        h('div', { className: 'wb-name' }, '启用世界书'),
        h('div', { className: 'wb-meta' }, '关闭后所有世界书不再注入模型上下文。'),
      ),
      h('div', { className: 'wb-switch' + (enabled ? '' : ' off'), onClick: () => patch({ enabled: String(!enabled) }) }),
    ),
    // 生效工作区
    h('div', { className: 'wb-field-label', style: { marginTop: 14 } }, '生效工作区'),
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
      h('button', { className: 'wb-btn' + (mode === 'all' ? ' active' : ''), onClick: () => patch({ workspaceMode: 'all' }) }, '全部工作区'),
      h('button', { className: 'wb-btn' + (mode === 'selected' ? ' active' : ''), onClick: () => patch({ workspaceMode: 'selected' }) }, '仅指定工作区'),
    ),
    mode === 'selected'
      ? h('div', { className: 'wb-list', style: { maxHeight: 200 } },
          ws.length === 0
            ? h('div', { className: 'wb-hint' }, '没有可用的工作区。')
            : ws.map((w) => h('label', {
                key: w.workspaceId,
                style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px', cursor: 'pointer', borderRadius: 8 },
              },
                h('input', {
                  type: 'checkbox', className: 'wb-radio', style: { width: 16, height: 16 },
                  checked: selected.includes(w.workspaceId),
                  onChange: () => toggleWorkspace(w.workspaceId),
                }),
                h('span', { style: { fontWeight: 600, color: 'var(--ml-ink)' } }, w.title),
              )),
        )
      : null,
    // 主题
    h('div', { className: 'wb-field-label', style: { marginTop: 14 } }, '主题'),
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
      h('button', { className: 'wb-btn' + (theme === 'dsh' ? ' active' : ''), onClick: () => patch({ theme: 'dsh' }) }, '跟随 DSH'),
      h('button', { className: 'wb-btn' + (theme === 'pink' ? ' active' : ''), onClick: () => patch({ theme: 'pink' }) }, '粉色'),
    ),
    // 注入时机
    h('div', { className: 'wb-field-label', style: { marginTop: 14 } }, '注入时机'),
    h('div', { className: 'wb-hint', style: { marginBottom: 8 } }, injectMode === 'per-turn' ? '正文注入：用户输入后注入一次，工具调用/思考轮不重复注入。' : '每轮注入：每次思考（含工具调用后的思考轮）都注入。可能会导致重复注入，不推荐使用。'),
    h('div', { style: { display: 'flex', gap: 8, marginBottom: 10 } },
      h('button', { className: 'wb-btn' + (injectMode === 'per-turn' ? ' active' : ''), onClick: () => patch({ injectMode: 'per-turn' }) }, '正文注入'),
      h('button', { className: 'wb-btn' + (injectMode === 'every-step' ? ' active' : ''), onClick: () => patch({ injectMode: 'every-step' }) }, '每轮注入'),
    ),
    // 开发世界书模式
    h('div', { className: 'wb-field-label', style: { marginTop: 14 } }, '开发世界书模式'),
    h('div', { className: 'wb-row', style: { cursor: 'default', background: 'var(--ml-bg-surface)' } },
      h('div', { style: { flex: 1 } },
        h('div', { className: 'wb-name' }, '启用开发世界书模式'),
        h('div', { className: 'wb-meta' }, '开启后向 AI 暴露 worldbook 编辑工具，AI 可直接编写符合 ST 格式的世界书。'),
      ),
      h('div', { className: 'wb-switch' + (devModeOn ? '' : ' off'), onClick: () => patch({ devMode: String(!devModeOn) }) }),
    ),
    devModeOn
      ? h('div', { style: { marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 } },
          // AI 权限（创建/编辑模式通用，恒显）
          permBlock(),
          // 开发模式：新建 / 编辑
          h('div', null,
            h('div', { className: 'wb-field-label' }, '开发模式'),
            h('div', { style: { display: 'flex', gap: 8 } },
              h('button', { className: 'wb-btn' + (devAction === 'create' ? ' active' : ''), onClick: () => patch({ devAction: 'create' }) }, '新建'),
              h('button', { className: 'wb-btn' + (devAction === 'edit' ? ' active' : ''), onClick: () => patch({ devAction: 'edit' }) }, '编辑'),
            ),
          ),
          devAction === 'create'
            ? h('div', null,
                h('div', { className: 'wb-hint' }, '新建模式：AI 可新建世界书并编辑其全部条目。'),
              )
            : h('div', null,
                // 编辑模式：选世界书（搜索框 + 下拉框左右并排）
                h('div', { className: 'wb-field-label', style: { marginTop: 12 } }, '让 AI 编写哪个世界书'),
                h('div', { className: 'wb-pick-row' },
                  h('div', { className: 'wb-search' },
                    h('input', {
                      type: 'text', className: 'wb-input', placeholder: '🔍 搜索世界书…', value: bookSearch,
                      onChange: (e: { target: { value: string } }) => setBookSearch(e.target.value),
                    }),
                  ),
                  h('div', { style: { flex: 1, minWidth: 0 } },
                    h('select', {
                      className: 'wb-select', style: { width: '100%', minHeight: 40 }, value: devBookId,
                      onChange: (e: { target: { value: string } }) => { patch({ devBookId: e.target.value }); setEntrySearch('') },
                    },
                      filteredBooks.length === 0
                        ? h('option', { value: '' }, '没有匹配的世界书')
                        : [h('option', { key: '', value: '' }, '请选择世界书…'),
                            ...filteredBooks.map((b) => h('option', { key: b.id, value: b.id }, `${b.name}（${b.entryCount} 条目${b.enabled ? '' : ' · 未启用'}）`))],
                    ),
                  ),
                ),
                devBookId
                  ? h('div', { style: { marginTop: 12 } },
                      h('div', { className: 'wb-field-label' }, '允许 AI 编写的条目（多选，不选 = 全部条目）'),
                      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' } },
                        h('div', { style: { display: 'flex', gap: 8, alignItems: 'stretch' } },
                          h('input', {
                            type: 'text', className: 'wb-input', placeholder: '🔍 搜索条目…', value: entrySearch,
                            style: { width: 120, flex: 'none', minHeight: 36 },
                            onChange: (e: { target: { value: string } }) => setEntrySearch(e.target.value),
                          }),
                          h('button', { className: 'wb-btn', style: { height: 36, display: 'inline-flex', alignItems: 'center' }, onClick: selectAllEntries }, '全选'),
                          h('button', { className: 'wb-btn', style: { height: 36, display: 'inline-flex', alignItems: 'center' }, onClick: clearEntries }, '清空'),
                          h('span', { className: 'wb-hint', style: { alignSelf: 'center' } }, devEntries.length === 0 ? '当前：全部条目' : `当前：${devEntries.length} 条`),
                        ),
                        // 分页：上一页 / 第 x/y 页 / 每页条数下拉 / 下一页（同编辑世界书条目）
                        h('div', { className: 'wb-actions', style: { gap: 8, alignItems: 'center' } },
                          h('button', { className: 'wb-btn wb-tool-btn wb-pager-btn', disabled: currentEntryPage <= 1, onClick: () => setEntryPage((p) => Math.max(1, p - 1)) }, '‹  上一页'),
                          h('span', { className: 'wb-hint', style: { whiteSpace: 'nowrap', fontSize: 12 } }, `第 ${currentEntryPage}/${entryTotalPages} 页`),
                          h('select', {
                            className: 'wb-select wb-pagesize-select', value: String(entryPageSize), title: '每页条数',
                            onChange: (e: { target: { value: string } }) => { setEntryPageSize(Number(e.target.value)); setEntryPage(1) },
                          },
                            [10, 20, 50].map((n) => h('option', { key: n, value: String(n) }, `${n} 条`)),
                          ),
                          h('button', { className: 'wb-btn wb-tool-btn wb-pager-btn', disabled: currentEntryPage >= entryTotalPages, onClick: () => setEntryPage((p) => p + 1) }, '下一页  ›'),
                        ),
                      ),
                      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8, maxHeight: 220, overflowY: 'auto' } },
                        filteredEntries.length === 0
                          ? h('div', { className: 'wb-hint' }, '该世界书还没有条目。')
                          : [
                              ...pageEntries.map((e) => h(EntryCard, {
                                key: e.id,
                                entry: e,
                                on: devEntries.includes(e.id),
                                onToggle: toggleDevEntry,
                              })),
                              filteredEntries.length > entryPageSize
                                ? h('div', { className: 'wb-hint', style: { padding: '6px 8px', gridColumn: '1 / -1' } }, `共 ${filteredEntries.length} 条，用搜索精确定位；「全选」会选中全部匹配条目。`)
                                : null,
                            ],
                      ),
                    )
                  : null,
              ),
        )
      : null,
    // 保存
    h('div', { className: 'wb-actions', style: { marginTop: 16 } },
      h('button', { className: 'wb-btn primary', onClick: save }, saved ? '已保存 ✓' : '保存'),
    ),
  )

  if (variant === 'card') {
    return h('div', { className: 'wb-card', style: { width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' } },
      h('div', { className: 'wb-card-hd' }, '世界书 · 设置'),
      h('div', { className: 'wb-card-bd', style: { overflowY: 'auto', minHeight: 0 } },
        compatAlert
          ? h('div', { className: 'wb-compat-alert', style: { marginBottom: 12 } },
              h('div', { className: 'wb-compat-alert-title' }, '⚠ 检测到重复注入'),
              h('div', { className: 'wb-compat-alert-msg' }, `插件「${compatAlert.plugin}」在连续注入段内注入了与本插件相同的内容（${compatAlert.count} 次）。重复内容会浪费上下文并可能干扰模型。`),
            )
          : null,
        renderBody(),
      ),
    )
  }

  return h('div', {
    className: 'dsh-worldbook-modal-backdrop',
    style: {
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'var(--ml-mask)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    onClick: (e: MouseEvent) => { if (e.target === e.currentTarget) onClose?.() },
  },
    h('div', { className: 'wb-card', style: { width: 720, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' } },
      h('div', { className: 'wb-card-hd' },
        '世界书 · 插件设置',
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'wbed-fold', style: { fontSize: 16 }, onClick: () => onClose?.() }, '✕'),
      ),
      h('div', { className: 'wb-card-bd', style: { overflowY: 'auto', minHeight: 0 } },
        renderBody(),
      ),
    ),
  )
}
