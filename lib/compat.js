let lastReport = { conflicts: [], duplicated: false, checkedAt: 0 };
// 归一化：去空白/换行后比较，避免格式差异导致的漏判
function normalize(s) {
    return s.replace(/\s+/g, '').trim();
}
function isSameText(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    if (na.length === 0 || nb.length === 0)
        return false;
    // 精确相同，或一方完全包含另一方（同一份内容常见截断差异）
    return na === nb || na.includes(nb) || nb.includes(na);
}
// 从事件流提取一段消息文本
function eventText(data) {
    const content = data?.content;
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
// 是否「真实对话消息」（注入段边界）：真实用户输入，或任何 assistant 输出（正文/思考轮）。
function isBoundary(e) {
    if (e.type === 'assistant/message' || e.type === 'assistant/chunk')
        return true;
    if (e.type === 'user/message') {
        const kind = e.data?.source?.kind;
        return kind !== 'plugin';
    }
    // 其它事件类型（step/start、request/header、session/title…）不是对话消息，不打断注入段
    return false;
}
// 执行重复注入检测。agent 提供会话事件流（agent.session.events）。
export function scanWorldbookConflicts(agent) {
    const events = agent.session.events;
    if (!Array.isArray(events)) {
        lastReport = { conflicts: [], duplicated: false, checkedAt: Date.now() };
        return lastReport;
    }
    // 找到事件流中最后一个已存在的本插件注入消息作为锚点
    // （pre-step 时本次注入尚未 append 进事件流，检测的是最近一次已发生的注入）
    let anchorIndex = -1;
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.type === 'user/message') {
            const src = e.data?.source;
            if (src?.plugin === 'dsh-worldbook') {
                anchorIndex = i;
                break;
            }
        }
    }
    if (anchorIndex < 0) {
        lastReport = { conflicts: [], duplicated: false, checkedAt: Date.now() };
        return lastReport;
    }
    const anchorText = eventText(events[anchorIndex].data);
    const conflicts = new Map();
    let duplicated = false;
    // 向前扫描：直到段边界
    for (let i = anchorIndex - 1; i >= 0; i--) {
        const e = events[i];
        if (isBoundary(e))
            break;
        if (e.type !== 'user/message')
            continue;
        const src = e.data?.source;
        if (src?.kind !== 'plugin' || !src.plugin || src.plugin === 'dsh-worldbook')
            continue;
        const text = eventText(e.data);
        if (isSameText(anchorText, text)) {
            duplicated = true;
            const cur = conflicts.get(src.plugin);
            if (cur)
                cur.count++;
            else
                conflicts.set(src.plugin, { plugin: src.plugin, sample: text.slice(0, 120), count: 1 });
        }
    }
    // 向后扫描：直到段边界
    for (let i = anchorIndex + 1; i < events.length; i++) {
        const e = events[i];
        if (isBoundary(e))
            break;
        if (e.type !== 'user/message')
            continue;
        const src = e.data?.source;
        if (src?.kind !== 'plugin' || !src.plugin || src.plugin === 'dsh-worldbook')
            continue;
        const text = eventText(e.data);
        if (isSameText(anchorText, text)) {
            duplicated = true;
            const cur = conflicts.get(src.plugin);
            if (cur)
                cur.count++;
            else
                conflicts.set(src.plugin, { plugin: src.plugin, sample: text.slice(0, 120), count: 1 });
        }
    }
    lastReport = { conflicts: [...conflicts.values()], duplicated, checkedAt: Date.now() };
    return lastReport;
}
export function lastCompatReport() {
    return lastReport;
}
