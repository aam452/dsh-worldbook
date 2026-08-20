import { build } from 'esbuild'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(root, '..')

// DSH 客户端 seed 模块表（dsh-client-web 提供），编译期 external，运行时由 __ModuleLoader__ 注入 require
const external = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

// __ModuleLoader__ 的 id 必须等于包名（缺省则 browser roster 匹配失败，启动即报错）
const id = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).name
const banner = `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(id)},\n\tfactory: (require) => {\nvar module = { exports: {} };\nvar exports = module.exports;`
const footer = `\n\treturn module.exports;\n\t}\n});`

mkdirSync(join(projectRoot, 'lib'), { recursive: true })

await build({
  entryPoints: [join(projectRoot, 'src/client/client.ts')],
  bundle: true,
  outfile: join(projectRoot, 'lib/client.js'),
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external,
  loader: { '.css': 'text' },
  banner: { js: banner },
  footer: { js: footer },
  logLevel: 'info',
})
