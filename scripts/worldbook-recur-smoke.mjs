import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import * as wb from '../lib/data/worldbook.js'
import * as inj from '../lib/context/worldbook.js'

const dir = mkdtempSync(join(tmpdir(), 'wb-recur-'))
openDb(dir)
const book = wb.create('递归与粘性测试')
wb.setEnabled(book.id, true)

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, detail) }
}

// 构造测试条目（book 内同 order 递增，避免排序干扰）
// 注意：本项目默认 excludeRecursion=true（不可递归），需要递归激活的条目须显式 excludeRecursion: false。
// A：关键词「甲」命中后，content 含「乙」，可触发递归
// B：关键词「乙」，被 A 递归命中
// C：excludeRecursion，关键词「丙」，递归轮应跳过
// D：preventRecursion，关键词「丁」，命中但 content 不入递归 buffer
// E：sticky=3，命中后持续 3 轮强制注入
// F：cooldown=3，命中后 3 轮内抑制
const mk = (comment, patch) => {
  const row = wb.addEntry(book.id, { comment, content: `C:${comment}`, keys: [], enabled: true, ...patch })
  return row.id
}
const A = mk('A递归触发', { keys: ['甲'], content: 'C:A 这里包含乙', excludeRecursion: false })
const B = mk('B被递归命中', { keys: ['乙'], excludeRecursion: false })
const C = mk('C排除递归', { keys: ['丙'], excludeRecursion: true })
const D = mk('D阻止递归', { keys: ['丁'], preventRecursion: true, content: 'C:D 这里包含戊' })
const E = mk('E粘性', { keys: ['粘'], sticky: 3 })
const F = mk('F冷却', { keys: ['冷'], cooldown: 3 })

function hit(lines, cursor) {
  return inj.renderWorldbookInjection(lines, { depth: 2, cursor }).map(w => w.content)
}

console.log('1) 递归：A 命中后其 content 含「乙」，递归轮命中 B')
const r1 = hit(['甲'])
check('A 注入', r1.some(x => x.startsWith('C:A')))
check('B 被递归命中（A 的 content 含乙）', r1.some(x => x.startsWith('C:B')))

console.log('2) excludeRecursion：递归轮不被递归文本激活')
// A 命中后 content 含「丙」，递归轮 C 应被跳过（excludeRecursion），对照 H 应被激活
wb.clearTimedEffects(book.id)
const book2 = wb.create('排除递归强测')
wb.setEnabled(book2.id, true)
wb.addEntry(book2.id, { comment: 'A触发', content: 'C:A 包含丙', keys: ['甲'], excludeRecursion: false })
wb.addEntry(book2.id, { comment: 'C排除', content: 'C:C 丙条目', keys: ['丙'], excludeRecursion: true })
wb.addEntry(book2.id, { comment: 'H对照', content: 'C:H 丙条目', keys: ['丙'], excludeRecursion: false })
function hit2(lines, cursor = 1) {
  return inj.renderWorldbookInjection(lines, { depth: 2, cursor }).map(w => w.content)
}
const r2 = hit2(['甲'])
check('A 注入', r2.some(x => x.startsWith('C:A')))
check('excludeRecursion C 递归轮跳过', !r2.some(x => x.startsWith('C:C')))
check('对照 H 递归轮被激活', r2.some(x => x.startsWith('C:H')))

console.log('3) preventRecursion：D 命中后 content 不入 buffer')
// D 命中，content 含「戊」；若无 preventRecursion，「戊」条目应被递归触发；有则不被触发
const book3 = wb.create('阻止递归强测')
wb.setEnabled(book3.id, true)
wb.addEntry(book3.id, { comment: 'D阻止', content: 'C:D 这里包含戊', keys: ['丁'], preventRecursion: true })
wb.addEntry(book3.id, { comment: 'G戊条目', content: 'C:G 戊条目', keys: ['戊'], excludeRecursion: false })
function hit3(lines, cursor = 1) {
  return inj.renderWorldbookInjection(lines, { depth: 2, cursor }).map(w => w.content)
}
const r3 = hit3(['丁'])
check('D 注入', r3.some(x => x.startsWith('C:D')))
check('preventRecursion 戊条目不被递归触发', !r3.some(x => x.startsWith('C:G')))

