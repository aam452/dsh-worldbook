import { copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

// tsc 只产出 .js/.d.ts，schema.sql 需手动复制到产物目录（db/index.ts 用 import.meta.dirname 解析）
const srcDir = join(root, '..', 'src', 'db')
const outDir = join(root, '..', 'lib', 'db')

mkdirSync(outDir, { recursive: true })
copyFileSync(join(srcDir, 'schema.sql'), join(outDir, 'schema.sql'))
console.log('[build-assets] schema.sql -> lib/db/schema.sql')