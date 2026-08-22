// agent-rp 兼容冒烟测试：事件解析 / 迁移映射 / source 适配 / context 桥接 / 覆盖态。
// 运行：npm run build:host && node scripts/worldbook-agentrp-smoke.mjs

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import {
  readTavernHelperState,
  activeCharacterBook,
  readStandaloneBooks,
  assembleSessionBooks,
  readWorldInfoConfiguration,
  parseWorldInfoConfigurationRequest,
  applyConfigurationRequest,
} from '../lib/compat/agent-rp/events.js'
import * as arpImport from '../lib/compat/agent-rp/import.js'
import { createAgentRpSource } from '../lib/compat/agent-rp/adapter.js'
import { applyAgentRpContext } from '../lib/compat/agent-rp/character.js'

const dir = mkdtempSync(join(tmpdir(), 'wb-agentrp-'))
openDb(dir)

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, detail) }
}

const LIB = 'world-info-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const RAW_ST = { name: '独立书X', entries: { '0': { key: ['x'], content: 'C:X' } } }
const META = { format: 0, result: { name: '独立书X', sourceAttachmentId: `library:${LIB}`, entryCount: 1 }, raw: RAW_ST }

const seedEvent = { type: 'agent-rp/world-info-library-seed', seq: 1, data: { format: 0, worldInfoLibraryId: LIB, meta: META } }
const libraryImportEvent = {
  type: 'command/done', seq: 2, data: { kind: 'success', text: `agent-rp-world-info-library-v0:${JSON.stringify({ format: 0, importId: LIB, meta: META })}` },
}
const toolImportEvents = [
  { type: 'tool/call', seq: 3, data: { name: 'import_world_info', callId: 'c1' } },
  { type: 'tool/result', seq: 4, data: { message: { content: [{ toolCallId: 'c1', isError: false }] }, meta: META } },
]
const characterSeedEvent = {
  type: 'agent-rp/character-card-seed', seq: 5, data: {
    format: 0,
    source: { attachmentConsumer: 'dsh-agent-rp', attachments: [] },
    meta: {
      format: 0,
      result: { name: 'alice', sourceAttachmentId: 'att1' },
      raw: { name: 'alice', data: { name: 'alice', nickname: 'Alice', character_book: { name: 'Alice的书', entries: { '0': { key: ['卡'], content: 'C:card' } } } } },
    },
  },
}
const scriptEntry = {
  uid: 0, name: 'e', enabled: true,
  strategy: { type: 'constant', keys: ['k'], keys_secondary: { logic: 'and_any', keys: [] } },
  position: { type: 'before_character_definition', role: 'system', depth: 4, order: 100 },
  content: 'C:script', probability: 100,
}
const tavernEvent = {
  type: 'agent-rp/tavern-state', seq: 6, data: {
    format: 0, characterSourceId: 'c', revision: 0,
    scopes: { global: {}, preset: {}, character: {}, chat: {}, message: {} }, scripts: {},
    worldbooks: { ScriptBook: [scriptEntry] },
    worldbookBindings: { global: ['ScriptBook'] },
  },
}

console.log('1) Tavern Helper 状态解析')
const tavern = readTavernHelperState([tavernEvent])
check('agent-rp/tavern-state 解析出脚本书', tavern?.worldbooks?.['ScriptBook']?.length === 1)
check('解析出绑定', tavern?.worldbookBindings?.global?.includes('ScriptBook') === true)
const tavernViaCommand = readTavernHelperState([{
  type: 'command/done', seq: 0, data: { kind: 'success', text: `agent-rp-tavern-helper-v0:${JSON.stringify({ format: 0, characterSourceId: 'c', revision: 0, scopes: { global: {}, preset: {}, character: {}, chat: {}, message: {} }, scripts: {}, worldbooks: { ScriptBook: [scriptEntry] } })}` },
}])
check('command/done 文本解析 TavernHelperState', tavernViaCommand?.worldbooks?.['ScriptBook']?.length === 1)