console.log('4) sticky：E 命中后持续 3 轮强制注入（即使后续无关键词）')
const r4a = hit(['粘'], 1)
check('E 首轮命中', r4a.some(x => x.startsWith('C:E')))
const r4b = hit(['无关'], 2)
check('E sticky 第2轮仍注入', r4b.some(x => x.startsWith('C:E')))
const r4c = hit(['无关'], 3)
check('E sticky 第3轮仍注入', r4c.some(x => x.startsWith('C:E')))
const r4d = hit(['无关'], 4)
check('E sticky 第4轮结束（end=cursor+3=4，cursor4 已过）', !r4d.some(x => x.startsWith('C:E')))

console.log('5) cooldown：F 命中后 3 轮内抑制')
const r5a = hit(['冷'], 1)
check('F 首轮命中', r5a.some(x => x.startsWith('C:F')))
const r5b = hit(['冷'], 2)
check('F 第2轮（冷却中）抑制', !r5b.some(x => x.startsWith('C:F')))
const r5c = hit(['冷'], 5)
check('F 第5轮（冷却已过）恢复', r5c.some(x => x.startsWith('C:F')))

console.log('6) delay：cursor < delay 时强制注入')
const book6 = wb.create('延迟测试')
wb.setEnabled(book6.id, true)
wb.addEntry(book6.id, { comment: '延迟3', content: 'C:延迟3', keys: ['延迟三'], delay: 3 })
wb.addEntry(book6.id, { comment: '延迟递归', content: 'C:延迟递归', keys: ['递归启'], delayUntilRecursion: true, excludeRecursion: false })
wb.addEntry(book6.id, { comment: 'A触发', content: 'C:A 包含递归启', keys: ['甲'], excludeRecursion: false })
function hit6(lines, cursor = 1) {
  return inj.renderWorldbookInjection(lines, { depth: 2, cursor }).map(w => w.content)
}
check('delay=3 cursor1 注入', hit6(['无关'], 1).some(x => x.startsWith('C:延迟3')))
check('delay=3 cursor4 无关键词 不注入', !hit6(['无关'], 4).some(x => x.startsWith('C:延迟3')))
check('delay=3 cursor4 有关键词 注入', hit6(['延迟三'], 4).some(x => x.startsWith('C:延迟3')))
check('delayUntilRecursion 非递归轮 不注入', !hit6(['无关'], 1).some(x => x.startsWith('C:延迟递归')))
check('delayUntilRecursion 递归轮 注入', hit6(['甲'], 1).some(x => x.startsWith('C:延迟递归')))

console.log('7) delayUntilRecursion 层级（第 N 层递归激活）')
const book7 = wb.create('延迟层级')
wb.setEnabled(book7.id, true)
wb.addEntry(book7.id, { comment: 'A1', content: 'C:A1 包含乙', keys: ['甲'], excludeRecursion: false })
wb.addEntry(book7.id, { comment: 'A2', content: 'C:A2 包含丙', keys: ['乙'], excludeRecursion: false })
wb.addEntry(book7.id, { comment: '延迟1', content: 'C:延迟1', keys: ['乙'], delayUntilRecursion: 1, excludeRecursion: false })
wb.addEntry(book7.id, { comment: '延迟2', content: 'C:延迟2', keys: ['丙'], delayUntilRecursion: 2, excludeRecursion: false })
function hit7(lines, cursor = 1) {
  return inj.renderWorldbookInjection(lines, { depth: 2, cursor }).map(w => w.content)
}
const r7 = hit7(['甲'])
check('延迟1 第1层递归激活', r7.some(x => x.startsWith('C:延迟1')))
check('延迟2 第2层递归激活', r7.some(x => x.startsWith('C:延迟2')))

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
