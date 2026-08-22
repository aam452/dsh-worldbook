import { createElement as h } from 'react'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode, PointerEvent as RPointerEvent } from 'react'
import { api, changed, onChanged } from './api'
import type { ApiErr } from './api'
import { showConfirm, showAlert } from './wb-confirm.tsx'
import { WorldbookSettingsDialog } from './worldbook-settings.tsx'
import type { WorkspacesService } from './worldbook-settings.tsx'

function errText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as ApiErr).message) : String(e)
}

function OperationToast({ message }: { message: string }) {
  return h('div', { className: 'wb-operation-toast', role: 'status' }, message)
}

// ── 世界书选中记忆：退出页面再进入时恢复上次选中的世界书 ──
const SELECTED_BOOK_CACHE_KEY = 'dsh-worldbook-selected-book'

function readSelectedBookCache(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(SELECTED_BOOK_CACHE_KEY) : null
  } catch {
    return null
  }
}

function writeSelectedBookCache(id: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (id === null) localStorage.removeItem(SELECTED_BOOK_CACHE_KEY)
    else localStorage.setItem(SELECTED_BOOK_CACHE_KEY, id)
  } catch {
    // 缓存不可写时忽略
  }
}

// ── 通用 hooks ──
function useData<T>(getter: () => Promise<T>): [T | null, string, () => void] {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => {
    setError('')
    getter().then(setData, (e) => setError(errText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    reload()
    return onChanged(reload)
  }, [reload])
  return [data, error, reload]
}

interface StWorldEntry {
  id: string
  comment: string | null
  content: string
  key: string[]
  keysecondary: string[]
  constant: boolean
  vectorized: boolean
  selective: boolean
  selectiveLogic: 0 | 1 | 2 | 3
  order: number
  position: number
  disable: boolean
  caseSensitive: boolean | null
  matchWholeWords: boolean | null
  scanDepth: number | null
  useGroupScoring: boolean | null
  excludeRecursion: boolean
  preventRecursion: boolean
  delayUntilRecursion: boolean | number
  probability: number
  useProbability: boolean
  depth: number
  outletName: string
  group: string
  groupOverride: boolean
  groupWeight: number
  sticky: number | null
  cooldown: number | null
  delay: number | null
  automationId: string
  role: number | null
  triggers: string[]
  characterFilter: { isExclude: boolean; names: string[]; tags: string[] }
  matchPersonaDescription: boolean
  matchCharacterDescription: boolean
  matchCharacterPersonality: boolean
  matchCharacterDepthPrompt: boolean
  matchScenario: boolean
  matchCreatorNotes: boolean
  displayIndex?: number
  uid?: number
  digest?: string
}

interface StWorldBook {
  id: string
  name: string
  description: string | null
  enabled: boolean
  scanDepth: number | null
  entryCount: number
}

interface CharacterBookReference {
  id: string
  name: string
  entryCount: number
  source: 'character-card'
  localBookId?: string
}

// 位置选项（对齐 SillyTavern 编辑器的位置下拉：角色定义/示例消息/作者注释前后、@D 系统/用户/AI、锚点）
const POSITION_OPTIONS = [
  { value: 0, role: null, label: '角色定义前 ↑Char' },
  { value: 1, role: null, label: '角色定义后 ↓Char' },
  { value: 5, role: null, label: '示例消息前 ↑EM' },
  { value: 6, role: null, label: '示例消息后 ↓EM' },
  { value: 2, role: null, label: '作者注释前 ↑AN' },
  { value: 3, role: null, label: '作者注释后 ↓AN' },
  { value: 4, role: 0, label: '系统 @D ⚙️' },
  { value: 4, role: 1, label: '用户 @D 👤' },
  { value: 4, role: 2, label: 'AI @D 🤖' },
  { value: 7, role: null, label: '锚点 ➡️ Outlet' },
]
const AT_DEPTH_POSITION = 4

const LOGIC_OPTIONS = [
  { value: 0, label: 'AND ANY' },
  { value: 1, label: 'NOT ALL' },
  { value: 2, label: 'NOT ANY' },
  { value: 3, label: 'AND ALL' },
]

const TRIGGERS = ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet']

const TRI_OPTIONS = [
  { value: '', label: '使用全局' },
  { value: 'true', label: '是' },
  { value: 'false', label: '否' },
]

// 条目展示顺序（对齐 ST world_info_sort_order，index.html:4841-4854）。custom 无方向；priority 固定方向。
const SORT_OPTIONS = [
  { key: 'custom', label: '自定义' },
  { key: 'priority', label: '优先级' },
  { key: 'comment', label: '标题' },
  { key: 'content', label: 'Token' },
  { key: 'depth', label: '深度' },
  { key: 'order', label: '顺序' },
  { key: 'uid', label: 'UID' },
  { key: 'probability', label: '触发频率' },
]
// 需要方向切换的排序（custom 不显示方向按钮）
const SORT_HAS_DIRECTION = ['priority', 'comment', 'content', 'depth', 'order', 'uid', 'probability']

function WorldbooksPage({ workspaces }: { workspaces?: WorkspacesService }) {
  const [books, , reload] = useData<StWorldBook[]>(() => api('/worldbooks'))
  const [characterBooks, , reloadCharacterBooks] = useData<CharacterBookReference[]>(() => api('/character-books'))
  const [compatSettings] = useData<{ compatEnabled?: string }>(() => api('/settings'))
  const [selectedId, setSelectedId] = useState<string | null>(() => readSelectedBookCache())
  const [msg, setMsg] = useState('')
  const [successToast, setSuccessToast] = useState('')
  const [errorToast, setErrorToast] = useState('')
  const errorToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const successToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [creating, setCreating] = useState(false)
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const bookList = (books ?? []).filter((b) => !onlyEnabled || b.enabled)
  const selected = bookList.find((b) => b.id === selectedId) ?? null

  // 选中变化即写缓存，下次进入页面恢复
  useEffect(() => { writeSelectedBookCache(selectedId) }, [selectedId])

  useEffect(() => () => {
    if (errorToastTimer.current !== null) clearTimeout(errorToastTimer.current)
    if (successToastTimer.current !== null) clearTimeout(successToastTimer.current)
  }, [])

  const showErrorToast = useCallback((error: unknown) => {
    if (errorToastTimer.current !== null) clearTimeout(errorToastTimer.current)
    setErrorToast(errText(error))
    errorToastTimer.current = setTimeout(() => {
      setErrorToast('')
      errorToastTimer.current = null
    }, 5000)
  }, [])

  const showSuccessToast = useCallback((message: string) => {
    if (successToastTimer.current !== null) clearTimeout(successToastTimer.current)
    setSuccessToast(message)
    successToastTimer.current = setTimeout(() => {
      setSuccessToast('')
      successToastTimer.current = null
    }, 2000)
  }, [])

  const toggleSelect = (id: string) => setSelectedId((prev) => (prev === id ? null : id))
  const selectBook = (id: string) => setSelectedId(id)

  const refresh = useCallback(() => { changed(); reload(); reloadCharacterBooks() }, [reload, reloadCharacterBooks])

  async function handleCreated(name: string) {
    setCreating(true)
    try {
      await api('/worldbooks', { method: 'POST', body: JSON.stringify({ name }) })
      showSuccessToast('新建成功')
      const next = await api<StWorldBook[]>('/worldbooks')
      setSelectedId(next.find((b) => b.name === name)?.id ?? null)
      refresh()
    } catch (e) {
      showErrorToast('新建失败：' + (e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function doDelete(book: StWorldBook) {
    const ok = await showConfirm({ title: '删除世界书', message: `确定删除世界书「${book.name}」？其下 ${book.entryCount} 条条目将一并删除。`, danger: true, confirmText: '删除' })
    if (!ok) return
    api(`/worldbooks/${book.id}`, { method: 'DELETE' }).then(() => {
      showSuccessToast('删除成功')
      if (selectedId === book.id) setSelectedId(null)
      refresh()
    }).catch((e) => showErrorToast('删除失败：' + errText(e)))
  }

  return h('div', { className: 'wb-page' },
    errorToast
      ? h('div', { className: 'wb-error-toast', role: 'alert' },
          h('div', { className: 'wb-error-toast-title' }, '操作失败'),
          h('div', { className: 'wb-error-toast-message' }, errorToast),
        )
      : null,
    successToast
      ? h(OperationToast, { message: successToast })
      : null,
    compatSettings?.compatEnabled === 'true' && characterBooks && characterBooks.length > 0
      ? h('div', { className: 'wb-card', style: { maxHeight: 240, display: 'flex', flexDirection: 'column' } },
          h('div', { className: 'wb-card-hd' }, '当前角色卡绑定的世界书', h('span', { style: { flex: 1 } })),
          h('div', { className: 'wb-card-bd', style: { overflowY: 'auto', minHeight: 0, flex: 1 } },
            characterBooks.map((book) => h('div', {
              key: book.id,
              className: 'wb-row' + (book.localBookId === selectedId ? ' selected' : ''),
              onClick: () => book.localBookId && selectBook(book.localBookId),
              title: book.localBookId ? '选择后在下方编辑' : '该书尚未进入本地编辑库',
              style: { cursor: book.localBookId ? 'pointer' : 'default' },
            },
              h('input', {
                type: 'radio', name: 'wb-character-select', className: 'wb-radio', checked: book.localBookId !== undefined && book.localBookId === selectedId,
                disabled: !book.localBookId,
                onChange: () => book.localBookId && selectBook(book.localBookId),
                onClick: (e) => { e.stopPropagation(); if (book.localBookId) selectBook(book.localBookId) },
              }),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { className: 'wb-name' }, book.name),
                h('div', { className: 'wb-meta' }, `${book.entryCount} 条目 · 角色卡绑定`),
              ),
            )),
          ),
        )
      : null,
    // 卡2：新建 + 已有世界书列表（可选中）
    h('div', { className: 'wb-card', style: { maxHeight: 320, display: 'flex', flexDirection: 'column' } },
      h('div', { className: 'wb-card-hd' },
        '全局世界书',
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'wb-btn', title: '插件设置：主题、启用开关、生效工作区、开发模式', onClick: () => setShowSettings(true) }, '⚙ 设置'),
        h('button', { className: 'wb-btn' + (onlyEnabled ? ' active' : ''), title: onlyEnabled ? '显示全部世界书' : '只显示已启用的世界书', onClick: () => { setOnlyEnabled(!onlyEnabled); setSelectedId(null) } }, onlyEnabled ? '已启用 ✓' : '只看已启用'),
        h('button', { className: 'wb-btn primary', onClick: () => setCreating(true), disabled: creating }, '＋ 新建世界书'),
        h('button', { className: 'wb-btn', disabled: !selected, onClick: () => selected && downloadWorldbook(selected) }, '导出'),
        h('label', { className: 'wb-btn', style: { cursor: 'pointer' } },
          '导入',
          h('input', { type: 'file', accept: '.json,.png,application/json,image/png', style: { display: 'none' }, onChange: (e) => onWorldbookImport(e, (message) => { showSuccessToast(message); refresh() }, (id) => setSelectedId(id)) }),
        ),
      ),
      h('div', { className: 'wb-card-bd', style: { overflowY: 'auto', minHeight: 0, flex: 1 } },
        bookList.length === 0
          ? h('div', { className: 'wb-hint' }, '还没有世界书，点「＋ 新建世界书」创建一本，或用「导入」读取 ST 世界书 JSON / 角色卡。')
          : bookList.map((book) =>
            h('div', {
              key: book.id,
              className: 'wb-row' + (book.id === selectedId ? ' selected' : ''),
              onClick: () => toggleSelect(book.id),
            },
              h('input', {
                type: 'radio', name: 'wb-select', className: 'wb-radio', checked: book.id === selectedId,
                onChange: () => toggleSelect(book.id),
                onClick: (e) => e.stopPropagation(),
              }),
              h('div', { style: { flex: 1, minWidth: 0 } },
                h('div', { className: 'wb-name' }, book.name),
                h('div', { className: 'wb-meta' }, `${book.entryCount} 条目`),
              ),
              h('div', {
                className: 'wb-switch' + (book.enabled ? '' : ' off'), title: '启用/停用',
                onClick: (e) => {
                  e.stopPropagation()
                  api(`/worldbooks/${book.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !book.enabled }) }).then(refresh).catch((err) => { void showAlert({ title: '操作失败', message: (err as Error).message }) })
                },
              }, undefined),
              h('button', { className: 'wb-btn danger', onClick: (e) => { e.stopPropagation(); doDelete(book) } }, '删除'),
            ),
          ),
      ),
    ),
    // 卡2：编辑选中的世界书（可大一点）
    selected
      ? h(WorldbookEditor, { key: selected.id, book: selected, onChange: refresh })
      : h('div', { className: 'wb-card', style: { maxHeight: 560 } },
        h('div', { className: 'wb-card-hd' }, '编辑'),
        h('div', { className: 'wb-card-bd' },
          h('div', { className: 'wb-hint' }, '从上方选择一本世界书开始编辑。'),
        ),
      ),
    creating ? h(NewWorldbookModal, { onConfirm: handleCreated, onClose: () => setCreating(false) }) : null,
    showSettings ? h(WorldbookSettingsDialog, { workspaces, onClose: () => setShowSettings(false) }) : null,
  )
}

function NewWorldbookModal(props: { onConfirm: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return h('div', { style: { position: 'fixed', inset: 0, background: 'var(--ml-mask)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
    h('div', { className: 'wb-card', style: { width: 'min(400px, 92vw)' } },
      h('div', { className: 'wb-card-hd' }, '新建世界书'),
      h('div', { className: 'wb-card-bd', style: { gap: 14 } },
        h('label', { className: 'wb-field-label' }, '请输入世界书名称'),
        h('input', {
          className: 'wb-input', value: name, autoFocus: true, placeholder: '世界书名称',
          onChange: (e) => setName(e.target.value),
          onKeyDown: (e) => { if ((e as unknown as { key: string }).key === 'Enter' && name.trim() && !busy) { setBusy(true); props.onConfirm(name.trim()).finally(() => props.onClose()) } },
        }),
        h('div', { className: 'wb-actions', style: { justifyContent: 'flex-end' } },
          h('button', { className: 'wb-btn', onClick: props.onClose }, '取消'),
          h('button', {
            className: 'wb-btn primary', disabled: !name.trim() || busy,
            onClick: () => { setBusy(true); props.onConfirm(name.trim()).finally(() => props.onClose()) },
          }, '创建'),
        ),
      ),
    ),
  )
}

function downloadWorldbook(book: StWorldBook) {
  fetch(`/api/worldbook/worldbooks/${book.id}/export`).then(async (res) => {
    const json = await res.json()
    if (!json.success) throw new Error(json.message || '导出失败')
    const blob = new Blob([json.data.json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const safeName = (book.name || 'worldbook')
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '') || 'worldbook'
    a.download = `${safeName}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }).catch((e) => { void showAlert({ title: '导出失败', message: (e as Error).message }) })
}

function onWorldbookImport(e: { target: { files: FileList | null } }, onDone: (message: string) => void, onSelect: (id: string) => void) {
  const file = e.target.files?.[0]
  if (!file) return
  const isPng = /\.png$/i.test(file.name)
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      // 角色卡 PNG：解析 tEXt 分块（ccv3 优先，其次 chara），base64 解码得到内嵌世界书 JSON；JSON 文件直接读文本。
      const rawText = isPng ? extractCardJsonFromPng(reader.result as ArrayBuffer) : String(reader.result)
      if (rawText === null) throw new Error(UNRECOGNIZED_WORLDBOOK)
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(UNRECOGNIZED_WORLDBOOK)
      }
      // 从角色卡 JSON 抽取世界书对象（CCv2/CCv3），纯世界书 JSON 原样返回；剔除角色数据只导入世界书。
      const worldRoot = pickCharacterBook(parsed) ?? parsed
      // SillyTavern 导入纯世界书时使用文件名作为书名，不使用 JSON 顶层 name。
      // 角色卡则使用其内嵌 character_book.name，因为此时文件名是角色卡名而不是书名。
      const embeddedBook = pickCharacterBook(parsed)
      const embeddedName = embeddedBook && typeof embeddedBook.name === 'string' ? embeddedBook.name.trim() : ''
      const fileName = embeddedBook
        ? (embeddedName || file.name.replace(/\.(json|png)$/i, '') || '导入世界书')
        : (file.name.replace(/\.(json|png)$/i, '') || '导入世界书')
      // 已有同名世界书时提示是否更新
      const list = (await api<StWorldBook[]>('/worldbooks')) ?? []
      const existing = fileName ? list.find((b) => b.name === fileName) : undefined
      if (existing) {
        const ok = await showConfirm({ title: '更新世界书', message: `已存在世界书「${fileName}」，是否更新该世界书？（将覆盖其全部条目）`, danger: true, confirmText: '更新' })
        if (!ok) return
        const res = await fetch(`/api/worldbook/worldbooks/${existing.id}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fileName, json: JSON.stringify(parsed) }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.message || '导入失败')
        onSelect(existing.id)
      } else {
        // 无同名 → 新建一本世界书并写入条目；导入失败时回滚删除刚建的空世界书
        const name = fileName
        const created = await api<StWorldBook>('/worldbooks', { method: 'POST', body: JSON.stringify({ name }) })
        try {
          const res = await fetch(`/api/worldbook/worldbooks/${created.id}/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fileName, json: JSON.stringify(parsed) }),
          })
          const json = await res.json()
          if (!json.success) throw new Error(json.message || '导入失败')
          onSelect(created.id)
        } catch (err) {
          try { await api(`/worldbooks/${created.id}`, { method: 'DELETE' }) } catch { /* 回滚失败不阻塞报错 */ }
          throw err
        }
      }
      onDone('导入成功')
    } catch (err) {
      const message = (err as Error).message
      // 格式识别失败（含服务端报的条目格式错误）统一提示未识别
      await showAlert({ title: '导入失败', message: /不是合法 JSON|顶层必须是对象|缺少 entries|条目 .* 必须是对象/.test(message) ? UNRECOGNIZED_WORLDBOOK : message })
    }
  }
  if (isPng) reader.readAsArrayBuffer(file)
  else reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

const UNRECOGNIZED_WORLDBOOK = '未识别到有效的世界书格式'

// 从角色卡 JSON 顶层抽取世界书对象（与服务端 pickCharacterBook 一致）：CCv2 在顶层，CCv3 在 data.character_book。
function pickCharacterBook(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const root = parsed as Record<string, unknown>
  if (typeof root.character_book === 'object' && root.character_book !== null && !Array.isArray(root.character_book)) {
    return root.character_book as Record<string, unknown>
  }
  const data = root.data
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    const inner = (data as Record<string, unknown>).character_book
    if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
      return inner as Record<string, unknown>
    }
  }
  return null
}

