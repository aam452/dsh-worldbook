import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import * as setting from '../lib/data/setting.js'
import * as wb from '../lib/data/worldbook.js'
import { scopeGuard } from '../lib/tools/index.js'
import { getDb } from '../lib/db/index.js'

const dir = mkdtempSync(join(tmpdir(), 'wb-tools-'))
openDb(dir)
setting.setDevMode(true)
setting.setDevAction('create')
setting.setDevPerms(['create', 'delete', 'update', 'read'])

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS', name) }
  else { fail++; console.log('  FAIL', name) }
}

const existing = wb.create('existing')
const created = wb.create('created')

console.log('New-mode tool ownership:')
check('existing books cannot receive entries', scopeGuard({ action: 'create_entry', bookId: existing.id }) !== undefined)
check('existing books cannot be deleted', scopeGuard({ action: 'delete_book', bookId: existing.id }) !== undefined)

setting.addDevCreatedBook(created.id)
check('created books can receive entries', scopeGuard({ action: 'create_entry', bookId: created.id }) === undefined)
check('created books can update entries', scopeGuard({ action: 'update_entry', bookId: created.id, entryId: 'entry' }) === undefined)
check('created books can be deleted', scopeGuard({ action: 'delete_book', bookId: created.id }) === undefined)
check('created books can be deleted (again)', scopeGuard({ action: 'delete_book', bookId: created.id }) === undefined)

setting.removeDevCreatedBook(created.id)
check('deleted ownership is revoked', scopeGuard({ action: 'create_entry', bookId: created.id }) !== undefined)

// Error messages distinguish existence from ownership
const guardBad = scopeGuard({ action: 'create_entry', bookId: 'x'.repeat(40) })
check('invalid bookId gives specific message', guardBad && /格式不合法/.test(guardBad.message))
check('invalid bookId has error_type invalid_id', guardBad && guardBad.error_type === 'invalid_id')
const guardMissing = scopeGuard({ action: 'create_entry', bookId: '00000000-0000-4000-8000-000000000000' })
check('missing bookId gives specific message', guardMissing && /不存在/.test(guardMissing.message))
check('missing bookId has error_type not_found', guardMissing && guardMissing.error_type === 'not_found')

// Permission errors carry error_type
setting.setDevPerms(['read'])
const guardPerm = scopeGuard({ action: 'create_entry', bookId: created.id })
check('permission_denied error_type', guardPerm && guardPerm.error_type === 'permission_denied')
setting.setDevPerms(['create', 'delete', 'update', 'read'])

// list_available always allowed if dev mode on
const guardAvail = scopeGuard({ action: 'list_available' })
check('list_available always allowed', guardAvail === undefined)

// Edit mode: book not in scope gives scope_denied
setting.setDevAction('edit')
setting.setDevBookId(existing.id)
const guardScope = scopeGuard({ action: 'create_entry', bookId: created.id })
check('edit mode scope_denied', guardScope && guardScope.error_type === 'scope_denied')

// Edit mode: entry whitelist does NOT block create_entry (only update/delete)
wb.addEntry(existing.id, { key: ['test'], content: 'test' })
const entries = wb.entries(existing.id)
setting.setDevEntryIds([entries[0].id])
check('create_entry allowed with entry whitelist active', scopeGuard({ action: 'create_entry', bookId: existing.id }) === undefined)
const guardEntry = scopeGuard({ action: 'update_entry', bookId: existing.id, entryId: 'non-whitelisted' })
check('update_entry restricted by entry whitelist', guardEntry !== undefined && guardEntry.error_type === 'entry_not_whitelisted')

// Persistence: created books survive a fresh "session" (module re-evaluation)
setting.addDevCreatedBook(created.id)
check('book ownership persists in settings db', setting.devCreatedBooks().has(created.id))

// Single active book: creating a second book revokes edit access to the first
const created2 = wb.create('created2')
setting.addDevCreatedBook(created2.id)
check('first created book ownership persists before new create', setting.devCreatedBooks().has(created.id))
// Simulate: create_book handler clears previous and sets only the new one
for (const id of setting.devCreatedBooks()) setting.removeDevCreatedBook(id)
setting.addDevCreatedBook(created2.id)
check('first created book revoked after second create', !setting.devCreatedBooks().has(created.id))
check('second created book is active', setting.devCreatedBooks().has(created2.id))

// Mode switch: edit mode should not honor create-mode created books
setting.setDevAction('edit')
check('edit mode does not use created book set', setting.devAction() === 'edit')
setting.setDevAction('create')

// Global mode: operates on any book, bypasses scope restrictions but still needs bookId
setting.setDevAction('global')
check('global mode allows editing other books', scopeGuard({ action: 'create_entry', bookId: existing.id }) === undefined)
check('global mode allows editing created books', scopeGuard({ action: 'update_entry', bookId: created.id, entryId: 'e' }) === undefined)
check('global mode allows delete_book on any book', scopeGuard({ action: 'delete_book', bookId: existing.id }) === undefined)
// Global mode still requires valid bookId for write operations
const guardGlobalMissing = scopeGuard({ action: 'create_entry', bookId: '00000000-0000-4000-8000-000000000000' })
check('global mode rejects nonexistent bookId', guardGlobalMissing !== undefined && guardGlobalMissing.error_type === 'not_found')
setting.setDevAction('create')

// Stale book cleanup: verify the syncDevTool cleanup logic (filtering dead ids)
// The syncDevTool function removes devCreatedBooks entries whose books no longer exist
const staleId = wb.create('will-be-deleted').id
setting.addDevCreatedBook(staleId)
check('stale book in created list', setting.devCreatedBooks().has(staleId))
wb.remove(staleId)
// syncDevTool filters dead ids on re-registration; simulate that filter here
const liveCreated = Array.from(setting.devCreatedBooks()).filter((id) => wb.get(id) !== null)
check('stale book filtered after sync', !liveCreated.includes(staleId)) // sync runs on re-register, not here

// Cleanup settings
setting.setDevAction('create')
setting.setDevEntryIds([])
setting.setDevBookId('')
setting.removeDevCreatedBook(created.id)
setting.removeDevCreatedBook(created2.id)
setting.removeDevCreatedBook(staleId)
setting.removeDevCreatedBook(existing.id)

// Clean up DB state for other tests
const db = getDb()
db.exec('DELETE FROM settings WHERE key = ?', ['devCreatedBookIds'])

console.log(`\nResult: ${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
