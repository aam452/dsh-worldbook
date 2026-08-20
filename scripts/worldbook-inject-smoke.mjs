import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../lib/db/index.js'
import * as wb from '../lib/data/worldbook.js'
import * as inj from '../lib/context/worldbook.js'

const dir = mkdtempSync(join(tmpdir(), 'wb-inject-'))
openDb(dir)
const sample = JSON.parse(readFileSync('temp/注入测试世界书.json', 'utf8'))
const book = wb.create('注入测试世界书')
wb.replaceEntries(book.id, wb.parseStWorldJson(JSON.stringify(sample)).entries)
wb.setEnabled(book.id, true)

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}
// 辅助：渲染注入，返回命中的 comment 列表
function hit(lines, depth = 2) {
  return inj.renderWorldbookInjection(lines, { depth }).map(w => w.content)
}

console.log('1) 常驻：无触发词也注入')
const r1 = hit(['今天天气不错'])
check('常驻-星核 注入', r1.some(x => x.includes('【常驻测试】')))

console.log('2) 关键词命中')
const r2 = hit(['我们来到了黑塔空间站'])
check('黑塔 注入', r2.some(x => x.includes('【关键词测试】')))
check('子串条目(黑塔空间站keys) 也注入', r2.some(x => x.includes('【子串测试】')))

console.log('3) 选择性 AND ANY（贝洛伯格 + 寒潮）')
const r3a = hit(['贝洛伯格被寒潮覆盖'])
check('AND 满足 注入', r3a.some(x => x.includes('【选择性AND】')))
const r3b = hit(['贝洛伯格天气不错'])
check('AND 不满足 不注入', !r3b.some(x => x.includes('【选择性AND】')))

console.log('4) 选择性 NOT ALL（丹恒 且 无冷面）')
const r4a = hit(['丹恒一言不发'])
check('NOT 满足 注入', r4a.some(x => x.includes('【选择性NOT】')))
const r4b = hit(['丹恒一脸冷面'])
check('NOT 不满足 不注入', !r4b.some(x => x.includes('【选择性NOT】')))

console.log('5) 整词匹配（中文无词边界，ST 同款：后随中文字符视为边界，故不命中）')
const r5a = hit(['希儿出现了'])
check('整词 希儿(后随中文) 不注入', !r5a.some(x => x.includes('【整词测试】')))
const r5b = hit(['希儿。'])
check('整词 希儿(后随标点) 注入', r5b.some(x => x.includes('【整词测试】')))
const r5c = hit(['希儿娜很可爱'])
check('整词 希儿娜 不注入', !r5c.some(x => x.includes('【整词测试】')))

console.log('6) 正则匹配')
const r6a = hit(['编号test42'])
check('正则 test42 注入', r6a.some(x => x.includes('【正则测试】')))
const r6b = hit(['test 没有数字'])
check('正则 无数字 不注入', !r6b.some(x => x.includes('【正则测试】')))

console.log('7) 深度扫描（depth=N 扫描最近 N 条，即数组末尾 N 条）')
const r7a = hit(['深居在最前', '第2', '第3'], 2)
check('深度2 深居在第1条(超出最近2条) 不注入', !r7a.some(x => x.includes('【深度测试】')))
const r7b = hit(['第1', '第2', '深居在其中'], 2)
check('深度2 深居在第3条(最近2条内) 命中', r7b.some(x => x.includes('【深度测试】')))
const r7c = hit(['深扫在最前面'], 2)
check('深度0 深扫任意位置 注入', r7c.some(x => x.includes('【深度0测试】')))

console.log('8) 组互斥')
const r8 = hit(['组A'], 2)
const groupHit = r8.filter(x => x.includes('【组互斥A'))
check('组互斥 只注入1条', groupHit.length === 1)
check('组互斥 注入order更高者A2', r8.some(x => x.includes('【组互斥A2】')))

console.log('9) 禁用')
const r9 = hit(['禁用词'], 2)
check('禁用词 不注入', !r9.some(x => x.includes('【禁用测试】')))

console.log('\n注入排序（同书内 position 相同按 order 降序）:')
const r10 = hit(['黑塔空间站 组A'], 2)
const orderStr = r10.map(x => x.slice(0, 6)).join(' | ')
console.log('  命中顺序:', orderStr)
// 同 position=0 时按 order 降序：子串(12) > 组互斥A2(9) > 黑塔(1) > 常驻(0)
check('排序：子串(order12) 最前', orderStr.indexOf('子串测试') >= 0 && orderStr.indexOf('子串测试') < orderStr.indexOf('组互斥A2'))
check('排序：组互斥A2(order9) 先于 黑塔(1)', orderStr.indexOf('组互斥A2') >= 0 && orderStr.indexOf('组互斥A2') < orderStr.indexOf('关键词'))
check('排序：黑塔(1) 先于 常驻(0)', orderStr.indexOf('关键词') < orderStr.indexOf('常驻'))

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
