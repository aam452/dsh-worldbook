import { resolveBoundBooks, resolveCharacterContext } from '../data/character.js';
import * as setting from '../data/setting.js';
import { WORLDBOOK_SOURCE_KEY } from './protocol.js';
export function resolveSessionBooks(ctx, agent) {
    let source;
    try {
        source = ctx.get(WORLDBOOK_SOURCE_KEY);
    }
    catch {
        source = undefined;
    }
    let sourceBooks;
    if (source && typeof source.readBooks === 'function') {
        try {
            const books = source.readBooks(agent.session.events);
            sourceBooks = Array.isArray(books)
                ? books.filter((b) => !!b && typeof b.name === 'string' && Array.isArray(b.entries))
                : undefined;
        }
        catch {
            sourceBooks = undefined;
        }
    }
    return { sourceBooks, boundBookNames: resolveBoundBooks(ctx, agent.id) };
}
export function resolveSessionInjection(ctx, agent) {
    if (!setting.compatEnabled())
        return { boundBookNames: [] };
    const books = resolveSessionBooks(ctx, agent);
    return {
        character: resolveCharacterContext(ctx, agent.id),
        sourceBooks: books.sourceBooks,
        boundBookNames: books.boundBookNames,
    };
}
