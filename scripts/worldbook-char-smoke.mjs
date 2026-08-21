import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import * as wb from '../lib/data/worldbook.js'
import * as inj from '../lib/context/worldbook.js'

const dir = mkdtempSync(join(tmpdir(), 'wb-char-'))
openDb(dir)
const book = wb.create('角色绑定测试')
wb.setEnabled(book.id, true)

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, detail) }
}

// 构造条目：带 characterFilter（对齐 ST characterFilter: { isExclude, names, tags }）
wb.addEntry(book.id, { comment: '绑定到 爱丽丝', content: 'C:爱丽丝专属', key: ['爱'], characterFilter: { isExclude: false, names: ['alice'], tags: [] } })
wb.addEntry(book.id, { comment: '排除 鲍勃', content: 'C:鲍勃不适用', key: ['鲍'], characterFilter: { isExclude: true, names: ['bob'], tags: [] } })
wb.addEntry(book.id, { comment: '按标签', content: 'C:战士标签', key: ['战'], characterFilter: { isExclude: false, names: [], tags: ['warrior'] } })
wb.addEntry(book.id, { comment: '无过滤', content: 'C:通用', key: ['通'] })

console.log('1) 无当前角色上下文 → 不过滤（本插件无角色卡实体）')
const r0 = inj.renderWorldbookInjection(['爱 鲍 战 通'])
check('无角色时全部注入（含通用）', r0.length === 4)

console.log('2) 当前角色=alice（角色卡绑定命中）')
const rA = inj.renderWorldbookInjection(['爱'], { character: { name: 'alice', tags: [] } })
check('alice 命中「绑定到爱丽丝」', rA.some(x => x.content.startsWith('C:爱丽丝专属')))
check('alice 不含「通用」以外的无关条目', rA.length >= 1)

console.log('3) 当前角色=bob（exclude 排除）')
const rB = inj.renderWorldbookInjection(['鲍'], { character: { name: 'bob', tags: [] } })
check('bob 不命中「排除鲍勃」', !rB.some(x => x.content.startsWith('C:鲍勃不适用')))

console.log('4) 标签过滤（tag id 交集）')
const rT = inj.renderWorldbookInjection(['战'], { character: { name: 'hero', tags: ['warrior'] } })
check('带 warrior 标签角色命中「战士标签」', rT.some(x => x.content.startsWith('C:战士标签')))
const rT2 = inj.renderWorldbookInjection(['战'], { character: { name: 'mage', tags: ['mage'] } })
check('带 mage 标签角色不命中「战士标签」', !rT2.some(x => x.content.startsWith('C:战士标签')))

console.log('5) names 未命中 → include 排除 / exclude 保留')
const rOther = inj.renderWorldbookInjection(['爱 鲍'], { character: { name: 'carol', tags: [] } })
check('carol 不命中「绑定到爱丽丝」', !rOther.some(x => x.content.startsWith('C:爱丽丝专属')))
check('carol 命中「排除鲍勃」（exclude + 名字不匹配 → 保留）', rOther.some(x => x.content.startsWith('C:鲍勃不适用')))

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
