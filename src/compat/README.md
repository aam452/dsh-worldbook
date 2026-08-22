# 世界书接管协议（Worldbook Takeover Protocol）

> 本文件为临时协议稿，**已并入 `docs/DEVELOPMENT.md` 第七章「世界书接管协议」**。
> 代码实现见 `src/integration/`，以开发文档与实现为准。

**协议版本：0.2**　**状态：草案**

dsh-worldbook（下文简称 **WB**）与宿主插件之间的兼容接口约定。**宿主只需实现以下接口的目标，怎么实现由宿主决定。** 接口达成即视为 WB 无需改动即可接管宿主的世界书功能。

---

## 1. 角色

- **dsh-worldbook（WB）**：世界书插件。负责世界书的注入、存储、管理。
- **Host**：宿主插件。任何提供角色卡 / 会话 / 世界书能力的插件（可多实现方并存）。

## 2. WB 接管什么

| 接管项 | 说明 | 结果 |
|---|---|---|
| **注入** | 世界书内容由 WB 放进会话上下文 | Host 的注入不再生效 |
| **数据** | 世界书存 WB 的存储（或经 `worldbook.source` 取 Host 的） | 单一份数据源 |
| **管理** | AI / 用户对世界书的增删改、启停 | 实际操作落在 WB 侧 |
| **操作调用** | Host 脚本 / 能力对世界书的读写调用 | 走 WB 暴露的操作接口 |
| **角色过滤** | 条目级角色过滤（characterFilter） | 用 Host 提供的角色上下文 |

## 3. 总体约定

1. 接口均为 DSH 服务键：`ctx.provide(key, impl)` 提供、`ctx.get(key)` 读取。
2. Host 检测到 `worldbook.engine` 存在且 `active === true`，即视为世界书已被 WB 接管，**停止自己的注入**（数据保留不动）。
3. **跨边界引用一律用书名**，不用 id / 路径。
4. 世界书数据统一 **SillyTavern 世界书格式**。类型名：`Worldbook`（书）、`WorldbookEntry`（条目），字段名即 ST 字段名（`key`、`keysecondary`、`order`、`disable`、`content` 等）。

## 4. 接口

### 4.1 `worldbook.engine` —— 接管声明

```ts
interface WorldbookEngine {
  active: boolean
  /** 可选：Host 不再解析自己的世界书，直接向 WB 要书。 */
  getBooks?(events: readonly SessionEvent[]): Worldbook[]
}
```

- **WB 提供**：接管时 `ctx.provide('worldbook.engine', { active: true })`。
- **Host**：在世界书注入入口检查，`active` 即让位。
- **目标**：Host 注入彻底失效（新会话 / 旧会话 / 种子 / 脚本新建书一并覆盖）。

### 4.2 `worldbook.context` —— 会话上下文

```ts
interface WorldbookContext {
  /** 当前会话的绑定信息：角色 + 生效的书（按名）。 */
  get(sessionId: string): {
    character?: { name?: string; tags?: string[] }
    books?: string[]            // 绑定到本会话的书名
  }
}
```

- **谁持有会话 / 角色生态谁提供**（通常 Host）；WB 消费。
- **目标**：让 WB 知道当前角色（用于 characterFilter）和本会话生效哪些书。

### 4.3 `worldbook.source` —— 世界书数据源

```ts
interface WorldbookSource {
  /** 本会话作用域内的世界书（全局 + 聊天 + 角色绑定），ST 格式。 */
  readBooks(events: readonly SessionEvent[]): Worldbook[]
}
```

- **Host 提供 / WB 读取**（可选）。
- **目标**：Host 把"如果还在注入，会注入哪些书"原样给出；WB 优先用它，不解析 Host 私有格式。
- 未提供时：WB 用自己的存储 + 自建只读适配器。

### 4.4 `worldbook.operations` —— 世界书操作

