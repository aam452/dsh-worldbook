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

export interface SessionsService {
  list?: {
    getSnapshot(): { current?: string }
    subscribe(fn: () => void): () => void
  }
}

interface SettingsRecord {
  enabled: boolean
  workspaceMode: 'all' | 'selected'
  workspaceIds: string[]
  theme: 'dsh' | 'pink'
  injectMode: 'per-turn' | 'every-step'
  devMode: boolean
  devFloating: boolean
  devAction: 'create' | 'edit'
  devBookId: string
  devEntryIds: string[]
  devPerms: string[]
  compatEnabled: boolean
  exposeOperations: boolean
  agentRpCompat: boolean
  agentRpDebug: boolean
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
  key: string[]
  disable: boolean
}

function mapWork(w: { id?: string; workspaceId?: string; title?: string; path?: string }): WorkItem {
  const wid = (w.workspaceId ?? w.id) as string
  return { workspaceId: wid, title: w.title ?? wid, path: w.path ?? '' }
}

// 条目多选卡片（memo：on 为布尔原始值，勾选单条目时其它卡片 props 不变，跳过重渲染）
const EntryCard = memo(function EntryCard({ entry, on, onToggle }: { entry: StWorldEntry; on: boolean; onToggle: (id: string) => void }) {
  const title = entry.comment || entry.key[0] || '（无标题）'
  const keywords = entry.key.length > 0 ? entry.key.slice(0, 3).join(' · ') : '无触发词'
  return h('label', {
    className: 'wb-entry-card' + (on ? ' on' : '') + (entry.disable ? ' is-disabled' : ''),
    title: on ? '点击取消选择' : '点击选择条目',
  },
    h('input', {
      type: 'checkbox', className: 'wb-entry-checkbox',
      checked: on,
      onChange: () => onToggle(entry.id),
    }),
    h('span', { className: 'wb-entry-checkmark', 'aria-hidden': true }, on ? '✓' : ''),
    h('div', { className: 'wb-entry-card-copy' },
      h('div', { className: 'wb-entry-card-title' }, title),
      h('div', { className: 'wb-entry-card-meta' }, keywords, entry.key.length > 3 ? ` +${entry.key.length - 3}` : null),
      h('div', { className: 'wb-entry-card-preview' }, (entry.content || '').trim() || '（空内容）'),
    ),
  )
})

