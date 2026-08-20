import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import * as wb from '../lib/data/worldbook.js'
import * as inj from '../lib/context/worldbook.js'

const dir = mkdtempSync(join(tmpdir(), 'wb-test-'))
openDb(dir)

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

// 1) 真实星穹世界书导入（ST JSON→库）
const sample = JSON.parse(readFileSync('temp/原版世界书.json', 'utf8'))
const book = wb.create('星穹铁道')
console.log('导入兼容（st 内部格式 21 条）:')
let parsed
try {
  parsed = wb.parseStWorldJson(JSON.stringify(sample))
  wb.replaceEntries(book.id, parsed.entries)
  check('条目数=21', wb.entries(book.id).length === 21)
  check('默认不启用', wb.get(book.id)?.enabled === 0)
} catch (e) {
  check('导入成功（失败：' + e.message + ')', false)
}

console.log('内部格式字段映射:')
const e0 = wb.entries(book.id)[0]
const v0 = wb.toEntryView(e0)
check('keys 有值', Array.isArray(v0.keys))
check('position 数字枚举', typeof v0.position === 'number')
check('enabled/constant 布尔', typeof v0.enabled === 'boolean' && typeof v0.constant === 'boolean')

// 2) 未启用 → 不注入
console.log('注入（未启用为空）:')
check('未启用注入 0 条', inj.renderWorldbookInjection(['黑塔空间站']).length === 0)

// 3) 启用 + constant/关键词命中
console.log('注入（启用后）:')
wb.setEnabled(book.id, true)
const act = inj.renderWorldbookInjection(['我们来到了黑塔空间站'])
check('注入非空', act.length >= 1)
check('命中内容含关键词上下文或常驻', act.some((x) => x.content.length > 0))

// 4) 条目 CRUD + 字段值
console.log('条目 CRUD:')
const b2 = wb.create('CRUD 书')
const added = wb.addEntry(b2.id, {
  keys: ['甲', '乙'], comment: '测试条目', content: '正文', constant: false,
  selective: true, selectiveLogic: 1, insertionOrder: 50, position: 1,
  enabled: true, priority: 3, caseSensitive: true, matchWholeWords: false,
  scanDepth: 4, excludeRecursion: true, preventRecursion: false,
  useProbability: true, probability: 100, depth: 4, sticky: 2, cooldown: 1, delay: 0,
  outletName: 'o1', group: 'g1', groupOverride: false, groupWeight: 100, automationId: 'a1',
})
const av = wb.toEntryView(added)
check('keys=甲,乙', av.keys.join() === '甲,乙')
check('comment=测试条目', av.comment === '测试条目')
check('selectiveLogic=1', av.selectiveLogic === 1)
check('position=1(after_char)', av.position === 1)
check('caseSensitive=true', av.caseSensitive === true)
check('sticky=2', av.sticky === 2)
check('outletName=o1', av.outletName === 'o1')

wb.updateEntry(b2.id, added.id, { content: '改后', constant: true })
const updated = wb.getEntry(b2.id, added.id)
const uv = wb.toEntryView(updated)
check('updateEntry 内容=改后', uv.content === '改后')
check('updateEntry constant=true', uv.constant === true)
check('updateEntry 保留 keys', uv.keys.join() === '甲,乙')

// 5) ST 导出还原
console.log('导出还原:')
const st = JSON.parse(wb.toStWorldJson(book.id))
const st0 = st.entries['0']
check('导出 entries 键数=21', Object.keys(st.entries).length === 21)
check('导出[0] 有 key 字段', 'key' in st0 || 'keys' in st0)
check('导出有 constant', 'constant' in st0)
check('导出有 position', 'position' in st0)

// 6) 重新导入（导出→导入 幂等）
console.log('导出→导入 幂等:')
const b3 = wb.create('还原书')
const parsed2 = wb.parseStWorldJson(wb.toStWorldJson(book.id))
wb.replaceEntries(b3.id, parsed2.entries)
check('还原后条数与源一致', wb.entries(b3.id).length === wb.entries(book.id).length)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
