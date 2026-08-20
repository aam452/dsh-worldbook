// JSON 列读写辅助（从 MindLink 项目移植，仅保留世界书所需函数）
export function parseJson(text, fallback) {
    if (text === null || text === undefined || text === '')
        return fallback;
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
}
export function toJson(value) {
    return JSON.stringify(value);
}
