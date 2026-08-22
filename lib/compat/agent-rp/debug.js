// agent-rp 兼容调试：设置 agentRpDebug 打开后，在每个 agent/pre-step 打印该会话本插件
// 看到/注入了什么（角色 / contextBooks / sourceBooks），方便实时测试判断「是否被接管」「卡书有没有绑上」。
// 按会话节流（同一会话 2 秒内最多打一条），避免一轮多 step 刷屏。
import * as setting from '../../data/setting.js';
import { createAgentRpSource } from './adapter.js';
import { agentRpActiveInSession, contextForSession } from './character.js';
import { isMigrated } from './import.js';
const THROTTLE_MS = 2000;
export function applyAgentRpDebugLogger(ctx) {
    const source = createAgentRpSource();
    const lastLog = new Map();
    return ctx.on('agent/pre-step', async ({ agent }, next) => {
        try {
            if (!setting.agentRpDebug())
                return next();
            if (!agentRpActiveInSession(agent))
                return next();
            const now = Date.now();
            const last = lastLog.get(String(agent.id)) ?? 0;
            if (now - last < THROTTLE_MS)
                return next();
            lastLog.set(String(agent.id), now);
            const context = contextForSession(String(agent.id));
            const character = context.character && typeof context.character.name === 'string' ? context.character.name : null;
            const contextBooks = Array.isArray(context.books) ? context.books : [];
            const sourceBooks = [];
            try {
                for (const book of source.readBooks(agent.session.events)) {
                    sourceBooks.push({ name: book.name, migrated: book.sourceKey.startsWith('script:') ? false : isMigrated(book.sourceKey) });
                }
            }
            catch {
                // 忽略
            }
            ctx.logger.info(`[dsh-worldbook][agent-rp] 会话=${agent.id} 角色=${character ?? '无'} ` +
                `contextBooks=[${contextBooks.join(', ')}] sourceBooks=[${sourceBooks.map(b => `${b.name}${b.migrated ? '(已迁本库)' : ''}`).join(', ')}]`);
        }
        catch {
            // 调试日志不影响注入
        }
        return next();
    });
}
