import type { Context } from '@deepseek-ai/cordis'
import * as setting from '../data/setting.js'
import { WORLDBOOK_ENGINE_KEY, type WorldbookEngine } from './protocol.js'

// 接管声明（协议 §4.1）：提供 worldbook.engine，Host 检测到 active === true 即让位。
// active 实时反映 compatEnabled 设置：关闭兼容时 Host 立即恢复自己的世界书注入。
export function applyEngine(ctx: Context): void {
  const engine: WorldbookEngine = {
    get active() {
      return setting.compatEnabled()
    },
  }
  ctx.provide(WORLDBOOK_ENGINE_KEY, engine)
}