console.log('2) 角色卡书解析')
const card = activeCharacterBook([characterSeedEvent])
check('角色卡书 sourceKey', card?.sourceKey === 'character:att1')
check('角色卡书名（昵称兜底）', card?.name === 'Alice的书')
check('角色卡书条目', card?.entries?.length === 1 && card.entries[0].content === 'C:card')
const libraryLaunchEvent = {
  type: 'command/done', seq: 4, data: { kind: 'success', text: `agent-rp-character-library-v0:${JSON.stringify({ format: 0, libraryId: 'card-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', meta: { format: 0, result: { name: 'alice', sourceAttachmentId: 'library:card-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, raw: characterSeedEvent.data.meta.raw } })}` },
}
const cardFromLibrary = activeCharacterBook([libraryLaunchEvent])
check('角色库命令 → 卡书', cardFromLibrary?.sourceKey === 'character:library:card-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' && cardFromLibrary?.name === 'Alice的书')

console.log('3) 独立世界书解析（种子/命令/工具）')
check('种子 → 独立书', readStandaloneBooks([seedEvent]).length === 1)
check('导入命令 → 独立书', readStandaloneBooks([libraryImportEvent]).length === 1)
check('工具结果 → 独立书', readStandaloneBooks(toolImportEvents).length === 1)
const merged = readStandaloneBooks([seedEvent, libraryImportEvent, ...toolImportEvents])
check('同书去重保序', merged.length === 1 && merged[0].sourceKey === `standalone:library:${LIB}`)

console.log('4) 会话书组装（卡书 + 独立书 + 脚本书 + 绑定过滤）')
const assembled = assembleSessionBooks([characterSeedEvent, seedEvent, tavernEvent])
const names = assembled.map(b => b.name).sort()
check('卡书在列（bindings.character 缺省）', names.includes('Alice的书'))
check('独立书被 bindings.global 过滤', !names.includes('独立书X'))
check('脚本书在列（bindings.global）', names.includes('ScriptBook'))
check('脚本书条目转 ST', assembled.find(b => b.name === 'ScriptBook')?.entries[0]?.content === 'C:script')
const noBindingTavern = { type: 'agent-rp/tavern-state', seq: 7, data: { format: 0, characterSourceId: 'c', revision: 0, scopes: { global: {}, preset: {}, character: {}, chat: {}, message: {} }, scripts: {}, worldbooks: { ScriptBook: [scriptEntry] } } }
const assembledNoBinding = assembleSessionBooks([noBindingTavern])
check('无绑定时代入站书不含 script', !assembledNoBinding.some(b => b.sourceKey.startsWith('script:')))

console.log('5) 世界书覆盖态（agent-rp-world-info-v0:）')
const cfgEvents = [{ type: 'command/done', seq: 0, data: { kind: 'success', text: 'agent-rp-world-info-v0:' + JSON.stringify({ format: 0, revision: 0, overrides: [] }) } }]
const state = readWorldInfoConfiguration(cfgEvents)
check('读覆盖态 revision=0', state?.revision === 0)
const req = parseWorldInfoConfigurationRequest(JSON.stringify({ operation: 'toggle', revision: 0, bookId: 'standalone:x', entryIndex: 0, enabled: true }))
const next = applyConfigurationRequest(state, req)
check('toggle 后 revision+1', next.revision === 1)
check('toggle 覆盖写入', next.overrides.some(o => o.bookId === 'standalone:x' && o.entryIndex === 0))
let revRejected = false
try { applyConfigurationRequest(next, req) } catch { revRejected = true }
check('revision 不匹配拒绝', revRejected)

console.log('6) 迁移与映射')
const imported = arpImport.ensureSourceBook('standalone:library:' + LIB, { name: '独立书X', entries: [{ key: ['x'], content: 'C:X' }] })
check('ensureSourceBook 返回书名', imported.name === '独立书X')
check('isMigrated 命中', arpImport.isMigrated('standalone:library:' + LIB) === true)
check('sourceBookName 解析', arpImport.sourceBookName('standalone:library:' + LIB) === '独立书X')
check('未知 sourceKey 未迁移', arpImport.isMigrated('character:unknown') === false)
const importedTwice = arpImport.ensureSourceBook('standalone:library:' + LIB, { name: '独立书X', entries: [{ key: ['y'], content: 'C:Y' }] })
check('重复迁移复用同书', importedTwice.bookId === imported.bookId)
arpImport.rememberSessionBook('s1', '独立书X')
check('会话活跃书记录', arpImport.sessionActiveBooks('s1').includes('独立书X'))
arpImport.forgetSession('s1')
check('会话活跃书清理', arpImport.sessionActiveBooks('s1').length === 0)

