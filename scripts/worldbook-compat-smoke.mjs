import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import * as wb from '../lib/data/worldbook.js'
import * as inj from '../lib/context/worldbook.js'
import * as setting from '../lib/data/setting.js'
import { resolveWorldbookContext, resolveBoundBooks } from '../lib/data/character.js'
import { createOperations } from '../lib/integration/operations.js'
import { resolveSessionBooks, resolveSessionInjection } from '../lib/integration/source.js'
import { applyEngine } from '../lib/integration/engine.js'
import { scopeGuard } from '../lib/tools/index.js'

const dir = mkdtempSync(join(tmpdir(), 'wb-compat-'))
openDb(dir)

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, detail) }
}

console.log('1) 设置项')
setting.setCompatEnabled(false)
check('compatEnabled 默认关', setting.compatEnabled() === false)
setting.setCompatEnabled(true)
check('compatEnabled 可开', setting.compatEnabled() === true)
setting.setCompatEnabled(false)
setting.setExposeOperations(true)
check('兼容关闭时 exposeOperations 失效', setting.exposeOperations() === false)
setting.setCompatEnabled(true)
check('兼容开启时 exposeOperations 可开', setting.exposeOperations() === true)
setting.setCompatEnabled(false)
check('兼容关闭不改变 exposeOperations 原始值', setting.get('exposeOperations') === 'true')
setting.setCompatEnabled(true)
check('重新开启恢复 exposeOperations', setting.exposeOperations() === true)
setting.setExposeOperations(false)

console.log('2) data 层：按名查找')
const bound = wb.create('绑定书')
wb.addEntry(bound.id, { key: ['魔'], content: 'C:魔法知识' })
wb.setEnabled(bound.id, false)
check('findByName 精确命中', wb.findByName('绑定书')?.id === bound.id)
check('findByName 大小写不同不命中', wb.findByName('绑定书 ') === null)
check('findByName 不存在返回 null', wb.findByName('不存在') === null)
check('findByNameMany 跳过不存在', wb.findByNameMany(['绑定书', '不存在']).length === 1)

console.log('3) 注入：绑定书（全局未启用也被注入）')
const r1 = inj.renderWorldbookInjection(['魔'], { boundBookNames: ['绑定书'] })
check('绑定书条目被注入', r1.some((x) => x.content === 'C:魔法知识'))
const r2 = inj.renderWorldbookInjection(['魔'])
check('无绑定时不注入全局禁用的书', r2.length === 0)

console.log('4) 注入：宿主 source 书（ST 格式）')
const r3 = inj.renderWorldbookInjection(['剑'], {
  sourceBooks: [{ name: '宿主书', entries: [{ key: ['剑'], content: 'C:宿主剑术' }] }],
})
check('宿主书条目被注入', r3.some((x) => x.content === 'C:宿主剑术'))
const profileSource = {
  name: '规范化宿主书',
  entries: [{
    key: ['协议键'],
    keysecondary: [],
    content: 'C:规范化 profile',
    constant: false,
    selective: false,
    disable: false,
    order: 100,
    position: 0,
    extensions: { hostField: 'preserved-by-host' },
  }],
}
const rProfile = inj.renderWorldbookInjection(['协议键'], { sourceBooks: [profileSource] })
check('第三方 profile 书可直接注入', rProfile.some((x) => x.content === 'C:规范化 profile'))

console.log('5) 注入：source + 绑定 + 全局书合并去重')
const global = wb.create('全局书')
wb.setEnabled(global.id, true)
wb.addEntry(global.id, { key: ['全'], content: 'C:全局' })
const r4 = inj.renderWorldbookInjection(['剑 魔 全'], {
  sourceBooks: [{ name: '宿主书', entries: [{ key: ['剑'], content: 'C:宿主剑术' }] }],
  boundBookNames: ['绑定书'],
})
check('合并注入含宿主书', r4.some((x) => x.content === 'C:宿主剑术'))
check('合并注入含绑定书', r4.some((x) => x.content === 'C:魔法知识'))
check('合并注入含全局书', r4.some((x) => x.content === 'C:全局'))
const sameName = wb.create('宿主书')
wb.setEnabled(sameName.id, true)
wb.addEntry(sameName.id, { key: ['剑'], content: 'C:重复' })
const r5 = inj.renderWorldbookInjection(['剑'], {
  sourceBooks: [{ name: '宿主书', entries: [{ key: ['剑'], content: 'C:宿主剑术' }] }],
})
check('同名书去重（source 优先）', r5.some((x) => x.content === 'C:宿主剑术') && !r5.some((x) => x.content === 'C:重复'))

console.log('6) worldbook.context 解析')
const fakeCtx = {
  get: (k) => (k === 'worldbook.context'
    ? { get: () => ({ character: { name: 'alice', tags: ['x'] }, books: ['绑定书'] }) }
    : undefined),
}
check('resolveWorldbookContext 返回角色', resolveWorldbookContext(fakeCtx, 's1')?.character?.name === 'alice')
check('resolveBoundBooks 返回绑定书', resolveBoundBooks(fakeCtx, 's1').includes('绑定书'))
const emptyCtx = { get: () => undefined }
check('无提供方时 books 为空', resolveBoundBooks(emptyCtx, 's1').length === 0)