```ts
interface WorldbookOperations {
  listBooks(): WorldbookBookSummary[]          // { name, entryCount, enabled }
  getBook(name: string): Worldbook
  createBook(book: Worldbook): void
  updateBook(name: string, book: Worldbook): void
  deleteBook(name: string): void
  updateEntry(bookName: string, entryIndex: number, entry: Partial<WorldbookEntry>): void
  toggleEntry(bookName: string, entryIndex: number, enabled?: boolean): void
  setBookEnabled(name: string, enabled: boolean): void
}
```

- **WB 提供**：实现背后是 WB 的存储。WB 自身有三套操作入口，本接口是**第三套**：
  1. 自己的 UI / REST（用户操作）
  2. AI 工具（`worldbook_edit` 等，AI 操作）
  3. `worldbook.operations` 服务键（**别的插件**操作 WB，本协议）
  三者共用同一 data 层（data/worldbook.ts），本接口只是把它包成服务键，并把协议的书名 / 条目标识映射到 data 层的 id。
- **Host 消费**：Host 的**管理界面 / 命令**和**脚本 / AI 能力**对世界书的一切读写，都通过本接口完成。
- **目标**：Host 侧"世界书操作"能力不因接管而失效——它能用本接口做想做的事（具体操作什么、怎么操作，WB 不管）。
- 暴露与否由设置项控制（见 §6）。

## 5. 对接方式（握手）

WB 每次会话注入前：

1. `ctx.get('worldbook.engine')` 是否接管？
2. 探测 Host 实现了哪些键（`worldbook.context` / `worldbook.source` / `worldbook.operations`）。
3. 有接管 → 标准路径：取书顺序 `source` → WB 存储；角色 / 绑定来自 `context`；管理 / 脚本走 `operations`。
4. 无接管 → 降级路径（只读适配 + 拦截，脆且有漏点）。

## 6. 设置项（dsh-worldbook 侧）

| 设置 | 说明 | 默认 |
|---|---|---|
| 兼容宿主插件（总开关） | 开启才接管 | 关 |
| 向宿主暴露世界书操作接口 | 决定是否 `provide('worldbook.operations')` 供 Host 脚本 / 能力调用 | 关 |

## 7. Host 实现要求

- 黑盒：**只需达成接口目标**，实现细节、数据结构、存储方式一律由 Host 自定。
- 唯一硬性要求：把自己世界书的**注入入口收拢**到 `worldbook.engine` 能检查的位置。

## 8. WB 侧实现清单（通用实现，已落地 `src/integration/`）

| 项 | 内容 | 状态 |
|---|---|---|
| 设置项 | `compatEnabled`（兼容宿主总开关）、`exposeOperations`（暴露操作接口） | ✅ `src/data/setting.ts` |
| `worldbook.engine` 提供 | 兼容开启时 `provide('worldbook.engine', { active })`，active 实时反映 `compatEnabled` | ✅ `src/integration/engine.ts` |
| `worldbook.context` 消费（character） | `resolveCharacterContext` 已接 characterFilter | ✅ `src/data/character.ts` |
| `worldbook.context` 消费（books） | 注入引擎把 `context.books`（按名查 WB 库）与全局书合并注入 | ✅ `src/integration/source.ts` + `src/context/worldbook.ts` |
| `worldbook.source` 消费 | 探测 `ctx.get('worldbook.source')`，有则优先取书；无则回退 WB 库 | ✅ `src/integration/source.ts` |
| `worldbook.operations` 提供 | 服务键壳 + 按书名 / 条目标引→id 映射（底层 data 层共用） | ✅ `src/integration/operations.ts`（`exposeOperations` 控制，可运行时同步） |
| 装配与握手 | 探测 Host 键、按开关挂载、走 §5 握手 | ✅ `src/integration/index.ts` |
| 注入管线改造 | 取书来源扩展为「source → context.books 按名 → 全局书」三级 | ✅ `src/context/worldbook.ts` `buildInjectionBooks` |
| 测试 | 服务键冒烟、注入合并、operations CRUD 往返 | ✅ `scripts/worldbook-compat-smoke.mjs`（35 项） |

> 具体宿主的适配（如 dsh-agent-rp 的事件解析 / 命令影子 / 工具拦截）：见 `src/compat/agent-rp/README.md`。
