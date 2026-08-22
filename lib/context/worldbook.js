import * as worldbook from '../data/worldbook.js';
import { getDb } from '../db/index.js';
// ST world_info_position.atDepth（在聊天指定深度插入）。
export const AT_DEPTH_POSITION = 4;
export const DEFAULT_AT_DEPTH = 4;
function includesKey(text, key, caseSensitive, matchWholeWords) {
    if (key.length === 0)
        return false;
    const haystack = caseSensitive ? text : text.toLocaleLowerCase();
    const needle = caseSensitive ? key : key.toLocaleLowerCase();
    if (!matchWholeWords)
        return haystack.includes(needle);
    if (/\s/u.test(needle))
        return haystack.includes(needle);
    let offset = haystack.indexOf(needle);
    while (offset >= 0) {
        const before = offset === 0 ? '' : haystack[offset - 1];
        const after = offset + needle.length >= haystack.length ? '' : haystack[offset + needle.length];
        if (!/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after))
            return true;
        offset = haystack.indexOf(needle, offset + 1);
    }
    return false;
}
function isRegexKey(key) {
    return /^\/[\s\S]+\/[gimsuy]*$/u.test(key) || /[\\^$.*+?()[\]{}|]/u.test(key);
}
function keyHit(keys, text, caseSensitive, matchWholeWords) {
    for (const key of keys) {
        if (key.length === 0)
            continue;
        // 正则形态的键按正则匹配；否则按子串/整词
        if (isRegexKey(key)) {
            let re;
            try {
                const m = /^\/([\s\S]+)\/([gimsuy]*)$/u.exec(key);
                re = m ? new RegExp(m[1], m[2]) : new RegExp(key);
            }
            catch {
                continue;
            }
            if (re.test(text))
                return true;
        }
        else if (includesKey(text, key, caseSensitive, matchWholeWords)) {
            return true;
        }
    }
    return false;
}
function evaluateEntry(entry, text) {
    if (entry.disable)
        return { hit: false, reason: 'disabled' };
    if (entry.content.trim().length === 0)
        return { hit: false, reason: 'empty' };
    if (entry.constant || entry.vectorized)
        return { hit: true, reason: entry.constant ? 'constant' : 'vectorized' };
    if (entry.key.length === 0)
        return { hit: false, reason: 'no-keys' };
    const caseSensitive = entry.caseSensitive ?? false;
    const matchWholeWords = entry.matchWholeWords ?? false;
    const primary = keyHit(entry.key, text, caseSensitive, matchWholeWords);
    if (!primary)
        return { hit: false, reason: 'primary-unmatched' };
    // selective：副键按 selectiveLogic 限定（ST 语义：0=AND ANY / 1=NOT ALL / 2=NOT ANY / 3=AND ALL）
    if (entry.selective && entry.keysecondary.length > 0) {
        const matches = entry.keysecondary.map((k) => includesKey(text, k, caseSensitive, matchWholeWords) || (isRegexKey(k) ? keyHit([k], text, caseSensitive, matchWholeWords) : false));
        const ok = entry.selectiveLogic === 1 ? matches.some((m) => !m)
            : entry.selectiveLogic === 2 ? matches.every((m) => !m)
                : entry.selectiveLogic === 3 ? matches.every(Boolean)
                    : matches.some(Boolean);
        if (!ok)
            return { hit: false, reason: 'secondary-unmatched' };
    }
    return { hit: true, reason: 'keyword' };
}
// 单本世界书：递归扫描判定 + 输出候选。
// 对齐 ST world-info.js 扫描：第一轮按深度命中 → 命中 content 加入 recursion buffer → 递归轮次扫描文本 = 深度消息 + recursion buffer。
// excludeRecursion 条目在递归轮次跳过；preventRecursion 条目的 content 不加入 recursion buffer（但自身已激活）。
// sticky：激活后持续 sticky 条消息强制注入（跳过概率）；cooldown：命中时若在冷却区间则跳过。
// delay：cursor < delay 时强制注入。delayUntilRecursion：非递归轮次跳过，递归轮次按 delay 值激活。
function bookCandidates(book, rows, messageLines, opts) {
    const { cursor, depth, character } = opts;
    const timed = worldbook.getTimedEffects(book.id);
    const stickyActive = new Map(); // entryId -> 本轮 sticky 生效
    const cooldownActive = new Map();
    for (const t of timed) {
        if (t.type === 'sticky' && cursor >= t.start && cursor < t.end)
            stickyActive.set(t.entryId, true);
        if (t.type === 'cooldown' && cursor >= t.start && cursor < t.end)
            cooldownActive.set(t.entryId, true);
    }
    // 清理已过期状态（本次调用结束游标之后）
    worldbook.pruneTimedEffects(book.id, cursor);
    const out = [];
    const activated = new Set(); // 防同一轮重复激活
    const seenAll = new Set(); // 全流程已激活（sticky/递归去重）
    // ST 排序：order 越大越靠前
    const sorted = [...rows].sort((a, b) => b.order - a.order);
    // 递归扫描循环
    let recursionText = '';
    const baseText = textForView(rows, messageLines, depth); // 深度截断后的基础扫描文本
    for (let loop = 0; loop < MAX_RECURSION; loop++) {
        const scanText = recursionText === '' ? baseText : baseText + '\n' + recursionText;
        const isRecursion = recursionText !== '';
        const newlyActivated = [];
        let newRecursionParts = [];
        for (const view of sorted) {
            if (seenAll.has(view.id))
                continue;
            if (view.disable)
                continue;
            if (view.content.trim().length === 0)
                continue;
            // 角色卡绑定（兼容层）：条目 characterFilter 按「当前角色」过滤（对齐 ST 4704-4731）。
            // 无当前角色上下文（无提供方/拿不到角色）时不过滤——本插件无角色卡实体。
            if (character && !passesCharacterFilter(view, character))
                continue;
            // delay：cursor < delay 时强制注入（不做关键词判定）
            if (view.delay != null && view.delay > 0 && cursor < view.delay) {
                newlyActivated.push(view);
                seenAll.add(view.id);
                if (!view.preventRecursion)
                    newRecursionParts.push(view.content);
                continue;
            }
            // cooldown 抑制（sticky 优先）
            if (cooldownActive.get(view.id) && !stickyActive.get(view.id))
                continue;
            // delayUntilRecursion：非递归轮次跳过；递归轮次按 delay 层级激活（delay=true 视为 1，第 N 层递归 loop=N-1 激活）
            if (view.delayUntilRecursion && !isRecursion && !stickyActive.get(view.id))
                continue;
            const dur = view.delayUntilRecursion === true ? 1 : (typeof view.delayUntilRecursion === 'number' ? view.delayUntilRecursion : 0);
            if (view.delayUntilRecursion && isRecursion && dur > loop + 1 && !stickyActive.get(view.id))
                continue;
            // excludeRecursion：递归轮次跳过（非 sticky）
            if (isRecursion && view.excludeRecursion && !stickyActive.get(view.id))
                continue;
            // sticky 生效：无条件激活（跳过关键词与概率）
            if (stickyActive.get(view.id)) {
                newlyActivated.push(view);
                seenAll.add(view.id);
                if (!view.preventRecursion)
                    newRecursionParts.push(view.content);
                continue;
            }
            // 常驻无条件激活
            if (view.constant || view.vectorized) {
                newlyActivated.push(view);
                seenAll.add(view.id);
                if (!view.preventRecursion)
                    newRecursionParts.push(view.content);
                continue;
            }
            // 关键词判定
            if (view.key.length === 0)
                continue;
            const decision = evaluateEntry(view, scanText);
            if (!decision.hit)
                continue;
            // 概率判定（sticky 期间不重roll）
            if (view.useProbability && view.probability < 100 && !stickyActive.get(view.id)) {
                if (Math.random() * 100 > view.probability)
                    continue;
            }
            newlyActivated.push(view);
            seenAll.add(view.id);
            activated.add(view.id);
            if (!view.preventRecursion)
                newRecursionParts.push(view.content);
        }
        if (newlyActivated.length > 0) {
            out.push(...newlyActivated);
            // 写入 timed effects：激活的 sticky/cooldown 条目
            for (const v of newlyActivated) {
                if (v.sticky != null && v.sticky > 0 && !stickyActive.get(v.id)) {
                    worldbook.setTimedEffect(book.id, v.id, 'sticky', cursor, cursor + v.sticky);
                }
                if (v.cooldown != null && v.cooldown > 0 && !cooldownActive.get(v.id)) {
                    worldbook.setTimedEffect(book.id, v.id, 'cooldown', cursor, cursor + v.cooldown);
                }
            }
        }
        // 递归：有新激活且未 preventRecursion 的 content → 继续下一轮
        if (newRecursionParts.length > 0) {
            recursionText = (recursionText === '' ? '' : recursionText + '\n') + newRecursionParts.join('\n');
            continue;
        }
        break;
    }
    return out;
}
const MAX_RECURSION = 5;
function textForView(rows, messageLines, depth) {
    // 本项目全局默认深度 depth（ST scan_depth 语义：最近 N 条；0/负=全部）
    if (depth === null || depth === undefined || depth <= 0)
        return messageLines.join('\n');
    return messageLines.slice(-Math.max(1, Math.trunc(depth))).join('\n');
}
// ST characterFilter 判定（对齐 world-info.js 4704-4731）：
// - names：当前角色文件名（getCharaFilename，不含扩展名）在名单内 → isExclude ? 排除 : 保留。
// - tags：当前角色标签 id 与名单交集 → isExclude ? 排除 : 保留。
function passesCharacterFilter(entry, character) {
    const cf = entry.characterFilter;
    if (!cf)
        return true;
    if (cf.names.length > 0) {
        const nameIncluded = cf.names.includes(character.name);
        const filtered = cf.isExclude ? nameIncluded : !nameIncluded;
        if (filtered)
            return false;
    }
    if (cf.tags.length > 0) {
        const includesTag = character.tags.some((tag) => cf.tags.includes(tag));
        const filtered = cf.isExclude ? includesTag : !includesTag;
        if (filtered)
            return false;
    }
    return true;
}
// 构建本轮注入的书集合（协议 §5 取书顺序：source → 绑定书按名 → 全局启用书）：
// 1. 宿主 worldbook.source 提供的书（ST 格式，转成本库条目视图）
// 2. worldbook.context.books 绑定的书名（按名查本库，含全局未启用但被显式绑定的书）
// 3. 本库全局启用的书
function buildInjectionBooks(sourceBooks, boundBookNames, enabledBooks, byBook) {
    const out = [];
    const seenIds = new Set();
    const seenNames = new Set();
    for (const b of sourceBooks ?? []) {
        if (seenNames.has(b.name))
            continue;
        seenNames.add(b.name);
        const id = `source:${b.name}`;
        out.push({
            id,
            name: b.name,
            views: (b.entries ?? []).map((e, i) => worldbook.stEntryToView(e, `${id}#${i}`)),
        });
    }
    for (const row of worldbook.findByNameMany(boundBookNames ?? [])) {
        if (seenIds.has(row.id) || seenNames.has(row.name))
            continue;
        seenIds.add(row.id);
        seenNames.add(row.name);
        out.push({ id: row.id, name: row.name, views: byBook.get(row.id) ?? [] });
    }
    for (const book of enabledBooks) {
        if (seenIds.has(book.id) || seenNames.has(book.name))
            continue;
        seenIds.add(book.id);
        seenNames.add(book.name);
        out.push({ id: book.id, name: book.name, views: byBook.get(book.id) ?? [] });
    }
    return out;
}
export function renderWorldbookInjection(messageLines, opts = {}) {
    const defaultDepth = opts.depth ?? 2;
    const cursor = opts.cursor ?? 0;
    const db = getDb();
    const allRows = db
        .prepare('SELECT * FROM worldbook_entries WHERE is_deleted=0')
        .all();
    const byBook = new Map();
    for (const row of allRows) {
        if (!byBook.has(row.worldbook_id))
            byBook.set(row.worldbook_id, []);
        byBook.get(row.worldbook_id).push(worldbook.toEntryView(row));
    }
    const units = buildInjectionBooks(opts.sourceBooks, opts.boundBookNames, worldbook.listEnabled(), byBook);
    if (units.length === 0)
        return [];
    const candidateViews = [];
    for (const unit of units) {
        candidateViews.push(...bookCandidates(unit, unit.views, messageLines, { cursor, depth: defaultDepth, character: opts.character }));
    }
    // Inclusion Group 互斥：同 group（非 groupOverride）只保留 order 最高者
    const deduped = dedupeGroups(candidateViews);
    // ST 排序：position 分组（before 0 在前，其余按其枚举顺序），组内 order 降序
    return [...deduped]
        .sort((a, b) => a.position - b.position || b.order - a.order)
        .map((v) => ({
        content: v.content,
        position: v.position,
        order: v.order,
        // 深度仅对 @D 位置有效；非 @D 位置深度无效（对齐 ST 注入逻辑）
        depth: v.position === AT_DEPTH_POSITION ? (v.depth ?? DEFAULT_AT_DEPTH) : null,
        role: v.position === AT_DEPTH_POSITION ? (v.role ?? 0) : null,
        reason: 'matched',
    }));
}
// Inclusion Group 互斥：同 group 且非 groupOverride 中，仅保留 order 最大的一个（返回扁平去重集合）。
function dedupeGroups(views) {
    const self = new Set(); // 无 group 或 groupOverride → 全部保留
    const groups = new Map();
    for (const v of views) {
        if (!v.group || v.groupOverride) {
            self.add(v.id);
            continue;
        }
        for (const g of v.group.split(',').map((s) => s.trim()).filter(Boolean)) {
            if (!groups.has(g))
                groups.set(g, []);
            groups.get(g).push(v);
        }
    }
    const out = [];
    const seen = new Set();
    // 先保留全部独立条目（无组/优先条目）
    for (const v of views) {
        if (self.has(v.id)) {
            seen.add(v.id);
            out.push(v);
        }
    }
    // 每个组只保留 order 最高的一个
    for (const [, list] of groups) {
        list.sort((a, b) => b.order - a.order);
        const winner = list[0];
        if (winner && !seen.has(winner.id)) {
            seen.add(winner.id);
            out.push(winner);
        }
    }
    return out;
}
// 把模型可见消息数组转成「消息行」（每条消息一行/一段），供深度扫描与键匹配。
export function matchLinesFromMessages(messages) {
    const lines = [];
    for (const m of messages) {
        const text = contentToText(m?.content).trim();
        if (text)
            lines.push(text);
    }
    return lines;
}
function contentToText(content) {
    if (typeof content === 'string')
        return content;
    if (Array.isArray(content)) {
        return content
            .map((c) => (c && typeof c === 'object' && typeof c.text === 'string' ? c.text : ''))
            .filter(Boolean)
            .join('\n');
    }
    return '';
}