// 世界书插件设置表单：启用开关 + 工作区作用域 + 主题 + 开发模式（含 AI 权限）。
// variant='dialog'：模态框外壳（世界书页顶部「设置」按钮打开）；
// variant='card'：内嵌卡片外壳（宿主设置页内嵌，无关闭按钮）。表单逻辑两形态完全一致。
export function WorldbookSettingsDialog({ workspaces, onClose, variant = 'dialog', developerOnly = false, hideDevToggles = false, onDeveloperPointerDown }: { workspaces?: WorkspacesService; onClose?: () => void; variant?: 'dialog' | 'card' | 'developer'; developerOnly?: boolean; hideDevToggles?: boolean; onDeveloperPointerDown?: (event: unknown) => void }) {
  const [loaded, setLoaded] = useState<SettingsRecord | null>(null)
  const [editable, setEditable] = useState<SettingsRecord | null>(null)
  const [saved, setSaved] = useState(false)
  const [ws, setWs] = useState<WorkItem[]>([])
  const [compatExpanded, setCompatExpanded] = useState(false)
  const [devExpanded, setDevExpanded] = useState(false)

  useEffect(() => {
    api<SettingsRecord>('/settings').then(setLoaded).catch(() => setLoaded({ enabled: true, workspaceMode: 'all', workspaceIds: [], theme: 'dsh', injectMode: 'per-turn', devMode: false, devFloating: false, devAction: 'create', devBookId: '', devEntryIds: [], devPerms: ['create', 'delete', 'update', 'read'], compatEnabled: false, exposeOperations: false, agentRpCompat: false, agentRpDebug: false }))
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

  const settings = editable ?? loaded ?? { enabled: true, workspaceMode: 'all', workspaceIds: [], theme: 'dsh', injectMode: 'per-turn', devMode: false, devFloating: false, devAction: 'create', devBookId: '', devEntryIds: [], devPerms: ['create', 'delete', 'update', 'read'], compatEnabled: false, exposeOperations: false, agentRpCompat: false, agentRpDebug: false }
  const enabled = settings.enabled
  const mode = settings.workspaceMode
  const theme = settings.theme
  const injectMode = settings.injectMode
  const devModeOn = settings.devMode
  const compatOn = settings.compatEnabled
  // 子项显示/保存原始持久值；compatOn 只控制它们是否可操作和运行时是否生效。
  const exposeOpsOn = settings.exposeOperations
  const agentRpOn = settings.agentRpCompat
  const agentRpDebugOn = settings.agentRpDebug
  const devAction = settings.devAction
  const devBookId = settings.devBookId
  const selected = settings.workspaceIds
  const devEntries = settings.devEntryIds
  const devPerms = settings.devPerms

  const [books, setBooks] = useState<StWorldBook[]>([])
  const [devBookEntries, setDevBookEntries] = useState<StWorldEntry[]>([])
  const [devEntryTotal, setDevEntryTotal] = useState(0)
  const [devEntriesLoading, setDevEntriesLoading] = useState(false)
  // 重复注入警告：检测到与本插件连续注入段内重复注入时显示红色横幅（5 秒）
  const [compatAlert, setCompatAlert] = useState<{ plugin: string; sample: string; count: number } | null>(null)
  useEffect(() => {
    let cancelled = false
    let lastKey = ''
    if (!compatExpanded) return
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
    const t = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [compatExpanded])
  useEffect(() => {
    api<StWorldBook[]>('/worldbooks').then(setBooks).catch(() => setBooks([]))
  }, [])
  // 搜索框 state（世界书 / 条目）
  const [bookSearch, setBookSearch] = useState('')
  const [entrySearch, setEntrySearch] = useState('')
  const filteredBooks = useMemo(() => {
    const q = bookSearch.trim().toLowerCase()
    if (!q) return books
    return books.filter((b) => b.name.toLowerCase().includes(q))
  }, [books, bookSearch])
  // 条目分页由后端完成，前端只渲染当前页。
  const [entryPage, setEntryPage] = useState(1)
  const [entryPageSize, setEntryPageSize] = useState(20)
  const entryTotalPages = Math.max(1, Math.ceil(devEntryTotal / entryPageSize))
  const currentEntryPage = Math.min(entryPage, entryTotalPages)
  // 切换世界书/搜索词时回到第一页
  useEffect(() => { setEntryPage(1) }, [devBookId, entrySearch])
  useEffect(() => {
    if (!devExpanded && !developerOnly) { setDevBookEntries([]); setDevEntryTotal(0); return }
    if (devAction !== 'edit' || !devBookId) { setDevBookEntries([]); setDevEntryTotal(0); return }
    setDevEntriesLoading(true)
    const params = new URLSearchParams({ page: String(currentEntryPage), pageSize: String(entryPageSize) })
    if (entrySearch.trim()) params.set('q', entrySearch.trim())
    const controller = new AbortController()
    api<{ total?: number; items?: StWorldEntry[] }>(`/worldbooks/${devBookId}/entries?${params.toString()}`, { signal: controller.signal }).then((r) => {
      if (controller.signal.aborted) return
      setDevBookEntries(r?.items ?? [])
      setDevEntryTotal(r?.total ?? 0)
    }).catch(() => { if (!controller.signal.aborted) { setDevBookEntries([]); setDevEntryTotal(0) } }).finally(() => {
      if (!controller.signal.aborted) setDevEntriesLoading(false)
    })
    return () => controller.abort()
  }, [developerOnly, devExpanded, devAction, devBookId, entrySearch, currentEntryPage, entryPageSize])

  function patch(next: Partial<SettingsRecord>) {
    setEditable((prev) => ({ ...(prev ?? loaded ?? settings), ...next }))
  }

  function toggleWorkspace(id: string) {
    const has = selected.includes(id)
    if (has) patch({ workspaceIds: selected.filter((x) => x !== id) })
    else patch({ workspaceIds: [...selected, id] })
  }

  const toggleDevEntry = useCallback((id: string) => {
    setEditable((prev) => {
      const base = prev ?? loaded ?? settings
      const cur = base.devEntryIds
      const has = cur.includes(id)
      return { ...base, devEntryIds: has ? cur.filter((x) => x !== id) : [...cur, id] }
    })
  }, [loaded])

  async function selectAllEntries() {
    if (!devBookId) return
    try {
      const result = await api<{ ids?: string[] }>(`/worldbooks/${devBookId}/entries/ids`)
      patch({ devEntryIds: result.ids ?? [] })
    } catch (e) {
      await showAlert({ title: '全选失败', message: (e as Error).message })
    }
  }

  function clearEntries() {
    patch({ devEntryIds: [] })
  }

  function togglePerm(p: string) {
    const has = devPerms.includes(p)
    if (has) patch({ devPerms: devPerms.filter((x) => x !== p) })
    else patch({ devPerms: [...devPerms, p] })
  }

  const devTargetView = devModeOn && devAction === 'edit'
    ? h('div', null,
        h('div', { className: 'wb-field-label', style: { marginTop: 12 } }, '让 AI 编写哪个世界书'),
        h('div', { className: 'wb-pick-row' },
          h('div', { className: 'wb-search' }, h('input', { type: 'text', className: 'wb-input', placeholder: '搜索世界书…', value: bookSearch, onChange: (e: { target: { value: string } }) => setBookSearch(e.target.value) })),
          h('div', { style: { flex: 1, minWidth: 0 } },
            h('select', { className: 'wb-select', style: { width: '100%', minHeight: 40 }, value: devBookId, onChange: (e: { target: { value: string } }) => { patch({ devBookId: e.target.value }); setEntrySearch('') } },
              filteredBooks.length === 0 ? h('option', { value: '' }, '没有匹配的世界书') : [h('option', { key: '', value: '' }, '请选择世界书…'), ...filteredBooks.map((b) => h('option', { key: b.id, value: b.id }, `${b.name}（${b.entryCount} 条目${b.enabled ? '' : ' · 未启用'}）`))],
            ),
          ),
        ),
        devBookId ? h('div', { className: 'wb-dev-target', style: { marginTop: 12 } },
          h('div', { className: 'wb-field-label' }, '允许 AI 编写的条目'),
          h('div', { className: 'wb-entry-tools' },
            h('div', { className: 'wb-entry-actions wb-entry-actions-main' },
              h('input', { type: 'text', className: 'wb-input wb-entry-search wb-entry-search-compact', placeholder: '搜索条目…', value: entrySearch, style: { minHeight: 36 }, onChange: (e: { target: { value: string } }) => setEntrySearch(e.target.value) }),
              h('div', { className: 'wb-entry-pages wb-entry-pages-inline' },
              h('button', { className: 'wb-btn wb-tool-btn', disabled: currentEntryPage <= 1, onClick: () => setEntryPage((p) => Math.max(1, p - 1)) }, '‹'),
              h('span', { className: 'wb-hint' }, `${currentEntryPage}/${entryTotalPages}`),
              h('select', { className: 'wb-select wb-pagesize-select', value: String(entryPageSize), onChange: (e: { target: { value: string } }) => { setEntryPageSize(Number(e.target.value)); setEntryPage(1) } }, [10, 20, 50].map((n) => h('option', { key: n, value: String(n) }, `${n} 条`))),
              h('button', { className: 'wb-btn wb-tool-btn', disabled: currentEntryPage >= entryTotalPages, onClick: () => setEntryPage((p) => p + 1) }, '›'),
            ),
              h('button', { className: 'wb-btn', onClick: selectAllEntries }, '全选'),
              h('button', { className: 'wb-btn', onClick: clearEntries }, '清空'),
              h('span', { className: 'wb-hint' }, devEntries.length === 0 ? '全部' : `已选 ${devEntries.length}`),
            ),
          ),
          h('div', { className: 'wb-entry-grid', style: { display: 'grid', gap: 8, overflowY: 'auto' } }, devEntriesLoading ? h('div', { className: 'wb-hint' }, '加载中…') : devBookEntries.length === 0 ? h('div', { className: 'wb-hint' }, '该世界书还没有条目。') : devBookEntries.map((entry) => h(EntryCard, { key: entry.id, entry, on: devEntries.includes(entry.id), onToggle: toggleDevEntry }))),
        ) : null,
      )
    : devModeOn ? h('div', { className: 'wb-hint' }, '新建模式') : null

  // AI 权限多选区块（增删改查；默认全选，不做一键全选/清空，用户手动逐项勾选）
  function permBlock() {
    const PERMS = [
      { key: 'create', label: '增加条目', hint: 'AI 可在世界书中新增条目' },
      { key: 'delete', label: '删除条目', hint: 'AI 可删除世界书中的条目' },
      { key: 'update', label: '修改条目', hint: 'AI 可修改世界书中的条目' },
      { key: 'read', label: '读取', hint: 'AI 可读取世界书与条目' },
    ]
    return h('div', { className: 'wb-perm-block' },
      h('div', { className: 'wb-name' }, 'AI权限'),
      h('div', { className: 'wb-perm-buttons' },
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
      const saved = await api<SettingsRecord>('/settings', { method: 'PUT', body: JSON.stringify(settings) })
      writeThemeCache(theme)
      setSaved(true)
      changed()
      setLoaded(saved)
      setEditable(saved)
      setTimeout(() => setSaved(false), 1800)
    } catch (e) {
      await showAlert({ title: '保存失败', message: (e as Error).message })
    }
  }

  const developerSection = (forceExpanded = false, flat = false) => h('section', { className: flat ? 'wb-dev-floating-section' : 'wb-settings-section wb-settings-developer' },
    h('div', { className: 'wb-settings-section-head' + (forceExpanded ? '' : ' wb-settings-section-toggle'), role: forceExpanded ? undefined : 'button', tabIndex: forceExpanded ? undefined : 0, 'aria-expanded': forceExpanded || devExpanded, onPointerDown: forceExpanded ? onDeveloperPointerDown : undefined, onClick: forceExpanded ? undefined : () => setDevExpanded((value) => !value), onKeyDown: forceExpanded ? undefined : (e: { key: string }) => { if (e.key === 'Enter' || e.key === ' ') setDevExpanded((value) => !value) } }, h('span', { className: 'wb-settings-section-icon' }, '✦'), h('div', null, h('strong', null, '开发模式'), h('span', null, '为 AI 提供受控的世界书编辑能力')), forceExpanded ? null : h('span', { className: 'wb-settings-chevron' + (devExpanded ? ' is-open' : '') }, '⌄')),
    (forceExpanded || devExpanded) ? h('div', null,
      hideDevToggles ? null : h('div', { className: 'wb-setting-row' }, h('div', null, h('div', { className: 'wb-name' }, '开发模式'), h('div', { className: 'wb-hint' }, '仅在需要 AI 编辑世界书时开启')), h('div', { className: 'wb-switch' + (devModeOn ? '' : ' off'), onClick: () => patch({ devMode: !devModeOn }) })),
      devModeOn ? h('div', { className: 'wb-dev-controls' },
        hideDevToggles ? null : h('div', { className: 'wb-setting-row' }, h('div', null, h('div', { className: 'wb-name' }, '悬浮窗')), h('div', { className: 'wb-switch' + (settings.devFloating ? '' : ' off'), onClick: () => patch({ devFloating: !settings.devFloating }) })),
        permBlock(),
        h('div', { className: 'wb-setting-field' }, h('div', { className: 'wb-field-label' }, '编辑方式'), h('div', { className: 'wb-segmented' }, h('button', { className: 'wb-btn' + (devAction === 'create' ? ' active' : ''), onClick: () => patch({ devAction: 'create' }) }, '新建'), h('button', { className: 'wb-btn' + (devAction === 'edit' ? ' active' : ''), onClick: () => patch({ devAction: 'edit' }) }, '编辑'))),
      ) : null,
      devTargetView,
    ) : null,
  )

  // 设置表单内容体（弹窗与内嵌卡片共用）
  const renderBody = () => h('div', null,
    h('div', { className: 'wb-settings-layout' },
      h('div', { className: 'wb-settings-intro' },
        h('div', { className: 'wb-settings-kicker' }, 'WORLD BOOK CONFIGURATION'),
        h('div', { className: 'wb-settings-intro-row' },
          h('div', null,
            h('div', { className: 'wb-settings-title' }, '世界书设置'),
            h('div', { className: 'wb-hint' }, enabled ? '世界书正在当前环境中运行' : '世界书已暂停运行'),
          ),
          h('span', { className: 'wb-settings-status' + (enabled ? ' is-on' : '') }, enabled ? '运行中' : '已停用'),
        ),
      ),
      h('div', { className: 'wb-settings-grid' },
        h('section', { className: 'wb-settings-section' },
          h('div', { className: 'wb-settings-section-head' }, h('span', { className: 'wb-settings-section-icon' }, '◈'), h('div', null, h('strong', null, '基础设置'), h('span', null, '控制世界书的生效范围与注入方式'))),
          h('div', { className: 'wb-settings-rows' },
            h('div', { className: 'wb-setting-row' }, h('div', null, h('div', { className: 'wb-name' }, '启用世界书'), h('div', { className: 'wb-hint' }, '关闭后不会向对话注入内容')), h('div', { className: 'wb-switch' + (enabled ? '' : ' off'), onClick: () => patch({ enabled: !enabled }) })),
          ),
          h('div', { className: 'wb-setting-field' },
            h('div', { className: 'wb-field-label' }, '生效工作区'),
            h('div', { className: 'wb-segmented' }, h('button', { className: 'wb-btn' + (mode === 'all' ? ' active' : ''), onClick: () => patch({ workspaceMode: 'all' }) }, '全部工作区'), h('button', { className: 'wb-btn' + (mode === 'selected' ? ' active' : ''), onClick: () => patch({ workspaceMode: 'selected' }) }, '仅指定工作区')),
            mode === 'selected' ? h('div', { className: 'wb-list wb-workspace-list' }, ws.length === 0 ? h('div', { className: 'wb-hint' }, '没有可用的工作区。') : ws.map((w) => h('label', { key: w.workspaceId, className: 'wb-check-row' }, h('input', { type: 'checkbox', className: 'wb-radio', checked: selected.includes(w.workspaceId), onChange: () => toggleWorkspace(w.workspaceId) }), h('span', null, w.title)))) : null,
          ),
          h('div', { className: 'wb-setting-field' },
            h('div', { className: 'wb-field-label' }, '主题'),
            h('div', { className: 'wb-segmented' }, h('button', { className: 'wb-btn' + (theme === 'dsh' ? ' active' : ''), onClick: () => patch({ theme: 'dsh' }) }, '跟随 DSH'), h('button', { className: 'wb-btn' + (theme === 'pink' ? ' active' : ''), onClick: () => patch({ theme: 'pink' }) }, '粉色')),
          ),
          h('div', { className: 'wb-setting-field' },
            h('div', { className: 'wb-field-label' }, '注入时机'),
            h('div', { className: 'wb-segmented' }, h('button', { className: 'wb-btn' + (injectMode === 'per-turn' ? ' active' : ''), onClick: () => patch({ injectMode: 'per-turn' }) }, '正文注入'), h('button', { className: 'wb-btn' + (injectMode === 'every-step' ? ' active' : ''), onClick: () => patch({ injectMode: 'every-step' }) }, '每轮注入')),
          ),
        ),
        h('section', { className: 'wb-settings-section' },
          h('div', { className: 'wb-settings-section-head wb-settings-section-toggle', role: 'button', tabIndex: 0, 'aria-expanded': compatExpanded, onClick: () => setCompatExpanded((value) => !value), onKeyDown: (e: { key: string }) => { if (e.key === 'Enter' || e.key === ' ') setCompatExpanded((value) => !value) } }, h('span', { className: 'wb-settings-section-icon' }, '⇄'), h('div', null, h('strong', null, '兼容模式'), h('span', null, '连接宿主与其他世界书工具')), h('span', { className: 'wb-settings-chevron' + (compatExpanded ? ' is-open' : '') }, '⌄')),
          compatExpanded ? h('div', { className: 'wb-settings-rows' },
            h('div', { className: 'wb-setting-row' }, h('div', null, h('div', { className: 'wb-name' }, '兼容模式'), h('div', { className: 'wb-hint' }, '开启后可使用下方的兼容选项')), h('div', { className: 'wb-switch' + (compatOn ? '' : ' off'), onClick: () => patch({ compatEnabled: !compatOn }) })),
            h('div', { className: 'wb-setting-row' + (!compatOn ? ' is-disabled' : '') }, h('div', null, h('div', { className: 'wb-name' }, '向宿主暴露世界书操作接口')), h('div', { className: 'wb-switch' + (exposeOpsOn ? '' : ' off'), onClick: () => compatOn && patch({ exposeOperations: !exposeOpsOn }) })),
            h('div', { className: 'wb-setting-row' + (!compatOn ? ' is-disabled' : '') }, h('div', null, h('div', { className: 'wb-name' }, '兼容 dsh-agent-rp')), h('div', { className: 'wb-switch' + (agentRpOn ? '' : ' off'), onClick: () => compatOn && patch({ agentRpCompat: !agentRpOn }) })),
            h('div', { className: 'wb-setting-row' + (!compatOn ? ' is-disabled' : '') }, h('div', null, h('div', { className: 'wb-name' }, 'agent-rp 兼容调试日志')), h('div', { className: 'wb-switch' + (agentRpDebugOn ? '' : ' off'), onClick: () => compatOn && patch({ agentRpDebug: !agentRpDebugOn }) })),
          ) : null,
        ),
        developerSection(),
      ),
      h('div', { className: 'wb-settings-footer' }, h('span', { className: 'wb-hint' }, saved ? '设置已保存' : '修改后点击保存即可生效'), h('button', { className: 'wb-btn primary', onClick: save }, saved ? '已保存 ✓' : '保存设置')),
    ),
  )

  if (developerOnly || variant === 'developer') {
    return h('div', { className: 'wb-dev-floating-settings' },
      developerSection(true, true),
      h('div', { className: 'wb-settings-footer' }, h('span', { className: 'wb-hint' }, saved ? '设置已保存' : '修改后点击保存即可生效'), h('button', { className: 'wb-btn primary', onClick: save }, saved ? '已保存 ✓' : '保存设置')),
    )
  }

  if (variant === 'card') {
    return h('div', { className: 'wb-card', style: { width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' } },
      h('div', { className: 'wb-card-hd' },
        '世界书 · 设置',
      ),
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
