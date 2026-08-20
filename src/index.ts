import type { Context } from '@deepseek-ai/cordis'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDb } from './db/index.js'
import { registerRest } from './rest/index.js'
import { registerContextInjection } from './context/inject.js'
import * as tools from './tools/index.js'

export const name = 'dsh-worldbook'

// 依赖 dsh 提供的 webServer（REST 数据通道）、workspaceRegistry（工作区启用判定）与 tools（开发模式工具）。
export const inject = ['webServer', 'tools']

export function apply(ctx: Context) {
  // 数据目录：<插件项目根>/data/worldbook/
  const projectRoot = fileURLToPath(new URL('..', import.meta.url))
  const dataDir = join(projectRoot, 'data', 'worldbook')
  mkdirSync(dataDir, { recursive: true })

  openDb(dataDir)
  registerRest(ctx)
  registerContextInjection(ctx)
  tools.apply(ctx)

  console.log(`[dsh-worldbook] ready: ${dataDir}`)
}
