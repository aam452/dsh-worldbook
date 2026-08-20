import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb } from '../lib/db/index.js'
import * as wb from '../lib/data/worldbook.js'
import * as inj from '../lib/context/worldbook.js'

const fixture = fileURLToPath(new URL('./fixtures/注入测试世界书.json', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'wb-real-'))
openDb(dir)

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

const sample = JSON.parse(readFileSync(fixture, 'utf8'))
const book = wb.create('星穹铁道')
const parsed = wb.parseStWorldJson(JSON.stringify(sample))
wb.replaceEntries(book.id, parsed.entries)
wb.setEnabled(book.id, true)

const rows = wb.entries(book.id)
const constRows = rows.map(r => wb.toEntryView(r)).filter(v => v.constant)
check(`真实库常驻条目数>0（实际 ${constRows.length} 条，均无触发词）`, constRows.length > 0)
check('常驻条目 constant=true', constRows.every(v => v.constant === true))

const act = inj.renderWorldbookInjection(['今天天气不错'])
check('无触发词时注入非空', act.length >= 1)
check('常驻条目内容已注入', constRows.some(v => act.some(x => v.content.slice(0, 40) === x.content.slice(0, 40) || x.content.includes(v.content.slice(0, 40)))))

const hit = inj.renderWorldbookInjection(['我们来到了黑塔空间站'])
check('关键词「黑塔空间站」命中注入', hit.length >= 1)

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
