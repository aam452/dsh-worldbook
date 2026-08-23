import { getDb, now, uuid } from '../db/index.js';
export function get(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key=? AND is_deleted=0 LIMIT 1').get(key);
    return row?.value;
}
export function getAll() {
    const rows = getDb().prepare('SELECT key, value FROM settings WHERE is_deleted=0').all();
    const out = {};
    for (const row of rows)
        out[row.key] = row.value;
    return out;
}
export function set(key, value, category = 'general') {
    const db = getDb();
    const t = now();
    const existing = db.prepare('SELECT id FROM settings WHERE key=? AND is_deleted=0').get(key);
    if (existing) {
        db.prepare('UPDATE settings SET value=?, category=?, updated_at=?, updated_by=? WHERE id=?').run(value, category, t, 'user', existing.id);
    }
    else {
        db.prepare('INSERT INTO settings (id, key, value, category, created_at, updated_at, created_by, updated_by, is_deleted, deleted_at) VALUES (?,?,?,?,?,?,?,?,0,NULL)')
            .run(uuid(), key, value, category, t, t, 'user', 'user');
    }
}
export const defaultSettings = () => ({
    enabled: true,
    workspaceMode: 'all',
    workspaceIds: [],
    theme: 'dsh',
    injectMode: 'per-turn',
    devMode: false,
    devFloating: false,
    devAction: 'create',
    devBookId: '',
    devEntryIds: [],
    devPerms: ['create', 'delete', 'update', 'read'],
    compatEnabled: false,
    exposeOperations: false,
    agentRpCompat: false,
    agentRpDebug: false,
});
export function settings() {
    return {
        enabled: enabled(),
        workspaceMode: workspaceMode(),
        workspaceIds: workspaceIds(),
        theme: theme() === 'pink' ? 'pink' : 'dsh',
        injectMode: injectMode(),
        devMode: devMode(),
        devFloating: devFloating(),
        devAction: devAction(),
        devBookId: devBookId(),
        devEntryIds: devEntryIds(),
        devPerms: devPerms(),
        compatEnabled: compatEnabled(),
        exposeOperations: get('exposeOperations') === 'true',
        agentRpCompat: get('agentRpCompat') === 'true',
        agentRpDebug: get('agentRpDebug') === 'true',
    };
}
export function saveSettings(input) {
    const next = {
        ...defaultSettings(),
        ...input,
        workspaceMode: input.workspaceMode === 'selected' ? 'selected' : 'all',
        workspaceIds: Array.from(new Set(input.workspaceIds.filter((x) => typeof x === 'string'))),
        injectMode: input.injectMode === 'every-step' ? 'every-step' : 'per-turn',
        devAction: input.devAction === 'edit' ? 'edit' : input.devAction === 'global' ? 'global' : 'create',
        devEntryIds: Array.from(new Set(input.devEntryIds.filter((x) => typeof x === 'string'))),
        devPerms: Array.from(new Set(input.devPerms.filter((x) => ALL_PERMS.includes(x)))),
    };
    const db = getDb();
    db.exec('BEGIN');
    try {
        setEnabled(next.enabled);
        setWorkspaceScope(next.workspaceMode, next.workspaceIds);
        setTheme(next.theme);
        setInjectMode(next.injectMode);
        setDevMode(next.devMode);
        setDevFloating(next.devFloating);
        setDevAction(next.devAction);
        setDevBookId(next.devBookId);
        setDevEntryIds(next.devEntryIds);
        setDevPerms(next.devPerms);
        setCompatEnabled(next.compatEnabled);
        setExposeOperations(next.exposeOperations);
        setAgentRpCompat(next.agentRpCompat);
        setAgentRpDebug(next.agentRpDebug);
        db.exec('COMMIT');
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    return settings();
}
export function injectMode() {
    return get('injectMode') === 'every-step' ? 'every-step' : 'per-turn';
}
export function setInjectMode(value) {
    set('injectMode', value === 'every-step' ? 'every-step' : 'per-turn', 'general');
}
// 抑制其它世界书插件注入：开启后，注入引擎在每轮把「其它插件（非 dsh-worldbook）的 instructions 注入消息」过滤掉，
// 避免与 prompt-manager / LorebookMD 等世界书插件重复注入。
export function suppressOtherWorldbook() {
    return get('suppressOtherWorldbook') === 'true';
}
export function setSuppressOtherWorldbook(value) {
    set('suppressOtherWorldbook', value ? 'true' : 'false', 'general');
}
// ── 插件启用开关 ──
export function enabled() {
    return get('enabled') !== 'false';
}
export function setEnabled(value) {
    set('enabled', value ? 'true' : 'false', 'general');
}
// ── 主题 ──
// 'dsh' = 跟随 dsh 主题（默认）；'pink' = 独立粉色主题
export function theme() {
    return get('theme') ?? 'dsh';
}
export function setTheme(value) {
    set('theme', value === 'pink' ? 'pink' : 'dsh', 'theme');
}
// ── 开发世界书模式 ──
// 开启后暴露 worldbook 编辑工具给 AI（AI 可直接写 ST 格式世界书）。
export function devMode() {
    return get('devMode') === 'true';
}
export function setDevMode(value) {
    set('devMode', value ? 'true' : 'false', 'general');
}
export function devFloating() {
    return get('devFloating') === 'true';
}
export function setDevFloating(value) {
    set('devFloating', value ? 'true' : 'false', 'general');
}
// 开发模式动作：create=新建（AI 可新建世界书并编辑全部条目）；edit=编辑（AI 编辑指定世界书的指定条目）
export function devAction() {
    const raw = get('devAction');
    if (raw === 'edit')
        return 'edit';
    if (raw === 'global')
        return 'global';
    return 'create';
}
export function setDevAction(value) {
    set('devAction', value, 'general');
}
export function devBookId() {
    return get('devBookId') ?? '';
}
export function setDevBookId(value) {
    set('devBookId', value, 'general');
}
export function devEntryIds() {
    try {
        const raw = get('devEntryIds');
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    }
    catch {
        return [];
    }
}
export function setDevEntryIds(value) {
    set('devEntryIds', JSON.stringify(Array.from(new Set(value))), 'general');
}
const ALL_PERMS = ['create', 'delete', 'update', 'read'];
export function devPerms() {
    try {
        const raw = get('devPerms');
        if (!raw)
            return ALL_PERMS;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => ALL_PERMS.includes(x)) : ALL_PERMS;
    }
    catch {
        return ALL_PERMS;
    }
}
export function setDevPerms(value) {
    const allowed = ['create', 'delete', 'update', 'read'];
    set('devPerms', JSON.stringify(Array.from(new Set(value)).filter((x) => allowed.includes(x))), 'general');
}
// ── 兼容宿主插件（世界书接管协议，见 docs/DEVELOPMENT.md）──
// 开启后：provide worldbook.engine（声明接管）、消费 worldbook.context / worldbook.source。
export function compatEnabled() {
    return get('compatEnabled') === 'true';
}
export function setCompatEnabled(value) {
    set('compatEnabled', value ? 'true' : 'false', 'general');
}
// 向宿主暴露世界书操作接口：决定是否 provide('worldbook.operations') 供 Host 脚本/能力调用。
export function exposeOperations() {
    return compatEnabled() && get('exposeOperations') === 'true';
}
export function setExposeOperations(value) {
    set('exposeOperations', value ? 'true' : 'false', 'general');
}
// 兼容 dsh-agent-rp：本模块开关（通用 compatEnabled 是总闸门，本开关决定 agent-rp 适配是否挂载）。
export function agentRpCompat() {
    return compatEnabled() && get('agentRpCompat') === 'true';
}
export function setAgentRpCompat(value) {
    set('agentRpCompat', value ? 'true' : 'false', 'general');
}
// agent-rp 兼容调试：打开后在控制台实时打印每个 agent-rp 会话本插件看到/注入了什么（角色/绑定书/source 书）。
export function agentRpDebug() {
    return compatEnabled() && get('agentRpDebug') === 'true';
}
export function setAgentRpDebug(value) {
    set('agentRpDebug', value ? 'true' : 'false', 'general');
}
export function workspaceMode() {
    return get('workspaceMode') === 'selected' ? 'selected' : 'all';
}
export function workspaceIds() {
    try {
        const raw = get('workspaceIds');
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    }
    catch {
        return [];
    }
}
export function setWorkspaceScope(mode, ids) {
    set('workspaceMode', mode, 'general');
    set('workspaceIds', JSON.stringify(Array.from(new Set(ids))), 'general');
}
// ── 新建模式下 AI 新建的世界书白名单（持久化，Survives plugin re-registration & session restarts) ──
const DEV_CREATED_BOOKS_KEY = 'devCreatedBookIds';
export function devCreatedBooks() {
    try {
        const raw = get(DEV_CREATED_BOOKS_KEY);
        if (!raw)
            return new Set();
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
    }
    catch {
        return new Set();
    }
}
export function addDevCreatedBook(bookId) {
    const books = devCreatedBooks();
    books.add(bookId);
    set(DEV_CREATED_BOOKS_KEY, JSON.stringify([...books]), 'dev');
}
export function removeDevCreatedBook(bookId) {
    const books = devCreatedBooks();
    books.delete(bookId);
    set(DEV_CREATED_BOOKS_KEY, JSON.stringify([...books]), 'dev');
}
// ── 判定：给定当前所在工作区 id，插件是否在该工作区生效。 ──
// 规则：总开关关闭 → 全局失效；开启后按 全部/指定 工作区过滤。
export function isActive(workspaceId) {
    if (!enabled())
        return false;
    const mode = workspaceMode();
    if (mode === 'all')
        return true;
    return workspaceId !== undefined && workspaceIds().includes(workspaceId);
}
