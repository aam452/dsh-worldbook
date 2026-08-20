import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { mkdirSync } from 'node:fs'
import { openDb } from './db/index.js'
import { registerRest } from './rest/index.js'
import { registerContextInjection } from './context/inject.js'
import * as tools from './tools/index.js'

export const name = 'dsh-worldbook'

// 依赖 dsh 提供的 webServer（REST 数据通道）、workspaceRegistry（工作区启用判定）与 tools（开发模式工具）。
export const inject = ['webServer', 'tools']

export function apply(ctx: Context) {
  // 数据目录：~/.dsh/worldbook/（DSH 统一用户数据根目录）。
  // 不放在插件包内：`dsh plugin add github:...` 安装时包位于 pnpm store，
  // 写入包内目录会因 store 只读/去重而丢失数据；放 DSH home 下随插件更新存活。
  const dataDir = dshHomePath('worldbook')
  mkdirSync(dataDir, { recursive: true })

  openDb(dataDir)
  registerRest(ctx)
  registerContextInjection(ctx)
  tools.apply(ctx)

  console.log(`[dsh-worldbook] ready: ${dataDir}`)
}
