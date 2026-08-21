import { getDb, now, uuid } from '../db/index.js';
import { parseJson, toJson } from './base.js';
export function toEntryView(row) {
    const raw = parseJson(row.raw, null);
    const rawMap = raw ?? {};
    const key = parseJson(row.key, []);
    const secondary = parseJson(row.keysecondary, []);
    const triggers = Array.isArray(rawMap.triggers) ? rawMap.triggers.filter((x) => typeof x === 'string') : [];
    const cf = (rawMap.characterFilter ?? {});
    const names = Array.isArray(cf.names) ? cf.names.filter((x) => typeof x === 'string') : [];
    const tags = Array.isArray(cf.tags) ? cf.tags.filter((x) => typeof x === 'string') : [];
    const delayUntil = typeof raw?.delayUntilRecursion === 'number' ? raw.delayUntilRecursion
        : raw?.delayUntilRecursion === true || raw?.delayUntilRecursion === 1 ? 1
            : false;
    const view = {
        id: row.id,
        key: Array.isArray(key) ? key : [],
        keysecondary: Array.isArray(secondary) ? secondary : [],
        comment: row.comment,
        content: row.content ?? '',
        constant: row.constant === 1,
        vectorized: row.vectorized === 1,
        selective: row.selective === 1,
        selectiveLogic: row.selectiveLogic ?? 0,
        order: row.order,
        position: row.position,
        disable: row.disable === 1,
        caseSensitive: row.caseSensitive === null ? null : row.caseSensitive === 1,
        matchWholeWords: row.matchWholeWords === null ? null : row.matchWholeWords === 1,
        scanDepth: row.scanDepth,
        useGroupScoring: typeof raw?.useGroupScoring === 'boolean' ? raw.useGroupScoring : null,
        excludeRecursion: row.excludeRecursion === 1,
        preventRecursion: row.preventRecursion === 1,
        delayUntilRecursion: delayUntil,
        probability: row.probability,
        useProbability: row.useProbability === null ? true : row.useProbability === 1,
        depth: row.depth,
        outletName: typeof raw?.outletName === 'string' ? raw.outletName : '',
        group: typeof raw?.group === 'string' ? raw.group : '',
        groupOverride: raw?.groupOverride === true,
        groupWeight: typeof raw?.groupWeight === 'number' ? raw.groupWeight : 100,
        sticky: row.sticky,
        cooldown: row.cooldown,
        delay: row.delay,
        displayIndex: row.displayIndex,
        automationId: typeof raw?.automationId === 'string' ? raw.automationId : '',
        role: typeof raw?.role === 'number' ? raw.role : null,
        triggers,
        characterFilter: { isExclude: cf.isExclude === true, names, tags },
        matchPersonaDescription: rawMap.matchPersonaDescription === true,
        matchCharacterDescription: rawMap.matchCharacterDescription === true,
        matchCharacterPersonality: rawMap.matchCharacterPersonality === true,
        matchCharacterDepthPrompt: rawMap.matchCharacterDepthPrompt === true,
        matchScenario: rawMap.matchScenario === true,
        matchCreatorNotes: rawMap.matchCreatorNotes === true,
    };
    return view;
}
// ── 世界书 ──
export function list() {
    return getDb()
        .prepare('SELECT * FROM worldbooks WHERE is_deleted=0 ORDER BY created_at ASC')
        .all();
}
export function listEnabled() {
    return getDb()
        .prepare('SELECT * FROM worldbooks WHERE is_deleted=0 AND enabled=1 ORDER BY created_at ASC')
        .all();
}
export function get(id) {
    return (getDb().prepare('SELECT * FROM worldbooks WHERE id=? AND is_deleted=0 LIMIT 1').get(id) ?? null);
}
export function create(name, opts = {}) {
    const db = getDb();
    const t = now();
    const id = uuid();
    db.prepare('INSERT INTO worldbooks (id, name, description, enabled, scan_depth, extensions, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at) VALUES (?,?,?,0,?,?,?,?,?,?,0,NULL)').run(id, name, opts.description ?? null, opts.scanDepth ?? null, opts.extensions !== undefined ? toJson(opts.extensions) : null, t, t, 'user', 'user');
    return get(id);
}
export function update(id, patch) {
    const existing = get(id);
    if (!existing)
        return null;
    const db = getDb();
    const t = now();
    if (patch.name !== undefined)
        db.prepare('UPDATE worldbooks SET name=?, updated_at=? WHERE id=?').run(patch.name, t, id);
    if (patch.description !== undefined)
        db.prepare('UPDATE worldbooks SET description=?, updated_at=? WHERE id=?').run(patch.description, t, id);
    if (patch.scanDepth !== undefined)
        db.prepare('UPDATE worldbooks SET scan_depth=?, updated_at=? WHERE id=?').run(patch.scanDepth, t, id);
    if (patch.extensions !== undefined)
        db.prepare('UPDATE worldbooks SET extensions=?, updated_at=? WHERE id=?').run(toJson(patch.extensions), t, id);
    if (patch.enabled !== undefined)
        db.prepare('UPDATE worldbooks SET enabled=?, updated_at=? WHERE id=?').run(patch.enabled ? 1 : 0, t, id);
    return get(id);
}
export function setEnabled(id, enabled) {
    return update(id, { enabled });
}
export function remove(id) {
    const db = getDb();
    const t = now();
    db.prepare('UPDATE worldbook_entries SET is_deleted=1, deleted_at=?, updated_at=? WHERE worldbook_id=?').run(t, t, id);
    db.prepare('UPDATE worldbooks SET is_deleted=1, deleted_at=?, updated_at=? WHERE id=?').run(t, t, id);
    clearTimedEffects(id);
}
// ── 条目 ──
export function entries(bookId) {
    return getDb()
        .prepare('SELECT * FROM worldbook_entries WHERE worldbook_id=? AND is_deleted=0 ORDER BY displayIndex ASC, "order" DESC')
        .all(bookId);
}
// 替换整本条目集（导入用）：删旧插新。
export function replaceEntries(bookId, items) {
    const db = getDb();
    const t = now();
    db.prepare('UPDATE worldbook_entries SET is_deleted=1, deleted_at=?, updated_at=? WHERE worldbook_id=?').run(t, t, bookId);
    const insert = db.prepare(`INSERT INTO worldbook_entries (id, worldbook_id, key, keysecondary, comment, content, constant, vectorized, selective, selectiveLogic, "order", position, disable, caseSensitive, matchWholeWords, scanDepth, excludeRecursion, preventRecursion, useProbability, probability, depth, sticky, cooldown, delay, displayIndex, raw, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL)`);
    items.forEach((item, index) => {
        const v = normalizeEntry(item);
        if (item.displayIndex === undefined)
            v.displayIndex = index;
        insert.run(uuid(), bookId, toJson(v.key), toJson(v.keysecondary), v.comment, v.content, v.constant ? 1 : 0, v.vectorized ? 1 : 0, v.selective ? 1 : 0, v.selectiveLogic, v.order, v.position, v.disable ? 1 : 0, v.caseSensitive === null ? null : v.caseSensitive ? 1 : 0, v.matchWholeWords === null ? null : v.matchWholeWords ? 1 : 0, v.scanDepth, v.excludeRecursion ? 1 : 0, v.preventRecursion ? 1 : 0, v.useProbability ? 1 : 0, v.probability, v.depth, v.sticky, v.cooldown, v.delay, v.displayIndex, item.raw !== undefined && item.raw !== null ? toJson(item.raw) : null, t, t, 'user', 'user');
    });
}
function strArray(v) {
    if (v === undefined || v === null)
        return [];
    if (Array.isArray(v))
        return v.filter((x) => typeof x === 'string');
    return [];
}
function bool(v, fallback = false) {
    if (v === undefined || v === null)
        return fallback;
    return v === true || v === 1 || v === '1' || v === 'true';
}
function num(v, fallback) {
    if (v === undefined || v === null)
        return fallback ?? null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : (fallback ?? null);
}
function tri(v) {
    if (v === undefined || v === null)
        return null;
    if (v === true || v === 1 || v === '1' || v === 'true')
        return true;
    if (v === false || v === 0 || v === '0' || v === 'false')
        return false;
    return null;
}
// 从 ST 条目对象规范化为行字段。UI 与导入共用；字段名即 ST 编辑器内部格式（key/keysecondary/order/disable/...）。
export function normalizeEntry(src) {
    const key = strArray(src.key ?? src.keys);
    const keysecondary = strArray(src.keysecondary ?? src.secondary_keys);
    const raw = src.raw;
    const delayUntil = src.delayUntilRecursion !== undefined ? src.delayUntilRecursion : (raw?.delayUntilRecursion ?? false);
    let position = num(src.position, 0) ?? 0;
    // 兼容 spec v2 的字符串 position（before_char/after_char）
    if (typeof src.position === 'string') {
        if (src.position === 'after_char')
            position = 1;
        else if (src.position === 'before_char')
            position = 0;
    }
    return {
        key,
        keysecondary,
        comment: typeof src.comment === 'string' ? src.comment : null,
        content: typeof src.content === 'string' ? src.content : '',
        constant: bool(src.constant),
        vectorized: bool(src.vectorized) || (raw?.vectorized === true),
        selective: bool(src.selective, false),
        selectiveLogic: num(src.selectiveLogic ?? raw?.selectiveLogic, 0) ?? 0,
        order: num(src.order ?? src.insertionOrder ?? src.insertion_order ?? raw?.insertion_order, 100) ?? 100,
        position,
        disable: src.disable !== undefined ? bool(src.disable) : (src.enabled !== undefined ? !bool(src.enabled) : false),
        caseSensitive: src.caseSensitive !== undefined ? tri(src.caseSensitive) : null,
        matchWholeWords: src.matchWholeWords !== undefined ? tri(src.matchWholeWords) : null,
        scanDepth: num(src.scanDepth),
        excludeRecursion: bool(src.excludeRecursion, true) || (raw?.excludeRecursion === true),
        preventRecursion: bool(src.preventRecursion) || (raw?.preventRecursion === true),
        useProbability: src.useProbability !== undefined ? bool(src.useProbability, true) : true,
        probability: num(src.probability ?? raw?.probability, 100) ?? 100,
        depth: num(src.depth ?? raw?.depth, 4) ?? 4,
        sticky: src.sticky !== undefined ? num(src.sticky, 0) : null,
        cooldown: src.cooldown !== undefined ? num(src.cooldown, 0) : null,
        delay: src.delay !== undefined ? num(src.delay, 0) : null,
        displayIndex: src.displayIndex !== undefined ? num(src.displayIndex, 0) ?? 0 : (raw && raw.extensions?.display_index !== undefined ? num(raw.extensions.display_index, 0) ?? 0 : 0),
    };
}
// ST 高级字段 → 需要写回 raw 的部分（余下所有字段原样保留）。
function advancedFrom(src) {
    const raw = src.raw ?? {};
    const out = {};
    for (const key of ['outletName', 'group', 'groupOverride', 'groupWeight', 'automationId', 'role', 'triggers', 'useGroupScoring', 'delayUntilRecursion', 'characterFilter', 'matchPersonaDescription', 'matchCharacterDescription', 'matchCharacterPersonality', 'matchCharacterDepthPrompt', 'matchScenario', 'matchCreatorNotes', 'useProbability']) {
        if (src[key] !== undefined)
            out[key] = src[key];
    }
    // 工具 schema 的 enum 用字符串（Gemini 要求），这里把 role 转回数字存储。
    if (typeof out.role === 'string' && out.role !== '')
        out.role = num(out.role, 0);
    return { ...raw, ...out };
}
// 对齐 ST：role 仅用于 @D 位置（系统/用户/AI）。非 @D 位置不携带 role（ST 切换位置时会清空）。
function applyRoleByPosition(src, position) {
    const raw = src.raw;
    if (!raw)
        return;
    if (position === 4) {
        if (raw.role === undefined)
            raw.role = 0;
    }
    else {
        delete raw.role;
    }
}
export function getEntry(bookId, entryId) {
    return (getDb().prepare('SELECT * FROM worldbook_entries WHERE worldbook_id=? AND id=? AND is_deleted=0 LIMIT 1').get(bookId, entryId) ?? null);
}
export function addEntry(bookId, patch) {
    const src = { ...(patch ?? {}) };
    src.raw = advancedFrom(src);
    const v = normalizeEntry(src);
    if (src.displayIndex === undefined) {
        const max = getDb().prepare('SELECT COALESCE(MAX(displayIndex), -1) AS m FROM worldbook_entries WHERE worldbook_id=? AND is_deleted=0').get(bookId);
        v.displayIndex = max.m + 1;
    }
    applyRoleByPosition(src, v.position);
    const db = getDb();
    const t = now();
    const id = uuid();
    db.prepare(`INSERT INTO worldbook_entries (id, worldbook_id, key, keysecondary, comment, content, constant, vectorized, selective, selectiveLogic, "order", position, disable, caseSensitive, matchWholeWords, scanDepth, excludeRecursion, preventRecursion, useProbability, probability, depth, sticky, cooldown, delay, displayIndex, raw, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL)`).run(id, bookId, toJson(v.key), toJson(v.keysecondary), v.comment, v.content, v.constant ? 1 : 0, v.vectorized ? 1 : 0, v.selective ? 1 : 0, v.selectiveLogic, v.order, v.position, v.disable ? 1 : 0, v.caseSensitive === null ? null : v.caseSensitive ? 1 : 0, v.matchWholeWords === null ? null : v.matchWholeWords ? 1 : 0, v.scanDepth, v.excludeRecursion ? 1 : 0, v.preventRecursion ? 1 : 0, v.useProbability ? 1 : 0, v.probability, v.depth, v.sticky, v.cooldown, v.delay, v.displayIndex, toJson(src.raw), t, t, 'user', 'user');
    return getEntry(bookId, id);
}
export function updateEntry(bookId, entryId, patch) {
    const existing = getEntry(bookId, entryId);
    if (!existing)
        return null;
    // 以现有条目视图为底（数组/布尔已解码），叠加新 patch，再规范化为列。
    const view = toEntryView(existing);
    const src = { ...view, ...patch };
    // 保留 existing.raw 作为基础，叠加新高级字段
    const prevRaw = parseJson(existing.raw, {});
    src.raw = { ...prevRaw, ...advancedFrom(src) };
    const v = normalizeEntry(src);
    applyRoleByPosition(src, v.position);
    const db = getDb();
    const t = now();
    db.prepare(`UPDATE worldbook_entries SET key=?, keysecondary=?, comment=?, content=?, constant=?, vectorized=?, selective=?, selectiveLogic=?, "order"=?, position=?, disable=?, caseSensitive=?, matchWholeWords=?, scanDepth=?, excludeRecursion=?, preventRecursion=?, useProbability=?, probability=?, depth=?, sticky=?, cooldown=?, delay=?, displayIndex=?, raw=?, updated_at=? WHERE id=?`).run(toJson(v.key), toJson(v.keysecondary), v.comment, v.content, v.constant ? 1 : 0, v.vectorized ? 1 : 0, v.selective ? 1 : 0, v.selectiveLogic, v.order, v.position, v.disable ? 1 : 0, v.caseSensitive === null ? null : v.caseSensitive ? 1 : 0, v.matchWholeWords === null ? null : v.matchWholeWords ? 1 : 0, v.scanDepth, v.excludeRecursion ? 1 : 0, v.preventRecursion ? 1 : 0, v.useProbability ? 1 : 0, v.probability, v.depth, v.sticky, v.cooldown, v.delay, v.displayIndex, toJson(src.raw), t, entryId);
    return getEntry(bookId, entryId);
}
export function removeEntry(bookId, entryId) {
    const t = now();
    getDb()
        .prepare('UPDATE worldbook_entries SET is_deleted=1, deleted_at=?, updated_at=? WHERE worldbook_id=? AND id=?')
        .run(t, t, bookId, entryId);
}
// 按给定顺序批量重写 displayIndex（ST Custom 拖拽排序）。
export function reorderEntries(bookId, orderedIds) {
    const db = getDb();
    const t = now();
    const run = db.prepare('UPDATE worldbook_entries SET displayIndex=?, updated_at=? WHERE worldbook_id=? AND id=?');
    db.exec('BEGIN');
    try {
        orderedIds.forEach((id, index) => run.run(index, t, bookId, id));
        db.exec('COMMIT');
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
// ── ST 双向兼容 ──
// 从角色卡 JSON 顶层抽取世界书对象（CCv2：character_book 在顶层；CCv3：在 data.character_book）。
// 纯世界书 JSON 无 character_book 时原样返回。仅取世界书部分，剔除角色卡的角色数据。
export function pickCharacterBook(parsed) {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return null;
    const root = parsed;
    if (typeof root.character_book === 'object' && root.character_book !== null && !Array.isArray(root.character_book)) {
        return root.character_book;
    }
    const data = root.data;
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const inner = data.character_book;
        if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
            return inner;
        }
    }
    return null;
}
// 解析 ST 世界书 JSON(text) → { name, description, scanDepth, entries }
// 兼容三种形态：spec v2 entries(数组)、ST 编辑器内部 entries(对象，键为字符串序数)、
// 角色卡 JSON（CCv2/CCv3，自动抽取 character_book 只导入世界书内容）。
export function parseStWorldJson(json) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        throw new Error('世界书不是合法 JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('世界书顶层必须是对象');
    }
    const root = (pickCharacterBook(parsed) ?? parsed);
    const entries = root.entries;
    if (typeof entries !== 'object' || entries === null) {
        throw new Error('世界书缺少 entries 字段');
    }
    const pairs = Array.isArray(entries)
        ? entries.map((e, i) => [String(i), e])
        : Object.entries(entries);
    const out = [];
    for (const [uid, rawEntry] of pairs) {
        if (typeof rawEntry !== 'object' || rawEntry === null || Array.isArray(rawEntry)) {
            throw new Error(`世界书条目 ${uid} 必须是对象`);
        }
        const e = rawEntry;
        const v = normalizeEntry(e);
        const ext = (e.extensions ?? {});
        out.push({
            ...v,
            key: v.key,
            keysecondary: v.keysecondary,
            content: v.content,
            displayIndex: typeof ext.display_index === 'number' ? ext.display_index : undefined,
            raw: rawEntry,
        });
    }
    return {
        ...(typeof root.name === 'string' ? { name: root.name } : {}),
        ...(typeof root.description === 'string' ? { description: root.description } : {}),
        ...(num(root.scan_depth) !== null ? { scanDepth: num(root.scan_depth) } : {}),
        entries: out,
    };
}
// 导出为一本 ST 世界书 JSON 文本（entries 用序数字符串键，兼容 ST 编辑器内部格式）。
// 字段名即 ST 编辑器内部格式，直接写出，无需映射。
export function toStWorldJson(bookId) {
    const book = get(bookId);
    if (!book)
        throw new Error('世界书不存在');
    const rows = [...entries(bookId)].sort((a, b) => a.displayIndex - b.displayIndex || a.order - b.order);
    const outEntries = {};
    rows.forEach((row, i) => {
        const view = toEntryView(row);
        const raw = parseJson(row.raw, {});
        const base = { ...raw };
        base.key = view.key;
        base.keysecondary = view.keysecondary;
        base.content = view.content;
        base.comment = view.comment ?? '';
        base.constant = view.constant;
        base.vectorized = view.vectorized;
        base.selective = view.selective;
        base.selectiveLogic = view.selectiveLogic;
        base.order = view.order;
        base.position = view.position;
        base.disable = view.disable;
        if (view.caseSensitive !== null)
            base.caseSensitive = view.caseSensitive;
        if (view.matchWholeWords !== null)
            base.matchWholeWords = view.matchWholeWords;
        if (view.scanDepth !== null)
            base.scanDepth = view.scanDepth;
        if (view.delayUntilRecursion !== false)
            base.delayUntilRecursion = view.delayUntilRecursion;
        if (view.role !== null)
            base.role = view.role;
        base.useProbability = view.useProbability;
        base.probability = view.probability;
        base.depth = view.depth;
        if (view.sticky !== null)
            base.sticky = view.sticky;
        if (view.cooldown !== null)
            base.cooldown = view.cooldown;
        if (view.delay !== null)
            base.delay = view.delay;
        const baseExt = (base.extensions ?? {});
        base.extensions = { ...baseExt, display_index: view.displayIndex };
        base.uid = i;
        outEntries[String(i)] = base;
    });
    const out = { entries: outEntries };
    if (book.name)
        out.name = book.name;
    if (book.description)
        out.description = book.description;
    if (book.scan_depth !== null && book.scan_depth !== undefined)
        out.scan_depth = book.scan_depth;
    return toJson(out);
}
// 视图
export function toBookView(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        enabled: row.enabled === 1,
        scanDepth: row.scan_depth,
        entryCount: entries(row.id).length,
    };
}
export function toEntryItem(row) {
    const v = toEntryView(row);
    const stateName = v.constant ? '常驻' : v.vectorized ? '向量' : v.disable ? '禁用' : '普通';
    const keysNote = v.key.length > 0 ? v.key.join('、') : '(无触发词)';
    return {
        id: v.id,
        comment: v.comment,
        content: v.content,
        key: v.key,
        keysecondary: v.keysecondary,
        constant: v.constant,
        vectorized: v.vectorized,
        selective: v.selective,
        selectiveLogic: v.selectiveLogic,
        order: v.order,
        position: v.position,
        disable: v.disable,
        caseSensitive: v.caseSensitive,
        matchWholeWords: v.matchWholeWords,
        scanDepth: v.scanDepth,
        useGroupScoring: v.useGroupScoring,
        excludeRecursion: v.excludeRecursion,
        preventRecursion: v.preventRecursion,
        delayUntilRecursion: v.delayUntilRecursion,
        probability: v.probability,
        useProbability: v.useProbability,
        depth: v.depth,
        outletName: v.outletName,
        group: v.group,
        groupOverride: v.groupOverride,
        groupWeight: v.groupWeight,
        sticky: v.sticky,
        cooldown: v.cooldown,
        delay: v.delay,
        automationId: v.automationId,
        role: v.role,
        triggers: v.triggers,
        characterFilter: v.characterFilter,
        matchPersonaDescription: v.matchPersonaDescription,
        matchCharacterDescription: v.matchCharacterDescription,
        matchCharacterPersonality: v.matchCharacterPersonality,
        matchCharacterDepthPrompt: v.matchCharacterDepthPrompt,
        matchScenario: v.matchScenario,
        matchCreatorNotes: v.matchCreatorNotes,
        displayIndex: v.displayIndex,
        digest: `${keysNote} [${stateName}] ${v.content.slice(0, 120)}`,
    };
}
/** 读取某世界书当前的 sticky/cooldown 生效区间 */
export function getTimedEffects(bookId) {
    const rows = getDb()
        .prepare('SELECT * FROM worldbook_timed_effects WHERE book_id=?')
        .all(bookId);
    return rows.map((r) => ({ bookId: r.book_id, entryId: r.entry_id, type: r.type, start: r.start, end: r.end }));
}
/** 为某条目设置一个 sticky/cooldown 生效区间（覆盖同类型旧值） */
export function setTimedEffect(bookId, entryId, type, start, end) {
    getDb().prepare(`INSERT INTO worldbook_timed_effects (book_id, entry_id, type, start, end, created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(book_id, entry_id, type) DO UPDATE SET start=excluded.start, end=excluded.end`).run(bookId, entryId, type, start, end, now());
}
/** 移除已过期的生效区间（start < cursor 且被覆盖，或 end < cursor） */
export function pruneTimedEffects(bookId, cursor) {
    getDb().prepare('DELETE FROM worldbook_timed_effects WHERE book_id=? AND end <= ?').run(bookId, cursor);
}
/** 清空某世界书全部跨轮状态（重命名/切换时） */
export function clearTimedEffects(bookId) {
    getDb().prepare('DELETE FROM worldbook_timed_effects WHERE book_id=?').run(bookId);
}
