import * as setting from './setting.js';
// 会话 → 所在工作区 id；找不到返回 undefined（视为无工作区归属）。
export function workspaceOfSession(registry, sessionId) {
    if (!registry)
        return undefined;
    try {
        return registry.list().find((w) => w.sessionIds.includes(sessionId))?.id;
    }
    catch {
        return undefined;
    }
}
// 综合判定插件是否在该会话生效。
export function isActiveForSession(registry, sessionId, opts = {}) {
    if (!setting.enabled())
        return false;
    if (setting.workspaceMode() === 'all')
        return true;
    const ws = workspaceOfSession(registry, sessionId);
    // 拿不到工作区时按选项回退：默认开启（避免环境缺 workspace 导致静默全禁），或保守关闭。
    if (ws === undefined)
        return opts.defaultOn ?? true;
    return setting.workspaceIds().includes(ws);
}
