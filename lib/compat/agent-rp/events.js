// agent-rp 会话事件格式解析（只读适配，不依赖 @deepseek-ai/dsh-session 类型）。
//
// 这是本模块唯一的「对方事件/状态格式」接触面：所有 agent-rp 私有格式的解析都隔离在这里，
// 其余文件（adapter / commands / character）只消费这里导出的结构化结果。
// 解析全部宽松容错：拿不到或字段不符就跳过，绝不因对方事件格式变化阻塞注入。
// 事件格式要点（对照 agent-rp 源码）：
//   - agent-rp/world-info-library-seed  data.meta = { format:0, result, raw }（raw=完整 ST 世界书 JSON）
//   - command/done success 文本前缀：agent-rp-world-info-v0:(覆盖态) / agent-rp-world-info-library-v0:(导入) /
//       agent-rp-tavern-helper-v0:(TavernHelperState) / agent-rp-character-library-v0:(角色库启动)
//   - agent-rp/character-card-seed  data.meta = { format:0, result, raw }（raw=角色卡 JSON）
//   - agent-rp/tavern-state  data = TavernHelperState
//   - tool/result success + tool/call(name=import_world_info / import_character_card) 配对
import { pickCharacterBook, parseStWorldJson } from '../../data/worldbook.js';
function eventData(event) {
    return typeof event.data === 'object' && event.data !== null && !Array.isArray(event.data)
        ? event.data
        : undefined;
}
function object(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function str(value) {
    return typeof value === 'string' ? value : undefined;
}
function num(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
// tool/result 的 message.content 是内容块数组（首块带 toolCallId/isError），
// 取首块；兼容个别形态下 content 直接是对象。
function resultContent(data) {
    const message = object(data?.message);
    if (!message)
        return undefined;
    if (Array.isArray(message.content))
        return object(message.content[0]);
    return object(message.content);
}
export function tavernEntryToStEntry(entry) {
    const strategy = object(entry.strategy);
    const secondary = object(strategy?.keys_secondary);
    const position = object(entry.position);
    const type = strategy?.type === 'selective' || strategy?.type === 'vectorized' ? strategy.type : 'constant';
    const logic = secondary?.logic === 'and_all' ? 3 : secondary?.logic === 'not_all' ? 1 : secondary?.logic === 'not_any' ? 2 : 0;
    const positionType = str(position?.type) ?? 'at_depth';
    const before = positionType === 'before_character_definition'
        || positionType === 'before_example_messages' || positionType === 'before_author_note';
    const probability = num(entry.probability) ?? 100;
    const keys = Array.isArray(strategy?.keys) ? strategy.keys.filter((x) => typeof x === 'string') : [];
    const secondaryKeys = Array.isArray(secondary?.keys) ? secondary.keys.filter((x) => typeof x === 'string') : [];
    const scanDepth = strategy?.scan_depth === 'same_as_global' || strategy?.scan_depth === undefined
        ? undefined : num(strategy.scan_depth);
    const out = {
        key: keys,
        keysecondary: secondaryKeys,
        content: str(entry.content) ?? '',
        comment: typeof entry.name === 'string' ? entry.name : '',
        constant: type === 'constant',
        vectorized: type === 'vectorized',
        selective: type === 'selective',
        selectiveLogic: logic,
        order: num(position?.order) ?? 100,
        position: before ? 0 : 1,
        disable: !(entry.enabled === true && probability > 0),
        caseSensitive: false,
        matchWholeWords: false,
        probability,
        useProbability: probability < 100,
    };
    if (scanDepth !== undefined)
        out.scanDepth = scanDepth;
    if (entry.ignoreBudget === true)
        out.ignoreBudget = true;
    return out;
}
const TAVERN_STATE_PREFIX = 'agent-rp-tavern-helper-v0:';
function parseTavernWorldbookEntries(value) {
    if (!Array.isArray(value))
        return [];
    const out = [];
    for (const raw of value) {
        const e = object(raw);
        if (!e)
            continue;
        const uid = num(e.uid);
        if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0)
            continue;
        const entry = {
            uid,
            ...(typeof e.name === 'string' ? { name: e.name } : {}),
            enabled: e.enabled !== false,
            ...(object(e.strategy) ? { strategy: e.strategy } : {}),
            ...(object(e.position) ? { position: e.position } : {}),
            content: typeof e.content === 'string' ? e.content : '',
            ...(num(e.probability) !== undefined ? { probability: num(e.probability) } : {}),
            ...(e.ignoreBudget === true ? { ignoreBudget: true } : {}),
        };
        out.push(entry);
    }
    return out;
}
function parseTavernHelperState(value) {
    const state = object(value);
    if (!state || num(state.format) !== 0)
        return undefined;
    const out = {};
    if (object(state.worldbooks)) {
        const worldbooks = {};
        for (const [name, entries] of Object.entries(object(state.worldbooks) ?? {})) {
            worldbooks[name] = parseTavernWorldbookEntries(entries);
        }
        out.worldbooks = worldbooks;
    }
    if (Array.isArray(state.deletedWorldbookNames)) {
        out.deletedWorldbookNames = state.deletedWorldbookNames.filter((x) => typeof x === 'string');
    }
    const bindings = object(state.worldbookBindings);
    if (bindings) {
        const parsed = {};
        if (Array.isArray(bindings.global)) {
            parsed.global = bindings.global.filter((x) => typeof x === 'string');
        }
        const character = object(bindings.character);
        if (character) {
            parsed.character = {
                primary: character.primary === null ? null : str(character.primary),
                additional: Array.isArray(character.additional)
                    ? character.additional.filter((x) => typeof x === 'string') : [],
            };
        }
        if (bindings.chat !== undefined && bindings.chat !== null)
            parsed.chat = str(bindings.chat);
        out.worldbookBindings = parsed;
    }
    return out;
}
// 读取最新 Tavern Helper 快照（agent-rp/tavern-state 事件，或 command/done 的 agent-rp-tavern-helper-v0: 文本）。
export function readTavernHelperState(events) {
    let latest;
    for (const raw of events) {
        const event = raw;
        if (event.type === 'agent-rp/tavern-state') {
            const parsed = parseTavernHelperState(event.data);
            if (parsed)
                latest = parsed;
            continue;
        }
        if (event.type !== 'command/done')
            continue;
        const done = eventData(event);
        if (done?.kind !== 'success' || typeof done.text !== 'string')
            continue;
        const text = done.text;
        if (!text.startsWith(TAVERN_STATE_PREFIX))
            continue;
        let value;
        try {
            value = JSON.parse(text.slice(TAVERN_STATE_PREFIX.length));
        }
        catch {
            continue;
        }
        const parsed = parseTavernHelperState(value);
        if (parsed)
            latest = parsed;
    }
    return latest;
}
// ── 角色卡书 ──
// 从角色卡 JSON 提取书信息：character_book 对象 + 卡名（昵称兜底）+ sourceAttachmentId。
function readCardBook(value) {
    const card = object(value);
    if (!card)
        return undefined;
    const book = pickCharacterBook(card);
    if (!book)
        return undefined;
    const bookName = str(book.name);
    const data = object(card.data);
    const cardName = str(card.name) ?? str(data?.name) ?? '';
    const nickname = str(card.nickname) ?? str(data?.nickname) ?? '';
    return {
        book,
        name: bookName && bookName.trim() !== '' ? bookName.trim() : `${nickname.trim() || cardName || '角色'}的世界书`,
    };
}
// 从会话事件解析活动角色卡书（agent-rp/character-card-seed 或 import_character_card 工具结果）。
// 返回 ST 世界书构建信息；无角色卡 / 卡无书 / 解析失败返回 undefined。
export function activeCharacterBook(events) {
    let meta;
    for (const raw of events) {
        const event = raw;
        if (event.type === 'agent-rp/character-card-seed') {
            const data = eventData(event);
            const m = object(data?.meta);
            if (m)
                meta = { result: object(m.result) ?? {}, raw: m.raw };
            continue;
        }
        if (event.type === 'command/done') {
            const done = eventData(event);
            if (done?.kind !== 'success' || typeof done.text !== 'string')
                continue;
            const text = done.text;
            if (!text.startsWith('agent-rp-character-library-v0:'))
                continue;
            let record;
            try {
                record = JSON.parse(text.slice('agent-rp-character-library-v0:'.length));
            }
            catch {
                continue;
            }
            const m = object(object(record)?.meta);
            if (m)
                meta = { result: object(m.result) ?? {}, raw: m.raw };
            continue;
        }
        if (event.type !== 'tool/result')
            continue;
        const data = eventData(event);
        const content = resultContent(data);
        if (!content || data?.kind !== undefined || content.isError === true)
            continue;
        const callId = str(content.toolCallId);
        if (callId === undefined)
            continue;
        const call = events.find(candidate => candidate.type === 'tool/call' && str(eventData(candidate)?.callId) === callId
            && str(eventData(candidate)?.name) === 'import_character_card');
        if (!call)
            continue;
        const m = object(eventData(event)?.meta);
        if (m)
            meta = { result: object(m.result) ?? {}, raw: m.raw };
    }
    if (!meta)
        return undefined;
    const sourceAttachmentId = str(meta.result?.sourceAttachmentId);
    if (!sourceAttachmentId)
        return undefined;
    const card = readCardBook(meta.raw);
    if (!card)
        return undefined;
    try {
        const parsed = parseStWorldJson(JSON.stringify(card.book));
        return {
            sourceKey: `character:${sourceAttachmentId}`,
            name: card.name,
            entries: parsed.entries,
            ...(parsed.description === undefined ? {} : { description: parsed.description }),
            ...(parsed.scanDepth === undefined ? {} : { scanDepth: parsed.scanDepth }),
        };
    }
    catch {
        return undefined;
    }
}
function parseWorldInfoMeta(raw) {
    const m = object(raw);
    if (!m)
        return undefined;
    return { result: object(m.result) ?? {}, value: m.raw };
}
function bookFromRaw(raw) {
    try {
        const parsed = parseStWorldJson(JSON.stringify(raw));
        const name = parsed.name && parsed.name.trim() !== '' ? parsed.name.trim() : '未命名世界书';
        return {
            name,
            entries: parsed.entries,
            ...(parsed.description === undefined ? {} : { description: parsed.description }),
            ...(parsed.scanDepth === undefined ? {} : { scanDepth: parsed.scanDepth }),
        };
    }
    catch {
        return undefined;
    }
}
const LIBRARY_IMPORT_PREFIX = 'agent-rp-world-info-library-v0:';
// 读取会话内的独立世界书（启动种子 + rp-world-info-import 命令 + import_world_info 工具结果），去重保序。
export function readStandaloneBooks(events) {
    const active = new Map();
    for (const raw of events) {
        const event = raw;
        if (event.type === 'agent-rp/world-info-library-seed') {
            const data = eventData(event);
            const libraryId = str(data?.worldInfoLibraryId);
            if (typeof data?.format === 'number' && data.format === 0 && libraryId) {
                const meta = parseWorldInfoMeta(data.meta);
                const book = bookFromRaw(meta?.value);
                const sourceKey = `standalone:library:${libraryId}`;
                if (book)
                    active.set(sourceKey, { sourceKey, ...book });
            }
            continue;
        }
        if (event.type !== 'command/done') {
            if (event.type !== 'tool/result')
                continue;
            const data = eventData(event);
            const content = resultContent(data);
            if (!content || content.isError === true)
                continue;
            const callId = str(content.toolCallId);
            if (callId === undefined)
                continue;
            const call = events.find(candidate => candidate.type === 'tool/call' && str(eventData(candidate)?.callId) === callId
                && str(eventData(candidate)?.name) === 'import_world_info');
            if (!call)
                continue;
            const meta = parseWorldInfoMeta(eventData(event)?.meta);
            const sourceAttachmentId = str(meta?.result?.sourceAttachmentId);
            const book = bookFromRaw(meta?.value);
            if (sourceAttachmentId && book) {
                active.set(`standalone:${sourceAttachmentId}`, { sourceKey: `standalone:${sourceAttachmentId}`, ...book });
            }
            continue;
        }
        const done = eventData(event);
        if (done?.kind !== 'success' || typeof done.text !== 'string')
            continue;
        const text = done.text;
        if (!text.startsWith(LIBRARY_IMPORT_PREFIX))
            continue;
        let record;
        try {
            record = JSON.parse(text.slice(LIBRARY_IMPORT_PREFIX.length));
        }
        catch {
            continue;
        }
        const importId = str(object(record)?.importId);
        if (!importId)
            continue;
        const meta = parseWorldInfoMeta(object(record)?.meta);
        const book = bookFromRaw(meta?.value);
        if (book) {
            active.set(`standalone:library:${importId}`, { sourceKey: `standalone:library:${importId}`, ...book });
        }
    }
    return [...active.values()];
}
// 生成一个会话的「该注入的书」：角色卡书 + 独立书 + 脚本书，应用脚本替换/删除/绑定。
// 迁移状态不在这里判断——调用方（adapter）负责跳过已迁入本库的书。
export function assembleSessionBooks(events) {
    const sources = [];
    const character = activeCharacterBook(events);
    if (character) {
        sources.push({ sourceKey: character.sourceKey, name: character.name, entries: character.entries, ...(character.description === undefined ? {} : { description: character.description }), ...(character.scanDepth === undefined ? {} : { scanDepth: character.scanDepth }), source: 'character' });
    }
    for (const book of readStandaloneBooks(events)) {
        sources.push({ ...book, source: 'standalone' });
    }
    const state = readTavernHelperState(events);
    if (state === undefined)
        return sources;
    // withTavernWorldbooks：脚本替换/删除/新建（按名）。
    const deleted = new Set(state.deletedWorldbookNames ?? []);
    const replacements = state.worldbooks ?? {};
    const names = new Set();
    const result = sources.flatMap(source => {
        names.add(source.name);
        if (deleted.has(source.name))
            return [];
        const scriptEntries = replacements[source.name];
        if (scriptEntries === undefined)
            return [source];
        return [{
                ...source,
                entries: scriptEntries.map(tavernEntryToStEntry),
                source: source.source === 'character' ? 'character' : 'standalone',
            }];
    });
    for (const [name, entries] of Object.entries(replacements)) {
        if (names.has(name) || deleted.has(name))
            continue;
        result.push({ sourceKey: `script:${name}`, name, entries: entries.map(tavernEntryToStEntry), source: 'script' });
    }
    // activeTavernWorldbooks：按脚本显式绑定过滤。
    const bindings = state.worldbookBindings;
    if (bindings === undefined)
        return result.filter(source => source.source !== 'script');
    const active = new Set();
    if (bindings.character === undefined) {
        for (const source of result)
            if (source.source === 'character')
                active.add(source.name);
    }
    else {
        if (bindings.character.primary != null)
            active.add(bindings.character.primary);
        for (const name of bindings.character.additional ?? [])
            active.add(name);
    }
    if (bindings.global === undefined) {
        for (const source of result) {
            if (source.source === 'standalone' && !source.sourceKey.startsWith('script:'))
                active.add(source.name);
        }
    }
    else {
        for (const name of bindings.global)
            active.add(name);
    }
    if (bindings.chat != null)
        active.add(bindings.chat);
    return result.filter(source => active.has(source.name));
}
const CONFIG_PREFIX = 'agent-rp-world-info-v0:';
// 读取会话内最新覆盖态（从右往左取最后一个成功结果）。
export function readWorldInfoConfiguration(events) {
    let latest;
    for (const raw of events) {
        const event = raw;
        if (event.type !== 'command/done')
            continue;
        const done = eventData(event);
        if (done?.kind !== 'success' || typeof done.text !== 'string')
            continue;
        const text = done.text;
        if (!text.startsWith(CONFIG_PREFIX))
            continue;
        let value;
        try {
            value = JSON.parse(text.slice(CONFIG_PREFIX.length));
        }
        catch {
            continue;
        }
        const state = object(value);
        if (!state || state.format !== 0 || !Array.isArray(state.overrides))
            continue;
        const overrides = [];
        for (const item of state.overrides) {
            const o = object(item);
            if (!o || typeof o.bookId !== 'string' || typeof o.entryIndex !== 'number' || typeof o.deleted !== 'boolean')
                continue;
            overrides.push({
                bookId: o.bookId,
                entryIndex: o.entryIndex,
                deleted: o.deleted,
                ...(object(o.entry) ? { entry: o.entry } : {}),
            });
        }
        latest = {
            format: 0,
            revision: typeof state.revision === 'number' ? state.revision : 0,
            overrides,
            ...(state.tokenBudget !== undefined ? { tokenBudget: state.tokenBudget } : {}),
        };
    }
    return latest;
}
export function encodeWorldInfoConfiguration(state) {
    return `${CONFIG_PREFIX}${JSON.stringify(state)}`;
}
// ── 命令请求解析（agent-rp 私有命令输入） ──
// rp-world-info-import 的输入：{ format:0, importId }
export function parseWorldInfoLibraryLaunchRequest(source) {
    let value;
    try {
        value = JSON.parse(source);
    }
    catch {
        throw new Error('世界书导入请求不是有效 JSON');
    }
    const record = object(value);
    if (!record || record.format !== 0 || typeof record.importId !== 'string'
        || !/^world-info-[a-f0-9]{32}$/u.test(record.importId)) {
        throw new Error('世界书导入请求字段无效');
    }
    return { format: 0, importId: record.importId };
}
function parseEditable(value) {
    const e = object(value);
    if (!e)
        throw new Error('世界书条目字段无效');
    const secondaryLogic = e.secondaryLogic;
    const position = e.position;
    if (secondaryLogic !== 'and-any' && secondaryLogic !== 'and-all'
        && secondaryLogic !== 'not-any' && secondaryLogic !== 'not-all')
        throw new Error('secondaryLogic 无效');
    if (position !== 'before_char' && position !== 'after_char')
        throw new Error('position 无效');
    return {
        ...(typeof e.name === 'string' ? { name: e.name } : {}),
        ...(typeof e.comment === 'string' ? { comment: e.comment } : {}),
        keys: Array.isArray(e.keys) ? e.keys.filter((x) => typeof x === 'string') : [],
        secondaryKeys: Array.isArray(e.secondaryKeys) ? e.secondaryKeys.filter((x) => typeof x === 'string') : [],
        content: typeof e.content === 'string' ? e.content : '',
        enabled: e.enabled === true,
        insertionOrder: typeof e.insertionOrder === 'number' ? e.insertionOrder : 100,
        selective: e.selective === true,
        constant: e.constant === true,
        caseSensitive: e.caseSensitive === true,
        matchWholeWords: e.matchWholeWords === true,
        secondaryLogic,
        ...(e.scanDepth !== undefined && typeof e.scanDepth === 'number' ? { scanDepth: e.scanDepth } : {}),
        position,
        ...(e.priority !== undefined && typeof e.priority === 'number' ? { priority: e.priority } : {}),
        ignoreBudget: e.ignoreBudget === true,
    };
}
export function parseWorldInfoConfigurationRequest(source) {
    let value;
    try {
        value = JSON.parse(source);
    }
    catch {
        throw new Error('世界书操作请求不是有效 JSON');
    }
    const record = object(value);
    if (!record)
        throw new Error('世界书操作请求必须是对象');
    const revision = typeof record.revision === 'number' && Number.isSafeInteger(record.revision) && record.revision >= 0
        ? record.revision : 0;
    const bookId = () => {
        if (typeof record.bookId !== 'string' || record.bookId.trim() === '')
            throw new Error('bookId 无效');
        return record.bookId;
    };
    const entryIndex = () => {
        if (!Number.isSafeInteger(record.entryIndex) || record.entryIndex < 0)
            throw new Error('entryIndex 无效');
        return record.entryIndex;
    };
    if (record.operation === 'reset-all')
        return { operation: 'reset-all', revision };
    if (record.operation === 'set-budget') {
        if (typeof record.tokenBudget !== 'number' || record.tokenBudget < 0)
            throw new Error('tokenBudget 无效');
        return { operation: 'set-budget', revision, tokenBudget: record.tokenBudget };
    }
    if (record.operation === 'reset-book')
        return { operation: 'reset-book', revision, bookId: bookId() };
    if (record.operation === 'set-book-enabled') {
        if (typeof record.enabled !== 'boolean')
            throw new Error('enabled 必须是布尔值');
        return { operation: 'set-book-enabled', revision, bookId: bookId(), enabled: record.enabled };
    }
    if (record.operation === 'toggle') {
        if (typeof record.enabled !== 'boolean')
            throw new Error('enabled 必须是布尔值');
        return { operation: 'toggle', revision, bookId: bookId(), entryIndex: entryIndex(), enabled: record.enabled };
    }
    if (record.operation === 'edit') {
        return { operation: 'edit', revision, bookId: bookId(), entryIndex: entryIndex(), entry: parseEditable(record.entry) };
    }
    if (record.operation === 'delete') {
        if (typeof record.deleted !== 'boolean')
            throw new Error('deleted 必须是布尔值');
        return { operation: 'delete', revision, bookId: bookId(), entryIndex: entryIndex(), deleted: record.deleted };
    }
    if (record.operation === 'reset-entry') {
        return { operation: 'reset-entry', revision, bookId: bookId(), entryIndex: entryIndex() };
    }
    throw new Error('未知的世界书操作');
}
// 把一次请求应用到覆盖态（供命令影子返回给 agent-rp UI 的编码；真实状态在本库）。
// revision 与配置一致：请求 revision 必须等于当前，否则拒绝（对齐 agent-rp 乐观锁）。
export function applyConfigurationRequest(state, request) {
    const current = state ?? { format: 0, revision: 0, overrides: [] };
    if (request.revision !== current.revision)
        throw new Error('世界书已在别处改变，请刷新后重试');
    if (request.operation === 'reset-all')
        return { ...current, revision: current.revision + 1, overrides: [] };
    if (request.operation === 'set-budget') {
        if (request.tokenBudget === 0) {
            const { tokenBudget: _removed, ...rest } = current;
            return { ...rest, revision: current.revision + 1 };
        }
        return { ...current, revision: current.revision + 1, tokenBudget: request.tokenBudget };
    }
    if (request.operation === 'reset-book') {
        return {
            ...current,
            revision: current.revision + 1,
            overrides: current.overrides.filter(item => item.bookId !== request.bookId),
        };
    }
    if (request.operation === 'set-book-enabled') {
        return {
            ...current,
            revision: current.revision + 1,
            overrides: current.overrides.filter(item => item.bookId !== request.bookId),
        };
    }
    const bookId = request.bookId;
    const entryIndex = request.entryIndex;
    const replace = (update) => {
        const currentOverride = current.overrides.find(item => item.bookId === bookId && item.entryIndex === entryIndex)
            ?? { bookId, entryIndex, deleted: false };
        const next = update(currentOverride);
        return {
            ...current,
            revision: current.revision + 1,
            overrides: [
                ...current.overrides.filter(item => item.bookId !== bookId || item.entryIndex !== entryIndex),
                ...(next === undefined || (next.deleted === false && next.entry === undefined) ? [] : [next]),
            ],
        };
    };
    if (request.operation === 'reset-entry')
        return replace(() => undefined);
    if (request.operation === 'edit')
        return replace(current => ({ ...current, entry: request.entry }));
    if (request.operation === 'toggle') {
        return replace(current => ({
            ...current,
            entry: { ...current.entry, enabled: request.enabled },
        }));
    }
    return replace(current => ({ ...current, deleted: request.deleted }));
}
