import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb } from '../lib/db/index.js'
import * as wb from '../lib/data/worldbook.js'

const fixture = fileURLToPath(new URL('./fixtures/注入测试世界书.json', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'wb-display-'))
openDb(dir)

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

// 1) 导入真实 ST 世界书（含 display_index？ST 内部格式没有 display_index，应退化为导入顺序）
const sample = JSON.parse(readFileSync(fixture, 'utf8'))
const book = wb.create('星穹铁道')
const parsed = wb.parseStWorldJson(JSON.stringify(sample))
wb.replaceEntries(book.id, parsed.entries)
let rows = wb.entries(book.id)
check('导入后 display_index 按序 0..12', rows.every((r, i) => r.display_index === i))

// 2) 导出含 extensions.display_index，与自定义顺序一致
const exported = JSON.parse(wb.toStWorldJson(book.id))
const ex0 = exported.entries['0']
check('导出 entry[0].extensions.display_index=0', ex0.extensions?.display_index === 0)

// 3) reorder：颠倒顺序 → display_index 重写
const ids = rows.map((r) => r.id)
wb.reorderEntries(book.id, [...ids].reverse())
rows = wb.entries(book.id)
check('reorder 后第0条是原最后一条', rows[0].id === ids[ids.length - 1])
check('reorder 后 display_index 重新 0..12', rows.every((r, i) => r.display_index === i))

// 4) reorder 后导出顺序跟随新 display_index
const exported2 = JSON.parse(wb.toStWorldJson(book.id))
check('reorder 后导出[0].uid=0', exported2.entries['0'].uid === 0)
check('reorder 后导出[0].extensions.display_index=0', exported2.entries['0'].extensions?.display_index === 0)

// 5) 解析带 extensions.display_index 的 JSON → 导入后保留自定义顺序
const parsed2 = wb.parseStWorldJson(wb.toStWorldJson(book.id))
const book2 = wb.create('还原书')
wb.replaceEntries(book2.id, parsed2.entries)
rows = wb.entries(book2.id)
check('带 display_index 再导入，顺序保留', rows.every((r, i) => r.display_index === i))

// 6) addEntry 自动分配新 display_index
const added = wb.addEntry(book2.id, { comment: '新条目', content: 'X' })
check('addEntry 排在末尾（display_index=13）', wb.toEntryView(added).displayIndex === rows.length)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
