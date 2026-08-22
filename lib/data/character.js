// 角色卡绑定兼容层（仅逻辑对齐，无角色卡实体）。
//
// 本插件没有角色卡。为兼容其它 DSH ST 插件（带角色卡的），世界书条目支持 ST 的
// characterFilter 语义：条目可声明 `characterFilter: { isExclude, names, tags }`，
// 注入时按「当前角色」过滤（对齐 ST world-info.js 4704-4731）。
//
// 「当前角色」由其它插件提供：它们按兼容协议（见 docs/DEVELOPMENT.md 世界书接管协议）注册
// worldbook.context 提供方（经 ctx.get 读取），每次会话给出当前角色 { name, tags }。
// 本插件不创建角色卡实体，只消费该上下文。
// 兼容协议服务键（src/compat/README.md §4.2）。
export const CONTEXT_PROVIDER_KEY = 'worldbook.context';
// 解析当前角色上下文：没有提供方或拿不到角色时返回 undefined（此时不做角色过滤）。
export function resolveCharacterContext(ctx, sessionId) {
    return resolveWorldbookContext(ctx, sessionId)?.character;
}
// 解析完整会话上下文（角色 + 绑定书）：没有提供方时返回 undefined。
export function resolveWorldbookContext(ctx, sessionId) {
    let provider;
    try {
        provider = ctx.get(CONTEXT_PROVIDER_KEY);
    }
    catch {
        provider = undefined;
    }
    if (!provider || typeof provider.get !== 'function')
        return undefined;
    try {
        return provider.get(sessionId);
    }
    catch {
        return undefined;
    }
}
// 本会话绑定的书名列表（worldbook.context.books）；无提供方或未声明时为空。
export function resolveBoundBooks(ctx, sessionId) {
    const context = resolveWorldbookContext(ctx, sessionId);
    return Array.isArray(context?.books) ? context.books.filter((x) => typeof x === 'string') : [];
}
