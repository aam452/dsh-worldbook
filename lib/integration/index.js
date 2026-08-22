import { applyEngine } from './engine.js';
import { syncOperations } from './operations.js';
// 通用兼容装配（世界书接管协议，见 docs/DEVELOPMENT.md）：
// - worldbook.engine：接管声明，active 实时反映 compatEnabled
// - worldbook.operations：向宿主暴露的操作接口，由 exposeOperations 控制（可在运行时同步）
// worldbook.context / worldbook.source 由消费方（context/inject.ts → resolveSessionInjection）读取。
export function applyIntegration(ctx) {
    applyEngine(ctx);
    syncOperations(ctx);
}
