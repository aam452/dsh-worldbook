// agent-rp 适配装配：探测/开关控制挂载，支持运行时按设置同步注册/注销。
//
// 依赖通用兼容（src/integration/，见 docs/DEVELOPMENT.md 第七章）：
//   - 本模块提供 worldbook.source（adapter.ts）与 worldbook.context（character.ts），
//     消费侧已由通用层 resolveSessionInjection 接好。
//   - 本模块只做 agent-rp 专属的事：事件解析、拦截、命令影子、迁移。
//
// 开关：agentRpCompat（本模块）+ compatEnabled（通用双模式闸门）。
// agentRpCompat 关 → 全部不挂载；开 → 挂载。compatEnabled 决定通用层是否消费 source/context。
import { agentRpCompat } from '../../data/setting.js';
import { applyAgentRpSource } from './adapter.js';
import { applyAgentRpContext } from './character.js';
import { applyAgentRpToolInterception } from './tools.js';
import { applyAgentRpCommands } from './commands.js';
import { applyAgentRpDebugLogger } from './debug.js';
import { applyAgentRpTakeover } from './takeover.js';
import { deleteMappedStandaloneSource, migrateLibraryShelf, repairStandaloneMappings, unmapBook, watchLibraryShelf } from './import.js';
import { sourceKeysForBook } from './import.js';
import { registerDeleteGuard, registerDeleteHook } from '../../integration/operations.js';
let disposeAgentRp = null;
export function syncAgentRpCompat(ctx) {
    const should = agentRpCompat();
    if (should && disposeAgentRp === null) {
        const disposers = [];
        for (const apply of [
            applyAgentRpSource,
            applyAgentRpContext,
            applyAgentRpToolInterception,
            applyAgentRpCommands,
            applyAgentRpTakeover,
            applyAgentRpDebugLogger,
        ]) {
            const dispose = apply(ctx);
            if (dispose)
                disposers.push(dispose);
        }
        disposers.push(registerDeleteGuard((book) => {
            const sourceKeys = sourceKeysForBook(book.id);
            if (sourceKeys.some((sourceKey) => sourceKey.startsWith('character:'))) {
                throw new Error(`无法删除世界书「${book.name}」：它来自 agent-rp 角色卡内嵌世界书。请先解除绑定或禁用该书，角色卡原始内容不会被兼容插件删除。`);
            }
        }));
        disposers.push(registerDeleteHook((book) => {
            deleteMappedStandaloneSource(book.id);
            unmapBook(book.id);
        }));
        // 对方宿主世界书库同步：把已经上传/之后新上传的书迁入本库（对方「导入世界书」即出现在本库页面）
        const repairedNames = repairStandaloneMappings();
        if (repairedNames.length > 0)
            ctx.logger.info(`[dsh-worldbook] agent-rp 映射修复: 已拆分 ${repairedNames.join('、')}`);
        const shelfNames = migrateLibraryShelf();
        if (shelfNames.length > 0) {
            ctx.logger.info(`[dsh-worldbook] agent-rp 库同步: 已迁入 ${shelfNames.join('、')}`);
        }
        const stopWatch = watchLibraryShelf((names) => {
            ctx.logger.info(`[dsh-worldbook] agent-rp 库同步: 新上传迁入 ${names.join('、')}`);
        });
        if (stopWatch)
            disposers.push(stopWatch);
        disposeAgentRp = () => {
            for (const dispose of disposers.reverse())
                dispose();
        };
        ctx.logger.info('[dsh-worldbook] agent-rp 兼容已启用');
    }
    else if (!should && disposeAgentRp !== null) {
        disposeAgentRp();
        disposeAgentRp = null;
        ctx.logger.info('[dsh-worldbook] agent-rp 兼容已停用');
    }
}
