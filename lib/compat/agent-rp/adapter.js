// worldbook.source 提供方：把 agent-rp 会话事件里「仍该由本引擎注入的书」以 ST 格式交出去。
//
// 只读适配，不写任何对方数据。组装逻辑见 events.ts（对齐 agent-rp 的
// readSessionLorebookSourcesFromEvents + activeTavernWorldbooks）。
//
// 迁移边界：
//   - `script:*` 书（Tavern Helper 脚本领地）永远从事件读（读侧尊重，不迁不建）。
//   - `character:*` / `standalone:*` 书已迁入本库 → 跳过（由本库经 context.books/全局注入），
//     未迁移 → 原样从事件交给注入引擎（延续旧会话 / 卡书直读）。
import { WORLDBOOK_SOURCE_KEY } from '../../integration/protocol.js';
import { assembleSessionBooks } from './events.js';
import { isMigrated } from './import.js';
export function applyAgentRpSource(ctx) {
    return ctx.provide(WORLDBOOK_SOURCE_KEY, createAgentRpSource());
}
export function createAgentRpSource() {
    return {
        readBooks(events) {
            return assembleSessionBooks(events)
                .filter(book => book.sourceKey.startsWith('script:') || !isMigrated(book.sourceKey))
                .map(book => toWorldbook(book));
        },
    };
}
function toWorldbook(book) {
    const out = { name: book.name, entries: book.entries.map(entry => ({ ...entry })) };
    if (book.description !== undefined)
        out.description = book.description;
    if (book.scanDepth !== undefined)
        out.scan_depth = book.scanDepth;
    return out;
}