// 解析角色卡 PNG：定位 tEXt 分块（ccv3 优先、chara 兜底），返回分块内 base64 解码后的世界书 JSON 文本。
function extractCardJsonFromPng(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer)
  // PNG 签名 89 50 4E 47 0D 0A 1A 0A
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  const view = new DataView(buffer)
  let offset = 8
  let chara: string | null = null
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    if (type === 'tEXt') {
      const dataStart = offset + 8
      // 关键字与文本用 0x00 分隔
      let nul = dataStart
      while (nul < dataStart + length && bytes[nul] !== 0) nul++
      const keyword = String.fromCharCode(...bytes.subarray(dataStart, nul))
      const textBytes = bytes.subarray(nul + 1, dataStart + length)
      const text = decodeBase64(textBytes)
      if (keyword === 'ccv3') return text
      if (keyword === 'chara' && chara === null) chara = text
    }
    offset += 12 + length
  }
  return chara
}

// 解码 PNG tEXt 分块中的 base64 文本（分块文本为 Latin-1，先还原成字节再按 UTF-8 解码）。
function decodeBase64(latin1: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < latin1.length; i++) binary += String.fromCharCode(latin1[i])
  const clean = binary.replace(/[\r\n]+/g, '')
  const raw = atob(clean)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

function blankEntry(): StWorldEntry {
  return {
    id: '', comment: '', content: '', key: [], keysecondary: [], constant: false, vectorized: false,
    selective: false, selectiveLogic: 0, order: 100, position: 0, disable: false,
    caseSensitive: null, matchWholeWords: null, scanDepth: null, useGroupScoring: null,
    excludeRecursion: true, preventRecursion: false, delayUntilRecursion: false, probability: 100,
    useProbability: true, depth: 4, outletName: '', group: '', groupOverride: false, groupWeight: 100,
    sticky: null, cooldown: null, delay: null, automationId: '', role: null, triggers: [],
    characterFilter: { isExclude: false, names: [], tags: [] },
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
  }
}

