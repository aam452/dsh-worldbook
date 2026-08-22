// agent-rp 兼容调试：设置 agentRpDebug 打开后，在每个 agent/pre-step 打印该会话本插件
// 看到/注入了什么（角色 / contextBooks / sourceBooks），方便实时测试判断「是否被接管」「卡书有没有绑上」。
// 按会话节流（同一会话 2 秒内最多打一条），避免一轮多 step 刷屏。
import * as setting from '../../data/setting.js';
import { contextForSession } from './character.js';
import { isMigrated } from './import.js';
import { assembleSessionBooks } from './events.js';
export function applyAgentRpDebugLogger(ctx) {
    const lastLoggedStep = new Map();
    const agents = new Map();
    const disposeCreated = ctx.on('agent/created', ({ agent }) => agents.set(String(agent.id), agent), { global: true });
    const disposeEvent = ctx.on('session/event', (session, event) => {
        if (!setting.agentRpDebug())
            return;
        if (event.type !== 'request/header' && event.type !== 'assistant/chunk')
            return;
        const agent = agents.get(String(session.id));
        if (!agent)
            return;
        // session/event 是 post-commit 观察点：本轮 user/plugin 消息已进入 session.events。
        setImmediate(() => logDebugStep(agent, lastLoggedStep));
    }, { global: true });
    const disposeDisposed = ctx.on('agent/disposed', ({ agent }) => {
        agents.delete(String(agent.id));
        lastLoggedStep.delete(String(agent.id));
    }, { global: true });
    return () => {
        disposeDisposed();
        disposeEvent();
        disposeCreated();
        agents.clear();
        lastLoggedStep.clear();
    };
}
function logDebugStep(agent, lastLoggedStep) {
    try {
        if (!setting.agentRpDebug())
            return;
        const userRound = countUserMessages(agent.session.events);
        const step = latestNumber(agent.session.events, 'step/start', 'step');
        const roundKey = `${userRound}/${step ?? 0}`;
        if (lastLoggedStep.get(String(agent.id)) === roundKey)
            return;
        lastLoggedStep.set(String(agent.id), roundKey);
        const context = contextForSession(String(agent.id));
        const character = context.character && typeof context.character.name === 'string' ? context.character.name : null;
        const contextBooks = Array.isArray(context.books) ? context.books : [];
        const sourceBooks = [];
        for (const book of assembleSessionBooks(agent.session.events)) {
            sourceBooks.push({ name: book.name, migrated: book.sourceKey.startsWith('script:') ? false : isMigrated(book.sourceKey) });
        }
        const eventInjected = pluginMessagesForCurrentStep(agent.session.events);
        const injectionGroups = groupPluginInjections(eventInjected);
        const injectionCount = eventInjected.length;
        log(`[worldbook-debug] ============================== 第${userRound}轮 ==============================`);
        log(`[worldbook-debug] 第${userRound}轮 step=${step ?? '?'} 会话=${agent.id} 角色=${character ?? '无'} contextBooks=[${contextBooks.join(', ')}] sourceBooks=[${sourceBooks.map(b => `${b.name}${b.migrated ? '(已迁本库)' : ''}`).join(', ')}] 插件注入=${injectionCount}条`);
        if (injectionGroups.length === 0)
            log('[worldbook-debug] 本轮没有检测到插件注入消息');
        for (const group of injectionGroups) {
            log(`[worldbook-debug] -------------- ${group.plugin} 注入开始 --------------`);
            for (const item of group.messages) {
                log(`[worldbook-debug] 第${userRound}轮 注入[${item.plugin}] ${item.index}: ${item.content}`);
            }
            log(`[worldbook-debug] -------------- ${group.plugin} 注入结束 --------------`);
        }
        const hostSystem = requestSystemForCurrentStep(agent.session.events);
        if (hostSystem !== undefined) {
            log(`[worldbook-debug] -------------- （system投影）第${userRound}轮实际注入开始 --------------`);
            log(`[worldbook-debug] 第${userRound}轮 request/header.system（DSH 汇总后的最终 system 内容）：\n${hostSystem}`);
            log(`[worldbook-debug] -------------- （system投影）第${userRound}轮实际注入结束 --------------`);
        }
        log(`[worldbook-debug] ============================== 第${userRound}轮结束 ==============================`);
    }
    catch {
        // 调试日志不影响注入
    }
}
/** Group all plugin-originated injections for one step without knowing plugin names. */
function groupPluginInjections(messages) {
    const groups = new Map();
    for (const message of messages) {
        const group = groups.get(message.plugin);
        if (group)
            group.messages.push(message);
        else
            groups.set(message.plugin, { plugin: message.plugin, messages: [message] });
    }
    return [...groups.values()];
}
function pluginMessagesForCurrentStep(events) {
    let start = -1;
    for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event?.type === 'step/start') {
            start = index;
            break;
        }
    }
    if (start < 0)
        return [];
    const injected = [];
    for (let index = start + 1; index < events.length; index++) {
        const event = events[index];
        if (event?.type !== 'user/message')
            continue;
        const source = event.data?.source;
        if (source?.kind !== 'plugin')
            continue;
        injected.push({
            index: `event:${typeof event.seq === 'number' ? event.seq : index}`,
            plugin: typeof source.plugin === 'string' ? source.plugin : '未知插件',
            content: messageContent(event.data?.content),
        });
    }
    return injected;
}
function countUserMessages(events) {
    // 调试日志中的“轮次”按用户实际发送的消息计数：第 N 条用户消息之后、
    // 第 N+1 条用户消息之前发生的世界书注入，都归入第 N 轮；插件消息不计数。
    let count = 0;
    for (const raw of events) {
        const event = raw;
        if (event?.type === 'user/message' && event.data?.source?.kind === 'user')
            count++;
    }
    return count;
}
function latestNumber(events, type, field) {
    for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event?.type !== type)
            continue;
        const value = event.data?.[field];
        if (typeof value === 'number' && Number.isSafeInteger(value))
            return value;
    }
    return undefined;
}
function messageContent(content) {
    if (typeof content === 'string')
        return content;
    try {
        return JSON.stringify(content);
    }
    catch {
        return String(content);
    }
}
function requestSystemForCurrentStep(events) {
    let start = -1;
    for (let index = events.length - 1; index >= 0; index--) {
        const event = events[index];
        if (event?.type === 'step/start') {
            start = index;
            break;
        }
    }
    if (start < 0)
        return undefined;
    for (let index = start + 1; index < events.length; index++) {
        const event = events[index];
        if (event?.type !== 'request/header')
            continue;
        const system = event.data?.header?.system;
        return typeof system === 'string' ? system : undefined;
    }
    return undefined;
}
function log(message) {
    console.info(message);
}