console.log('7) resolveSessionBooks（source + context 装配）')
const fakeAgent = { id: 's1', session: { events: [] } }
const hostCtx = {
  get: (k) => {
    if (k === 'worldbook.source') return { readBooks: () => [{ name: '宿主书', entries: [{ key: ['剑'], content: 'C:宿主剑术' }] }] }
    if (k === 'worldbook.context') return { get: () => ({ character: { name: 'alice', tags: [] }, books: ['绑定书'] }) }
    return undefined
  },
}
const sb = resolveSessionBooks(hostCtx, fakeAgent)
check('sourceBooks 取到宿主书', sb.sourceBooks?.length === 1 && sb.sourceBooks[0].name === '宿主书')
check('boundBookNames 取到绑定书', sb.boundBookNames.includes('绑定书'))

console.log('7b) 双模式闸门：兼容总开关控制角色卡绑定部分')
setting.setCompatEnabled(false)
const off = resolveSessionInjection(hostCtx, fakeAgent)
check('兼容关闭：不消费绑定书', off.boundBookNames.length === 0)
check('兼容关闭：不消费角色上下文', off.character === undefined)
check('兼容关闭：不消费 source', off.sourceBooks === undefined)
setting.setCompatEnabled(true)
const on = resolveSessionInjection(hostCtx, fakeAgent)
check('兼容开启：消费绑定书', on.boundBookNames.includes('绑定书'))
check('兼容开启：消费角色上下文', on.character?.name === 'alice')
check('兼容开启：消费 source', on.sourceBooks?.length === 1)
setting.setCompatEnabled(false)

console.log('8) worldbook.operations CRUD')
const ops = createOperations()
ops.createBook({ name: 'op书', description: 'd', entries: [{ key: ['k'], content: 'C:op' }] })
check('listBooks 看到新书', ops.listBooks().some((b) => b.name === 'op书' && b.entryCount === 1))
check('getBook 返回条目', ops.getBook('op书').entries.length === 1)
const opEntryId = ops.getBook('op书').entries[0].id
ops.updateEntry('op书', opEntryId, { content: 'C:op改' })
check('updateEntry 生效', ops.getBook('op书').entries[0].content === 'C:op改')
ops.toggleEntry('op书', opEntryId, true)
check('toggleEntry 启用条目', ops.getBook('op书').entries[0].disable === false)
ops.setBookEnabled('op书', false)
check('setBookEnabled 停用书', ops.listBooks().find((b) => b.name === 'op书')?.enabled === false)
ops.updateBook('op书', { name: 'op书2', entries: [{ key: ['a'], content: 'C:2' }] })
check('updateBook 改名+替换条目', ops.listBooks().some((b) => b.name === 'op书2') && !ops.listBooks().some((b) => b.name === 'op书'))
ops.deleteBook('op书2')
check('deleteBook 删除', !ops.listBooks().some((b) => b.name === 'op书2'))
let threw = false
try { ops.getBook('不存在书') } catch { threw = true }
check('操作不存在书抛错', threw)
let invalidCode = ''
try { ops.createBook({ name: '', entries: [] }) } catch (error) { invalidCode = error?.code ?? '' }
check('非法书名返回 INVALID_ARGUMENT', invalidCode === 'INVALID_ARGUMENT')

console.log('10) 开发模式条目权限')
setting.setDevMode(true)
setting.setDevAction('edit')
setting.setDevBookId(bound.id)
setting.setDevEntryIds(['allowed-entry'])
setting.setDevPerms(['update', 'delete', 'create', 'read'])
check('选中条目允许更新', scopeGuard({ action: 'update_entry', bookId: bound.id, entryId: 'allowed-entry' }) === undefined)
check('未选中条目拒绝更新', scopeGuard({ action: 'update_entry', bookId: bound.id, entryId: 'other-entry' })?.ok === false)
check('缺少条目标识拒绝更新', scopeGuard({ action: 'update_entry', bookId: bound.id })?.ok === false)
check('选中条目后拒绝新增', scopeGuard({ action: 'create_entry', bookId: bound.id })?.ok === false)
check('其它世界书拒绝更新', scopeGuard({ action: 'update_entry', bookId: 'other-book', entryId: 'allowed-entry' })?.ok === false)
setting.setDevEntryIds([])
check('未选择条目时允许更新全部条目', scopeGuard({ action: 'update_entry', bookId: bound.id, entryId: 'other-entry' }) === undefined)
setting.setDevMode(false)

console.log('9) worldbook.engine active 实时反映设置')
let provided = null
const fakeCtx2 = { provide: (k, v) => { provided = v } }
setting.setCompatEnabled(true)
applyEngine(fakeCtx2)
check('compat 开启时 active=true', provided.active === true)
setting.setCompatEnabled(false)
check('compat 关闭时 active=false', provided.active === false)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
