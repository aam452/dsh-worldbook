// agent-rp 兼容诊断：回答「是否被接管 / 角色卡有没有绑上 / 会话里本插件看到了什么」。
// REST: GET /api/worldbook/compat/agent-rp
import * as setting from '../../data/setting.js';
import { agentRpContextSnapshot } from './character.js';
export function agentRpDiagnostic() {
    return {
        compatEnabled: setting.compatEnabled(),
        agentRpCompat: setting.agentRpCompat(),
        exposeOperations: setting.exposeOperations(),
        // 若 agentRpCompat 关着，会话快照可能为空（模块未挂载，未订阅会话）。
        sessions: agentRpContextSnapshot(),
    };
}
