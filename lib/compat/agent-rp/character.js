// worldbook.context 提供方：桥接 agent-rp 的角色上下文 → 我方协议键。
//
// agent-rp 用自己的 `worldbook.characterContext` 键暴露/消费每会话角色解析器：
//   - host 模式：agent-rp 自己 provide 该键（我们只读，不 provide，避免 Cordis 冲突）。
//   - character 模式（默认）：agent-rp 不 provide，但会注册进任何提供该键的注册表 → 我们 provide。
// 两种路径都收敛到同一个注册表：getCurrentCharacter(sessionId)。
//
// 我方 `worldbook.context`（协议 §4.2，消费侧已在 src/integration/source.ts 实现）：
//   get(sessionId) → {
//     character: 当前角色 { name, tags }（characterFilter 用）
//     books:     本会话应注入的本库书名（已迁移的角色卡书 + 本会话接管导入的独立书）
//   }
// 未迁移的角色卡书 / 脚本书由 adapter（worldbook.source）从事件原样注入，不在此重复。
//
// 会话注册表是模块级共享状态：供 provider 与诊断（agentRpContextSnapshot）复用。
import { CONTEXT_PROVIDER_KEY } from '../../data/character.js';
import { isMigrated, sessionActiveBooks, forgetSession, ensureSessionCardBook } from './import.js';
import { createAgentRpSource } from './adapter.js';
const CHARACTER_CONTEXT_KEY = 'worldbook.characterContext';
function createRegistry() {
    const sessions = new Map();
    return {
        getCurrentCharacter(sessionId) {
            return sessions.get(sessionId)?.resolve();
        },
        register(sessionId, resolve) {
            const token = Symbol(sessionId);
            sessions.set(sessionId, { token, resolve });
            return () => {
                if (sessions.get(sessionId)?.token === token)
                    sessions.delete(sessionId);
            };
        },
    };
}
function isRegistry(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const record = value;
    return typeof record.register === 'function' && typeof record.getCurrentCharacter === 'function';
}
// 模块级共享状态：会话注册表 + 角色解析注册表（挂载时建立，供 provider 与诊断读取）。
const sessions = new Map();
let registry;
// 某会话应注入的本库书名：会话内接管导入的独立书 + 角色卡内嵌书（未迁则迁入）。
function sessionBooks(agent) {
    if (agent === undefined)
        return [];
    const names = new Set(sessionActiveBooks(String(agent.id)));
    try {
        const cardName = ensureSessionCardBook(String(agent.id), agent.session.events);
        if (cardName)
            names.add(cardName);
    }
    catch {
        // 解析失败不影响其余书名
    }
    return [...names];
}
/** 协议 §4.2：某会话的角色 + 绑定书。 */
export function contextForSession(sessionId) {
    const character = registry?.getCurrentCharacter(sessionId);
    const characterContext = character && typeof character.name === 'string'
        ? { name: character.name, tags: Array.isArray(character.tags) ? character.tags.filter((x) => typeof x === 'string') : [] }
        : undefined;
    const books = sessionBooks(sessions.get(sessionId));
    return {
        ...(characterContext === undefined ? {} : { character: characterContext }),
        ...(books.length === 0 ? {} : { books }),
    };
}
// 会话是否由 agent-rp 驱动：事件里出现 agent-rp 私有格式即视为活跃。
export function agentRpActiveInSession(agent) {
    for (const raw of agent.session.events) {
        const event = raw;
        const type = event.type;
        if (typeof type === 'string' && type.startsWith('agent-rp/'))
            return true;
        if (type === 'tool/call') {
            const name = event.data?.name;
            if (name === 'import_world_info' || name === 'import_character_card')
                return true;
        }
        if (type === 'command/done') {
            const data = event.data;
            if (data?.kind === 'success' && typeof data.text === 'string'
                && (data.text.startsWith('agent-rp-world-info-v0:')
                    || data.text.startsWith('agent-rp-world-info-library-v0:')
                    || data.text.startsWith('agent-rp-character-library-v0:')
                    || data.text.startsWith('agent-rp-tavern-helper-v0:')))
                return true;
        }
    }
    return false;
}
export function agentRpContextSnapshot() {
    const source = createAgentRpSource();
    const out = [];
    for (const [sessionId, agent] of sessions) {
        if (!agentRpActiveInSession(agent))
            continue;
        const context = contextForSession(sessionId);
        const eventBooks = [];
        try {
            eventBooks.push(...source.readBooks(agent.session.events));
        }
        catch {
            // 忽略
        }
        out.push({
            id: sessionId,
            agentRpActive: true,
            character: context.character && typeof context.character.name === 'string'
                ? { name: context.character.name, tags: context.character.tags }
                : null,
            contextBooks: Array.isArray(context.books) ? context.books : [],
            sourceBooks: eventBooks.map(book => ({
                name: book.name,
                migrated: book.sourceKey.startsWith('script:') ? false : isMigrated(book.sourceKey),
            })),
        });
    }
    return out;
}
export function applyAgentRpContext(ctx) {
    const disposers = [];
    // agent-rp host 模式已 provide → 消费它；否则提供自己的注册表让 agent-rp 注册进来。
    try {
        const candidate = ctx.get(CHARACTER_CONTEXT_KEY);
        if (isRegistry(candidate))
            registry = candidate;
    }
    catch {
        registry = undefined;
    }
    if (registry === undefined) {
        registry = createRegistry();
        disposers.push(ctx.provide(CHARACTER_CONTEXT_KEY, registry));
    }
    disposers.push(ctx.on('agent/created', ({ agent }) => {
        sessions.set(String(agent.id), agent);
        sessions.set(String(agent.session.id), agent);
    }, { global: true }));
    disposers.push(ctx.on('agent/disposed', ({ agent }) => {
        for (const id of [String(agent.id), String(agent.session.id)])
            sessions.delete(id);
        forgetSession(String(agent.id));
    }, { global: true }));
    const provider = {
        get(sessionId) {
            return contextForSession(sessionId);
        },
    };
    disposers.push(ctx.provide(CONTEXT_PROVIDER_KEY, provider));
    return () => {
        for (const dispose of disposers.reverse())
            dispose();
        registry = undefined;
    };
}