function WorldbookEditor(props: { book: StWorldBook; onChange: () => void }) {
  const [name, setName] = useState(props.book.name)
  const [entries, setEntries] = useState<StWorldEntry[] | null>(null)
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [msg, setMsg] = useState('')
  const [editingEntry, setEditingEntry] = useState<StWorldEntry | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('custom')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [dragging, setDragging] = useState<string | null>(null)
  const contentRef = useRef<HTMLTextAreaElement | null>(null)
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setName(props.book.name) }, [props.book.name])

  function rename(next: string) {
    setName(next)
    if (renameTimer.current) clearTimeout(renameTimer.current)
    renameTimer.current = setTimeout(() => {
      if (next.trim()) api(`/worldbooks/${props.book.id}`, { method: 'PUT', body: JSON.stringify({ name: next.trim() }) }).then(() => { props.onChange(); setMsg('名称已保存 ✓') }).catch((e) => setMsg('保存失败：' + (e as Error).message))
    }, 500)
  }

  const reloadEntries = useCallback(() => {
    setEntriesLoading(true)
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    params.set('sort', sortKey)
    params.set('order', sortOrder)
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    api<{ total?: number; pageSize?: number; items?: StWorldEntry[] } | StWorldEntry[]>(`/worldbooks/${props.book.id}/entries?${params.toString()}`)
      .then((data) => {
        // 兼容旧格式：后端直接返回条目数组
        if (Array.isArray(data)) { setEntries(data); setTotal(data.length); return }
        setEntries(data?.items ?? [])
        setTotal(data?.total ?? (data?.items?.length ?? 0))
      })
      .catch((e) => { setEntries([]); setMsg('加载条目失败：' + (e as Error).message) })
      .finally(() => setEntriesLoading(false))
  }, [props.book.id, query, sortKey, sortOrder, page, pageSize])

  useEffect(() => { setMsg(''); reloadEntries() }, [reloadEntries])

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current) }, [])

  function onSearch(next: string) {
    setQuery(next)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setPage(1), 300)
  }

  function onSort(key: string) {
    setSortKey(key)
    setSortOrder(SORT_HAS_DIRECTION.includes(key) ? 'asc' : 'asc')
    setPage(1)
  }
  function toggleDir() {
    setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    setPage(1)
  }

  async function doReorder(dragId: string, targetId: string) {
    if (dragId === targetId || !entries) return
    const from = entries.findIndex((e) => e.id === dragId)
    const to = entries.findIndex((e) => e.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...entries]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setEntries(next)
    try {
      await api(`/worldbooks/${props.book.id}/entries/reorder`, { method: 'PUT', body: JSON.stringify({ orderedIds: next.map((e) => e.id) }) })
      setMsg('顺序已更新 ✓')
      changed(); reloadEntries()
    } catch (e) {
      setMsg('排序失败：' + (e as Error).message)
    }
  }

  function patchEntry(patch: Partial<StWorldEntry>) {
    setEditingEntry((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  async function saveEntry() {
    if (!editingEntry) return
    const body: Record<string, unknown> = { ...editingEntry }
    if (contentRef.current) body.content = contentRef.current.value
    delete (body as Record<string, unknown>).id
    if ((body as Record<string, unknown>).digest !== undefined) delete (body as Record<string, unknown>).digest
    try {
      if (isNew) await api(`/worldbooks/${props.book.id}/entries`, { method: 'POST', body: JSON.stringify({ entry: body }) })
      else await api(`/worldbooks/${props.book.id}/entries/${editingEntry.id}`, { method: 'PUT', body: JSON.stringify(body) })
      setEditingEntry(null); setIsNew(false); setMsg('条目已保存 ✓')
      changed(); reloadEntries()
    } catch (e) {
      setMsg('条目保存失败：' + (e as Error).message)
    }
  }

  async function deleteEntry(id: string) {
    const ok = await showConfirm({ title: '删除条目', message: '确定删除这条条目？', danger: true, confirmText: '删除' })
    if (!ok) return
    try {
      await api(`/worldbooks/${props.book.id}/entries/${id}`, { method: 'DELETE' })
      setEditingEntry(null); setMsg('条目已删除'); changed(); reloadEntries()
    } catch (e) {
      setMsg('删除失败：' + (e as Error).message)
    }
  }

  async function toggleEntryEnabled(en: StWorldEntry) {
    try {
      await api(`/worldbooks/${props.book.id}/entries/${en.id}`, { method: 'PUT', body: JSON.stringify({ disable: !en.disable }) })
      changed(); reloadEntries()
    } catch (e) {
      setMsg('操作失败：' + (e as Error).message)
    }
  }

  const stateName = (e: StWorldEntry) => (e.constant ? '🔵常驻' : e.vectorized ? '🔗向量' : e.disable ? '禁用' : '🟢普通')

  return h('div', { className: 'wb-card', style: { maxHeight: 560, display: 'flex', flexDirection: 'column' } },
    h('div', { className: 'wb-card-hd' },
      `编辑 · ${props.book.name}`,
      h('span', { style: { flex: 1 } }),
      msg ? h('span', { className: 'wb-hint' }, msg) : null,
    ),
    h('div', { className: 'wb-card-bd wb-edit-scroll', style: { overflowY: 'auto', minHeight: 0, flex: 1 } },
      // 书名称（实时保存）
      h('div', { className: 'wbed-field', style: { maxWidth: 360 } },
        h('label', { className: 'wb-field-label' }, '世界书名称'),
        h('input', { className: 'wb-input wb-name-input', style: { width: '100%' }, value: name, onChange: (e) => rename(e.target.value) }),
      ),
      // 搜索 + 排序 + 方向 + 分页 + 新增条目（一行，间距统一 8px）
      h('div', { className: 'wb-actions', style: { justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8, columnGap: 10, alignItems: 'center' } },
        h('div', { className: 'wb-actions', style: { gap: 8, flex: 1, minWidth: 0, alignItems: 'center' } },
          h('input', {
            className: 'wb-input wb-tool-input', placeholder: '搜索…', value: query,
            style: { width: 132, flex: 'none', fontSize: 13 },
            onChange: (e) => onSearch(e.target.value),
          }),
          h('select', {
            className: 'wb-select wb-tool-select', value: sortKey, title: '条目展示顺序',
            onChange: (e: { target: { value: string } }) => onSort(e.target.value),
          },
            SORT_OPTIONS.map((o) => h('option', { key: o.key, value: o.key }, o.label)),
          ),
          SORT_HAS_DIRECTION.includes(sortKey)
            ? h('button', {
              className: 'wb-btn wb-tool-btn', title: sortOrder === 'asc' ? '升序（点按切换为降序）' : '降序（点按切换为升序）',
              onClick: toggleDir,
            }, sortOrder === 'asc' ? '↑' : '↓')
            : null,
        ),
        // 分页：上一页 / 第 x/y 页 / 每页条数下拉 / 下一页
        h('div', { className: 'wb-actions', style: { gap: 8, alignItems: 'center' } },
          h('button', { className: 'wb-btn wb-tool-btn wb-pager-btn', disabled: page <= 1, onClick: () => setPage((p) => Math.max(1, p - 1)) }, '‹  上一页'),
          h('span', { className: 'wb-hint', style: { whiteSpace: 'nowrap', fontSize: 12 } }, `第 ${page}/${Math.max(1, Math.ceil(total / pageSize))} 页`),
          h('select', {
            className: 'wb-select wb-pagesize-select', value: String(pageSize), title: '每页条数',
            onChange: (e: { target: { value: string } }) => { setPageSize(Number(e.target.value)); setPage(1) },
          },
            [10, 20, 50].map((n) => h('option', { key: n, value: String(n) }, `${n} 条`)),
          ),
          h('button', { className: 'wb-btn wb-tool-btn wb-pager-btn', disabled: page >= Math.ceil(total / pageSize), onClick: () => setPage((p) => p + 1) }, '下一页  ›'),
        ),
        h('button', { className: 'wb-btn primary', style: { flex: 'none' }, onClick: () => { setEditingEntry(blankEntry()); setIsNew(true) } }, '＋ 新增条目'),
      ),
      h('div', { className: 'wb-actions', style: { justifyContent: 'space-between' } },
        h('div', { className: 'wb-hint', style: { fontWeight: 700, color: 'var(--ml-pink-6)' } }, `条目 · ${total}${query.trim() ? '（含搜索）' : ''}${sortKey === 'custom' ? ' · 可拖动 ⋮⋮ 调整自定义顺序' : ''}`),
      ),
      h('div', { className: 'wb-entries' + (entriesLoading ? ' wb-entries-loading' : '') },
        entries === null
          ? h('div', { className: 'wb-hint' }, '加载中…')
          : !entries || entries.length === 0
            ? h('div', { className: 'wb-hint' }, '暂无条目，点「＋ 新增条目」创建，或对书本「导入」ST JSON / 角色卡。')
            : entries.map((en) =>
              h('div', {
                key: en.id,
                className: 'wb-row' + (dragging === en.id ? ' wb-row-dragging' : ''),
                style: { padding: '8px 12px' },
                draggable: false,
              },
                // 自定义排序：仅三条杠可拖（避免与滚动/点击冲突）
                sortKey === 'custom'
                  ? h('span', {
                    className: 'wbed-grip' + (dragging === en.id ? ' active' : ''),
                    draggable: true, title: '拖动调整自定义顺序',
                    onDragStart: (e) => { setDragging(en.id); (e as unknown as { dataTransfer: DataTransfer }).dataTransfer.effectAllowed = 'move' },
                    onDragEnd: () => setDragging(null),
                    onDragOver: (e) => e.preventDefault(),
                    onDrop: (e) => { e.preventDefault(); if (dragging) doReorder(dragging, en.id) },
                  }, '⋮⋮')
                  : null,
                h('div', { style: { flex: 1, minWidth: 0, cursor: 'pointer' }, onClick: () => { setEditingEntry({ ...en }); setIsNew(false) } },
                  h('div', { className: 'wb-name' }, (en.comment || '（无标题）')),
                  h('div', { className: 'wb-meta', style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } },
                    `${stateName(en)} · 顺序 ${en.order} · ${en.key.length ? en.key.join('、') : '无触发词'} · ${en.content.slice(0, 60)}`),
                ),
                h('button', {
                  className: 'wb-btn' + (!en.disable ? '' : ' muted'),
                  style: !en.disable
                    ? { color: 'var(--dsw-alias-state-success-primary)', borderColor: 'var(--dsw-alias-state-success-tertiary)', background: 'var(--dsw-alias-state-success-tertiary)' }
                    : { color: 'var(--ml-ink-3)', borderColor: 'var(--ml-line)' },
                  title: '点击切换启用/停用',
                  onClick: () => toggleEntryEnabled(en),
                }, !en.disable ? '✓ 已启用' : '○ 未启用'),
                h('button', { className: 'wb-btn', onClick: () => { setEditingEntry({ ...en }); setIsNew(false) } }, '编辑'),
                h('button', { className: 'wb-btn danger', onClick: () => deleteEntry(en.id) }, '删除'),
              ),
            ),
      ),
    ),
    editingEntry ? h(EntryEditorModal, {
      entry: editingEntry, isNew, onChange: patchEntry, onSave: saveEntry,
      onClose: () => { setEditingEntry(null); setIsNew(false) },
      contentRef,
    }) : null,
  )
}

function EntryEditorModal(props: { entry: StWorldEntry; isNew: boolean; onChange: (p: Partial<StWorldEntry>) => void; onSave: () => void; onClose: () => void; contentRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const en = props.entry
  const set = props.onChange
  const tri = (v: boolean | null) => (v === null ? '' : String(v))
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [stateOpen, setStateOpen] = useState(false)
  const entryState = en.constant ? { icon: '🔵', label: '常驻' } : en.vectorized ? { icon: '🔗', label: '向量' } : { icon: '🟢', label: '普通' }
  const setState = (constant: boolean, vectorized: boolean) => { set({ constant, vectorized }); setStateOpen(false) }
  useEffect(() => {
    if (!stateOpen) return
    const close = () => setStateOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [stateOpen])

  return h('div', { style: { position: 'fixed', inset: 0, background: 'var(--ml-mask)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' } },
    h('div', { className: 'wb-card', style: { width: 'min(860px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' } },
      h('div', { className: 'wb-card-hd' },
        props.isNew ? '新增条目' : '编辑条目',
        h('span', { style: { flex: 1 } }),
        h('button', { className: 'wbed-btn', onClick: props.onClose }, '关闭'),
      ),
      h('main', { className: 'wbed-body', style: { overflowY: 'auto', minHeight: 0, flex: 1 } },
        // 条目标题（独立一行）
        h('div', { className: 'wbed-field' },
          h('label', { className: 'wbed-label' }, '条目标题'),
          h('input', { className: 'wbed-input', placeholder: '条目标题', value: en.comment ?? '', onChange: (e) => set({ comment: e.target.value }) }),
        ),
        // 状态灯 / 位置 / 深度 / 顺序 / 触发%（一排 5 个，状态灯在最左侧）
        h('div', { className: 'wbed-grid5' },
            h('div', { className: 'wbed-field wbed-num', style: { position: 'relative' } },
              h('label', { className: 'wbed-label' }, '状态'),
              h('button', { className: 'wbed-state-btn', onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); setStateOpen(!stateOpen) }, type: 'button', title: '条目状态：常驻无条件注入 / 普通按触发词 / 向量按向量（本项目按常驻处理）' },
                h('span', { className: 'wbed-state-icon' }, entryState.icon),
                h('span', null, entryState.label),
                h('span', { className: 'wbed-state-caret' }, '▾'),
              ),
              stateOpen && h('div', { className: 'wbed-state-menu' },
                h('button', { type: 'button', className: 'wbed-state-option' + (en.constant ? ' active' : ''), onClick: () => setState(true, false) }, h('span', null, '🔵'), '常驻'),
                h('button', { type: 'button', className: 'wbed-state-option' + (!en.constant && !en.vectorized ? ' active' : ''), onClick: () => setState(false, false) }, h('span', null, '🟢'), '普通'),
                h('button', { type: 'button', className: 'wbed-state-option' + (en.vectorized ? ' active' : ''), onClick: () => setState(false, true) }, h('span', null, '🔗'), '向量'),
              ),
            ),
            h('div', { className: 'wbed-field wbed-num' },
              h('label', { className: 'wbed-label' }, '位置'),
              h('select', {
                className: 'wbed-select',
                value: en.position === AT_DEPTH_POSITION ? `${AT_DEPTH_POSITION}:${en.role ?? 0}` : `${en.position}:`,
                onChange: (e: { target: { value: string } }) => {
                  const [pStr, rStr] = e.target.value.split(':')
                  const position = Number(pStr)
                  set({ position, role: position === AT_DEPTH_POSITION ? (rStr === undefined ? 0 : Number(rStr)) : null })
                },
              },
                POSITION_OPTIONS.map((o) => h('option', { key: `${o.value}:${o.role ?? ''}`, value: `${o.value}:${o.role ?? ''}` }, o.label)),
              ),
            ),
            h('div', { className: 'wbed-field wbed-num' },
              h('label', { className: 'wbed-label' }, '深度'),
              h('input', {
                className: 'wbed-input', type: 'number', min: 0,
                disabled: en.position !== AT_DEPTH_POSITION,
                placeholder: en.position !== AT_DEPTH_POSITION ? '深度无效' : '',
                value: en.position === AT_DEPTH_POSITION ? String(en.depth) : '',
                onChange: (e) => set({ depth: Number(e.target.value) || 0 }),
              }),
            ),
            h('div', { className: 'wbed-field wbed-num' },
              h('label', { className: 'wbed-label' }, '顺序'),
              h('input', { className: 'wbed-input', type: 'number', value: String(en.order), onChange: (e) => set({ order: Number(e.target.value) || 0 }) }),
            ),
            h('div', { className: 'wbed-field wbed-num' },
              h('label', { className: 'wbed-label' }, '触发 %'),
              h('input', { className: 'wbed-input', type: 'number', min: 0, max: 100, value: String(en.probability), onChange: (e) => set({ probability: Number(e.target.value) || 0 }) }),
            ),
          ),
          // 主要关键字 + 可选过滤器（同一行，响应式，长度受限）
          h('div', { className: 'wbed-row2' },
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '主要关键字'),
              h('input', { className: 'wbed-input', placeholder: '逗号分隔列表', value: en.key.join(', '), onChange: (e: { target: { value: string } }) => set({ key: splitCsv(e.target.value) }) }),
            ),
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '可选过滤器'),
              h('input', { className: 'wbed-input', placeholder: '逗号分隔列表（如果为空则忽略）', value: en.keysecondary.join(', '), onChange: (e) => set({ keysecondary: splitCsv(e.target.value) }) }),
            ),
          ),
          // 逻辑（独立一行，长度小）
          h('div', { className: 'wbed-field wbed-num' },
            h('label', { className: 'wbed-label' }, '逻辑'),
            h('select', { className: 'wbed-select', value: String(en.selectiveLogic), onChange: (e: { target: { value: string } }) => set({ selectiveLogic: Number(e.target.value) as 0 | 1 | 2 | 3 }) },
              LOGIC_OPTIONS.map((o) => h('option', { key: o.value, value: String(o.value) }, o.label)),
            ),
          ),
          // 区分大小写 / 完整单词 / 组评分 / 自动化ID
          h('div', { className: 'wbed-grid4' },
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '区分大小写'),
              h('select', { className: 'wbed-select', value: tri(en.caseSensitive), onChange: (e: { target: { value: string } }) => set({ caseSensitive: e.target.value === '' ? null : e.target.value === 'true' }) },
                TRI_OPTIONS.map((o) => h('option', { key: o.value, value: o.value }, o.label)),
              ),
            ),
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '完整单词'),
              h('select', { className: 'wbed-select', value: tri(en.matchWholeWords), onChange: (e: { target: { value: string } }) => set({ matchWholeWords: e.target.value === '' ? null : e.target.value === 'true' }) },
                TRI_OPTIONS.map((o) => h('option', { key: o.value, value: o.value }, o.label)),
              ),
            ),
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '组评分'),
              h('select', { className: 'wbed-select', value: tri(en.useGroupScoring), onChange: (e: { target: { value: string } }) => set({ useGroupScoring: e.target.value === '' ? null : e.target.value === 'true' }) },
                TRI_OPTIONS.map((o) => h('option', { key: o.value, value: o.value }, o.label)),
              ),
            ),
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '自动化 ID'),
              h('input', { className: 'wbed-input', value: en.automationId, onChange: (e) => set({ automationId: e.target.value }) }),
            ),
          ),
          // 选择性 / 递归 / 概率 开关
          h('div', { className: 'wbed-checks' },
            h('label', { className: 'wbed-check' }, h('input', { type: 'checkbox', checked: en.selective, onChange: (e) => set({ selective: e.target.checked }) }), h('span', null, '选择性（启用副触发词限制）')),
            h('label', { className: 'wbed-check' }, h('input', { type: 'checkbox', checked: en.excludeRecursion, onChange: (e) => set({ excludeRecursion: e.target.checked }) }), h('span', null, '不可递归')),
            h('label', { className: 'wbed-check' }, h('input', { type: 'checkbox', checked: en.delayUntilRecursion !== false, onChange: (e) => set({ delayUntilRecursion: e.target.checked ? 1 : false }) }), h('span', null, '延迟到递归')),
            h('label', { className: 'wbed-check' }, h('input', { type: 'checkbox', checked: en.preventRecursion, onChange: (e) => set({ preventRecursion: e.target.checked }) }), h('span', null, '防止进一步递归')),
            h('label', { className: 'wbed-check' }, h('input', { type: 'checkbox', checked: en.useProbability, onChange: (e) => set({ useProbability: e.target.checked }) }), h('span', null, '无视回复概率')),
          ),
          // 内容（大文本非受控：击键不触发弹窗重渲染，保存时才取值）
          h(ContentArea, { textareaRef: props.contentRef, initial: en.content }),
          // 包含组 / 组权重 / 粘性 / 冷却 / 延迟
          h('div', { className: 'wbed-effect-grid' },
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '包含组 ', h('span', { className: 'wbed-help' }, '?')),
              h('label', { className: 'wbed-inline-check' }, h('input', { type: 'checkbox', checked: en.groupOverride, onChange: (e: { target: { checked: boolean } }) => set({ groupOverride: e.target.checked }) }), h('span', null, '确定优先级')),
              h('input', { className: 'wbed-input', placeholder: '只有一个带有相同标签', value: en.group, onChange: (e: { target: { value: string } }) => set({ group: e.target.value }) }),
            ),
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '组权重'),
              h('input', { className: 'wbed-input', type: 'number', min: 1, value: String(en.groupWeight), onChange: (e: { target: { value: string } }) => set({ groupWeight: Number(e.target.value) || 100 }) }),
            ),
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '粘性 💬'),
              h('select', { className: 'wbed-select', value: en.sticky === null ? '' : String(en.sticky), onChange: (e: { target: { value: string } }) => set({ sticky: e.target.value === '' ? null : Number(e.target.value) }) },
                h('option', { value: '' }, '无粘性'),
                h('option', { value: '1' }, '1 轮'),
                h('option', { value: '2' }, '2 轮'),
              ),
            ),
            h('div', { className: 'wbed-field', style: { gridColumn: 4 } },
              h('label', { className: 'wbed-label' }, '冷却 💬'),
              h('select', { className: 'wbed-select', value: en.cooldown === null ? '' : String(en.cooldown), onChange: (e: { target: { value: string } }) => set({ cooldown: e.target.value === '' ? null : Number(e.target.value) }) },
                h('option', { value: '' }, '无冷却'),
                h('option', { value: '1' }, '1 轮'),
              ),
            ),
            h('div', { className: 'wbed-field' },
              h('label', { className: 'wbed-label' }, '延迟 ⏳'),
              h('select', { className: 'wbed-select', value: en.delay === null ? '' : String(en.delay), onChange: (e: { target: { value: string } }) => set({ delay: e.target.value === '' ? null : Number(e.target.value) }) },
                h('option', { value: '' }, '无延迟'),
                h('option', { value: '1' }, '1 轮'),
                h('option', { value: '2' }, '2 轮'),
                h('option', { value: '3' }, '3 轮'),
                h('option', { value: '4' }, '4 轮'),
                h('option', { value: '5' }, '5 轮'),
              ),
            ),
          ),
          // 额外匹配来源
          h('section', { className: 'wbed-section' },
            h('div', { className: 'wbed-section-head' },
              h('span', { className: 'wbed-accent' }), '额外匹配来源',
              h('button', { className: 'wbed-fold', style: { marginLeft: 'auto', width: 32, height: 32, background: 'var(--ml-pink-0)', color: 'var(--ml-pink-6)' }, onClick: () => setSourcesOpen(!sourcesOpen) }, sourcesOpen ? '⌃' : '⌄'),
            ),
            sourcesOpen && h('div', { className: 'wbed-sources' },
              [
                { label: '角色描述', key: 'matchPersonaDescription' as const },
                { label: '用户设定描述', key: 'matchCharacterDescription' as const },
                { label: '角色性格', key: 'matchCharacterPersonality' as const },
                { label: '角色备注', key: 'matchCharacterDepthPrompt' as const },
                { label: '情景', key: 'matchScenario' as const },
                { label: '创作者的注释', key: 'matchCreatorNotes' as const },
              ].map(({ label, key }) => h('label', { key, className: 'wbed-check' }, h('input', { type: 'checkbox', checked: en[key], onChange: (e: { target: { checked: boolean } }) => set({ [key]: e.target.checked }) }), h('span', null, label))),
            ),
          ),
        ),
        h('footer', { className: 'wbed-footer' },
          h('div', { className: 'wbed-foot' },
            h('span', null, '世界书条目 · UID: ', String(en.position + 1)),
            h('button', { className: 'wbed-btn', onClick: props.onClose }, '取消'),
            h('button', { className: 'wbed-btn primary', onClick: props.onSave }, '保存条目'),
          ),
        ),
      ),
  )
}

