// agent-rp 原生 World Info 接管：已迁入 dsh-worldbook 的源书在 agent-rp
// 的会话覆盖态中整本关闭，避免 agent-rp system 与本插件重复注入。
// 这只写 agent-rp 已公开的 command/done 覆盖协议，不修改对方源码或库文件。
import { CommandId } from '@deepseek-ai/dsh-commands/brand';
import { randomUUID } from 'node:crypto';
import { assembleSessionBooks, encodeWorldInfoConfiguration, readWorldInfoConfiguration, } from './events.js';
import { ensureSessionSourceBooks, isMigrated } from './import.js';
const CONFIG_COMMAND = 'rp-world-info';
export function suppressMigratedAgentRpBooks(agent) {
    // 先用事件流自愈本地映射：用户删掉本地副本后，宿主源书仍在，
    // 本轮即可重新导入，再为它建立新的 native 覆盖态。
    ensureSessionSourceBooks(String(agent.id), agent.session.events);
    const books = assembleSessionBooks(agent.session.events)
        .filter(book => !book.sourceKey.startsWith('script:') && isMigrated(book.sourceKey));
    if (books.length === 0)
        return [];
    let state = readWorldInfoConfiguration(agent.session.events);
    const changed = [];
    for (const book of books) {
        const id = book.sourceKey;
        const alreadyDisabled = book.entries.every((_entry, index) => state?.overrides.some(item => item.bookId === id && item.entryIndex === index && item.deleted === false && item.entry?.enabled === false) === true);
        if (alreadyDisabled)
            continue;
        const current = state ?? { format: 0, revision: 0, overrides: [] };
        state = {
            ...current,
            revision: current.revision + 1,
            overrides: [
                ...current.overrides.filter(item => item.bookId !== id),
                ...book.entries.map((entry, entryIndex) => ({
                    bookId: id,
                    entryIndex,
                    deleted: false,
                    entry: { ...toEditableEntry(entry), enabled: false },
                })),
            ],
        };
        changed.push(book.name);
    }
    if (changed.length === 0 || state === undefined)
        return [];
    const commandId = CommandId(randomUUID());
    agent.session.append('command/run', {
        commandId,
        name: CONFIG_COMMAND,
        source: { kind: 'user' },
    });
    agent.session.append('command/done', {
        commandId,
        kind: 'success',
        text: encodeWorldInfoConfiguration(state),
    });
    return changed;
}
function migratedEntryTexts(agent) {
    ensureSessionSourceBooks(String(agent.id), agent.session.events);
    return assembleSessionBooks(agent.session.events)
        .filter(book => !book.sourceKey.startsWith('script:') && isMigrated(book.sourceKey))
        .flatMap(book => book.entries)
        .map(entry => typeof entry.content === 'string' ? entry.content : '')
        .filter(content => content !== '');
}
function removeNativeText(value, texts) {
    let output = value;
    for (const text of texts)
        output = output.split(text).join('');
    return output.replace(/\n{3,}/gu, '\n\n').trim();
}
function stripNativeBooks(agent, decision) {
    if (decision.kind !== 'enter')
        return decision;
    const record = decision;
    const texts = migratedEntryTexts(agent);
    if (texts.length === 0)
        return decision;
    let changed = false;
    const messages = record.messages.map(raw => {
        if (typeof raw !== 'object' || raw === null)
            return raw;
        const message = raw;
        if (message.role !== 'system')
            return raw;
        if (typeof message.content === 'string') {
            const content = removeNativeText(message.content, texts);
            if (content !== message.content)
                changed = true;
            return { ...message, content };
        }
        if (!Array.isArray(message.content))
            return raw;
        const content = message.content.map(part => {
            if (typeof part !== 'object' || part === null)
                return part;
            const item = part;
            if (typeof item.text !== 'string')
                return part;
            const text = removeNativeText(item.text, texts);
            if (text !== item.text)
                changed = true;
            return { ...item, text };
        });
        return { ...message, content };
    });
    return changed ? { kind: 'enter', messages: messages } : decision;
}
function toEditableEntry(entry) {
    const logic = entry.selectiveLogic === 1 ? 'not-all' : entry.selectiveLogic === 2 ? 'not-any' : entry.selectiveLogic === 3 ? 'and-all' : 'and-any';
    return {
        ...(typeof entry.comment === 'string' && entry.comment !== '' ? { comment: entry.comment } : {}),
        keys: Array.isArray(entry.key) ? entry.key.filter((value) => typeof value === 'string') : [],
        secondaryKeys: Array.isArray(entry.keysecondary) ? entry.keysecondary.filter((value) => typeof value === 'string') : [],
        content: typeof entry.content === 'string' ? entry.content : '',
        enabled: entry.disable !== true,
        insertionOrder: typeof entry.order === 'number' ? entry.order : 100,
        selective: entry.selective === true,
        constant: entry.constant === true,
        caseSensitive: entry.caseSensitive === true,
        matchWholeWords: entry.matchWholeWords === true,
        secondaryLogic: logic,
        ...(typeof entry.scanDepth === 'number' ? { scanDepth: entry.scanDepth } : {}),
        position: entry.position === 0 ? 'before_char' : 'after_char',
        ...(typeof entry.order === 'number' ? { priority: entry.order } : {}),
        ignoreBudget: entry.ignoreBudget === true,
    };
}
export function applyAgentRpTakeover(ctx) {
    const agentDisposers = new Map();
    const disposeCreated = ctx.on('agent/created', ({ agent }) => {
        const dispose = agent.ctx.on('agent/pre-step', async ({ agent: current }, next) => {
            try {
                const changed = suppressMigratedAgentRpBooks(current);
                if (changed.length > 0)
                    ctx.logger.info(`[dsh-worldbook] agent-rp 原生世界书已停用（由本库注入）: ${changed.join('、')}`);
            }
            catch (error) {
                ctx.logger.info(`[dsh-worldbook] agent-rp 原生世界书接管失败: ${String(error)}`);
            }
            return stripNativeBooks(current, await next());
        }, { prepend: true });
        agentDisposers.set(agent, dispose);
    }, { global: true });
    const disposeDisposed = ctx.on('agent/disposed', ({ agent }) => {
        agentDisposers.get(agent)?.();
        agentDisposers.delete(agent);
    }, { global: true });
    return () => {
        disposeDisposed();
        disposeCreated();
        for (const dispose of agentDisposers.values())
            dispose();
        agentDisposers.clear();
    };
}