console.log('6b) 角色卡内嵌书迁移（会话活跃 + 绑定本库）')
const shelf = arpImport.migrateLibraryShelf()
check('对方库同步幂等不抛错', Array.isArray(shelf))
const cardName = arpImport.ensureSessionCardBook('s2', [characterSeedEvent])
check('卡书迁入本库并返回书名', cardName === 'Alice的书')
check('卡书 sourceKey 已迁移', arpImport.isMigrated('character:att1') === true)
check('卡书记为会话活跃', arpImport.sessionActiveBooks('s2').includes('Alice的书'))
check('重复迁移返回现名', arpImport.ensureSessionCardBook('s2', [characterSeedEvent]) === 'Alice的书')
check('卡书现可被 source 适配跳过', createAgentRpSource(() => ({ session: { events: [characterSeedEvent] } })).readBooks('s2').length === 0)

console.log('7) worldbook.source 适配（已迁移跳过 / 脚本书直出）')
const source = createAgentRpSource((sessionId) => ({
  session: { events: sessionId === 'empty' ? [] : sessionId === 'seed' ? [seedEvent] : sessionId === 'tavern' ? [tavernEvent] : sessionId === 'card' ? [{ ...characterSeedEvent, data: { ...characterSeedEvent.data, meta: { ...characterSeedEvent.data.meta, result: { ...characterSeedEvent.data.meta.result, sourceAttachmentId: 'att2' } } } }] : [] },
}))
check('空会话 → 空书', source.readBooks('empty').length === 0)
check('已迁移独立书被跳过', source.readBooks('seed').length === 0)
const scriptOut = source.readBooks('tavern')
check('脚本书原样交给注入引擎', scriptOut.length === 1 && scriptOut[0].name === 'ScriptBook')
const cardOut = source.readBooks('card')
check('未迁移卡书直出', cardOut.length === 1 && cardOut[0].name === 'Alice的书')

console.log('8) worldbook.context 桥接')
function makeCtx(provided = {}) {
  const provides = new Map()
  const ctx = {
    provides,
    get(k) { return provided[k] },
    provide(k, v) {
      if (provides.has(k)) throw new Error(`service "${String(k)}" has been registered`)
      provides.set(k, v); return () => provides.delete(k)
    },
    on() { return () => {} },
    logger: { info() {}, warn() {} },
  }
  return ctx
}
const c1 = makeCtx()
applyAgentRpContext(c1)
await new Promise(resolve => setImmediate(resolve))
check('提供 worldbook.context', c1.provides.has('worldbook.context'))
check('不抢注册 agent-rp characterContext', !c1.provides.has('worldbook.characterContext'))
const c2provided = { register() {}, getCurrentCharacter() { return undefined } }
const c2provides = new Map([['worldbook.characterContext', c2provided]])
const c2 = {
  provides: c2provides,
  get(k) { return k === 'worldbook.characterContext' ? c2provided : undefined },
  provide(k, v) { if (c2provides.has(k)) throw new Error(`service "${String(k)}" has been registered`); c2provides.set(k, v); return () => c2provides.delete(k) },
  on() { return () => {} },
  logger: { info() {}, warn() {} },
}
applyAgentRpContext(c2)
await new Promise(resolve => setImmediate(resolve))
check('host 模式跳过注册（使用对方提供的）', c2provides.get('worldbook.characterContext') === c2provided)
check('host 模式仍提供 worldbook.context', c2.provides.has('worldbook.context'))
const provider = c2.provides.get('worldbook.context')
const got = provider.get('s1')
check('context.get 返回对象', typeof got === 'object' && got !== null)
check('无角色时 character 缺席', got.character === undefined)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
