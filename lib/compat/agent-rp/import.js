// 迁移与映射：把 agent-rp 的书导入本库（SQLite），维护 sourceKey ↔ 本库 bookId 映射。
//
// sourceKey 对照 agent-rp 的书 id：
//   - `character:<sourceAttachmentId>`   角色卡内嵌书
//   - `standalone:<sourceAttachmentId>`  import_world_info 工具导入（sourceAttachmentId = 附件 id）
//   - `standalone:library:<importId>`    /rp-world-info-import 命令导入（importId = world-info-<hash>）
//   - `script:<name>`                    Tavern Helper 脚本书（只读领地，不迁移）
//
// 迁移规则（保守，不破坏已有数据）：
//   1. sourceKey 已映射 → 跳过（不重复导入，不覆盖用户后续编辑）。
//   2. 未映射但本库已有同名书 → 复用该书（映射到它的 id，不覆盖内容）。
//   3. 都没有 → 新建一本（enabled=0，由会话活跃/全局启用决定注入）。
//
// 会话活跃书（内存态）：被「本次会话内接管导入」的书，按名进入 worldbook.context.books
// 参与注入（对应当方"会话作用域激活"语义）。
import * as setting from '../../data/setting.js';
import * as worldbook from '../../data/worldbook.js';
import { activeCharacterBook } from './events.js';
import { existsSync, readFileSync, readdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
// 对方宿主级世界书库（~/.dsh/agent-rp/world-info-imports/，内容寻址，world-info-<sha256前32>.json + .name）。
const LIBRARY_ROOT = dshHomePath('agent-rp', 'world-info-imports');
const LIBRARY_ID = /^world-info-[a-f0-9]{32}$/u;
const MAP_KEY = 'agentRpSourceMap';
function loadMap() {
    try {
        const raw = setting.get(MAP_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
}
function saveMap(map) {
    setting.set(MAP_KEY, JSON.stringify(map), 'agent-rp');
}
/** 查询 sourceKey 是否已迁入本库。 */
export function isMigrated(sourceKey) {
    return loadMap()[sourceKey] !== undefined;
}
/** sourceKey → 本库 bookId；未迁移返回 undefined。 */
export function mappedBookId(sourceKey) {
    return loadMap()[sourceKey];
}
/** sourceKey → 本库当前书名（改名后跟随）；未迁移返回 undefined。 */
export function sourceBookName(sourceKey) {
    const bookId = mappedBookId(sourceKey);
    if (bookId === undefined)
        return undefined;
    const row = worldbook.get(bookId);
    return row?.name;
}
/** 手工登记映射（迁移之外的路径，例如角色卡书随卡入库）。 */
export function mapSourceBook(sourceKey, bookId) {
    const map = loadMap();
    map[sourceKey] = bookId;
    saveMap(map);
}
/** 把一本 ST 格式书按 sourceKey 迁入本库，返回本库书 id 与书名。 */
export function ensureSourceBook(sourceKey, book) {
    const existing = mappedBookId(sourceKey);
    if (existing !== undefined) {
        const row = worldbook.get(existing);
        if (row)
            return { bookId: row.id, name: row.name };
    }
    const name = typeof book.name === 'string' && book.name.trim() !== '' ? book.name.trim() : '未命名世界书';
    const sameName = worldbook.findByName(name);
    if (sameName) {
        mapSourceBook(sourceKey, sameName.id);
        return { bookId: sameName.id, name: sameName.name };
    }
    const row = worldbook.create(name, {
        ...(typeof book.description === 'string' ? { description: book.description } : {}),
        ...(book.scan_depth !== undefined && book.scan_depth !== null ? { scanDepth: book.scan_depth } : {}),
    });
    worldbook.replaceEntries(row.id, Array.isArray(book.entries) ? book.entries : []);
    mapSourceBook(sourceKey, row.id);
    return { bookId: row.id, name: row.name };
}
// ── 会话活跃书（本会话内被接管导入的书，按名参与注入） ──
const sessionBooks = new Map();
export function rememberSessionBook(sessionId, name) {
    let set = sessionBooks.get(sessionId);
    if (!set) {
        set = new Set();
        sessionBooks.set(sessionId, set);
    }
    set.add(name);
}
export function sessionActiveBooks(sessionId) {
    return [...(sessionBooks.get(sessionId) ?? [])];
}
export function forgetSession(sessionId) {
    sessionBooks.delete(sessionId);
}
// 角色卡内嵌书迁移：未迁移 → 迁入本库并记为会话活跃，返回本库书名；已迁移 → 返回现名；卡无书 → undefined。
// 迁入后 adapter 会跳过它（isMigrated），由 worldbook.context.books 按名从本库注入 → 卡书绑到本库、可编辑。
export function ensureSessionCardBook(sessionId, events) {
    let card;
    try {
        card = activeCharacterBook(events);
    }
    catch {
        return undefined;
    }
    if (!card)
        return undefined;
    if (isMigrated(card.sourceKey)) {
        return sourceBookName(card.sourceKey);
    }
    const { name } = ensureSourceBook(card.sourceKey, {
        name: card.name,
        entries: card.entries,
        ...(card.description === undefined ? {} : { description: card.description }),
        ...(card.scanDepth === undefined ? {} : { scan_depth: card.scanDepth }),
    });
    rememberSessionBook(sessionId, name);
    return name;
}
/** 读取对方库中的一个世界书源；不存在/无效返回 null。 */
export function readLibraryAsset(importId) {
    if (!LIBRARY_ID.test(importId))
        return null;
    const dataPath = join(LIBRARY_ROOT, `${importId}.json`);
    if (!existsSync(dataPath))
        return null;
    try {
        const bytes = readFileSync(dataPath);
        const json = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/u, '');
        const parsed = worldbook.parseStWorldJson(json);
        const name = parsed.name && parsed.name.trim() !== '' ? parsed.name.trim() : '未命名世界书';
        return {
            importId,
            name,
            book: {
                name,
                entries: parsed.entries,
                ...(parsed.description === undefined ? {} : { description: parsed.description }),
                ...(parsed.scanDepth === undefined ? {} : { scan_depth: parsed.scanDepth }),
            },
        };
    }
    catch {
        return null;
    }
}
/** 扫描对方库中所有尚未迁入本库的书并迁入，返回本次迁入的书名。幂等。 */
export function migrateLibraryShelf() {
    if (!existsSync(LIBRARY_ROOT))
        return [];
    const migrated = [];
    let files;
    try {
        files = readdirSync(LIBRARY_ROOT);
    }
    catch {
        return [];
    }
    for (const filename of files) {
        const match = /^(world-info-[a-f0-9]{32})\.json$/u.exec(filename);
        if (!match)
            continue;
        const importId = match[1];
        const sourceKey = `standalone:library:${importId}`;
        if (isMigrated(sourceKey))
            continue;
        const asset = readLibraryAsset(importId);
        if (!asset)
            continue;
        try {
            const { name } = ensureSourceBook(sourceKey, asset.book);
            migrated.push(name);
        }
        catch {
            // 单文件失败跳过
        }
    }
    return migrated;
}
/** 监听对方库目录，新上传的书自动迁入。目录不存在或平台不支持时返回 null。 */
export function watchLibraryShelf(onChange) {
    if (!existsSync(LIBRARY_ROOT))
        return null;
    try {
        const watcher = watch(LIBRARY_ROOT, () => {
            try {
                const names = migrateLibraryShelf();
                if (names.length > 0)
                    onChange(names);
            }
            catch {
                // 监听回调失败忽略
            }
        });
        return () => watcher.close();
    }
    catch {
        return null;
    }
}