function splitCsv(s: string): string[] {
  const out: string[] = []
  for (const part of s.split(',')) {
    const p = part.trim()
    if (p) out.push(p)
  }
  return out
}

// 内容编辑区：textarea 非受控（仅初始值 + ref），输入不触发弹窗重渲染；字符计数用独立 state
function ContentArea(props: { textareaRef: React.RefObject<HTMLTextAreaElement | null>; initial: string }) {
  const [len, setLen] = useState(props.initial.length)
  const [expanded, setExpanded] = useState(false)
  return h('div', null,
    h('div', { className: 'wbed-content-title' },
      h('b', null, '内容'),
      h('button', { className: 'wbed-expand', title: expanded ? '收起' : '展开（全屏）', onClick: () => setExpanded(!expanded) }, expanded ? '⛶' : '⛶'),
      h('span', { className: 'wbed-content-title' }, `（Token：${len}）`),
    ),
    h('textarea', {
      className: 'wbed-area' + (expanded ? ' wbed-area-expanded' : ''),
      placeholder: '这个关键词对 AI 的含义，逐字发送',
      defaultValue: props.initial,
      ref: props.textareaRef,
      onInput: (e: { target: { value: string } }) => setLen((e.target as HTMLTextAreaElement).value.length),
    }),
  )
}

function toggleField(label: string, checked: boolean, onChange: (v: boolean) => void) {
  return h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--ml-label)' } },
    h('span', { style: { flex: 1 } }, label),
    h('input', { type: 'checkbox', style: { accentColor: 'var(--ml-pink-5)', width: 18, height: 18 }, checked, onChange: (e: { target: { checked: boolean } }) => onChange(e.target.checked) }),
  )
}

export { WorldbooksPage }
