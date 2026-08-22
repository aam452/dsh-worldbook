// 世界书接管协议（见 docs/DEVELOPMENT.md）：服务键常量与跨边界类型。
// 通用实现，不绑定任何具体宿主插件。
// 约定：跨边界书引用一律用书名；数据使用 ST World Info 对齐的规范化 profile。
export const WORLDBOOK_ENGINE_KEY = 'worldbook.engine';
export const WORLDBOOK_CONTEXT_KEY = 'worldbook.context';
export const WORLDBOOK_SOURCE_KEY = 'worldbook.source';
export const WORLDBOOK_OPERATIONS_KEY = 'worldbook.operations';
export const WORLDBOOK_CHARACTER_BOOKS_KEY = 'worldbook.character-books';
export class WorldbookProtocolError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'WorldbookProtocolError';
        this.code = code;
    }
}
