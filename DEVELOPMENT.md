# dsh-worldbook 开发文档

DSH 世界书插件：SillyTavern 世界书（World Info）全语义实现——关键词触发、递归、sticky/cooldown/delay、选择性、组互斥、概率、深度、自定义排序。

本文档面向两类读者：
- **二次开发者**：想给世界书插件加功能、改注入逻辑、扩展数据模型。
- **集成方**：想把自己插件的某个位置（悬浮窗、设置页、自定义面板）与 dsh-worldbook 打通，复用世界书的管理页面，或直接用它的注入能力。

## 一、架构总览

dsh-worldbook 是标准 DSH 双半插件，数据走 host 半，UI 走 client 半：

```
┌─ host 半（Node）──────────────────────────────┐
│  src/index.ts      插件入口（apply）           │
│  src/db/           SQLite 独立库 worldbook.db │
│  src/data/         数据层（CRUD / ST 导入导出）│
│  src/context/      注入引擎（递归/sticky 等）  │
│  src/rest/         /api/worldbook REST         │
└───────────────────────────────────────────────┘
┌─ client 半（浏览器）───────────────────────────┐
│  src/client/client.ts       插件入口 + 槽位注册 │
│  src/client/worldbook-page.tsx  世界书管理 UI   │
│  src/client/api.ts          /api/worldbook 封装 │
│  src/client/theme.css       独立主题样式        │
└───────────────────────────────────────────────┘
```

两半通过 dsh 的 `webServer` 数据通道通信（REST，同源 fetch）。

**依赖注入**：
- Host 半：`inject: ['webServer']`（REST 挂载）
- Client 半：`inject: ['slots', 'workspaces', 'locale']`（UI 槽位注册 / 工作区作用域 / 界面文案翻译）

## 二、构建与测试

```bash
npm install
npm run build        # host 半 tsc + 资产拷贝 + client 半 esbuild
npm run build:host   # 仅 host 半
npm run typecheck    # 双端类型检查
npm run test:worldbook  # 核心逻辑冒烟测试（先 build:host）
```

产物：`lib/index.js`（host）、`lib/client.js`（client，含 `__ModuleLoader__` 包装与内联样式）。

## 三、数据层（二次开发核心）

入口 `src/data/worldbook.ts`，全部通过 `src/db/index.ts` 的 `openDb(dataDir)` / `getDb()` 访问独立 SQLite 库。

### 3.1 数据模型

| 表 | 说明 |
| --- | --- |
| `worldbooks` | 世界书本（name/description/enabled/scan_depth/extensions） |
| `worldbook_entries` | 条目，对齐 ST `newWorldInfoEntryDefinition` 核心字段；ST 高级字段（role/triggers 等）存入 `raw` JSON 保留、导出还原 |
| `worldbook_timed_effects` | sticky/cooldown 跨轮状态（start/end 以「模型可见消息数」为时间游标，对齐 ST `chat.length`） |
| `settings` | 插件启用开关 + 工作区作用域 |

### 3.2 常用 API

- **世界书本**：`list()` / `listEnabled()` / `get(id)` / `create(name, opts)` / `update(id, patch)` / `setEnabled(id, bool)` / `remove(id)`
- **条目**：`entries(bookId)` / `getEntry(bookId, entryId)` / `addEntry(bookId, patch)` / `updateEntry(bookId, entryId, patch)` / `removeEntry(bookId, entryId)` / `reorderEntries(bookId, orderedIds)`（重写 `displayIndex`）
- **ST 导入导出**：`parseStWorldJson(json)` → `{ name, scanDepth, entries }`；`toStWorldJson(bookId)` → ST 兼容 JSON（含 `extensions.display_index`）
- **归一化**：`normalizeEntry(src)` 把前端/ST 字段规范化为 `NormalizedEntry`（字段名即 ST 名称）；`toEntryView(row)` 读库行 → 视图对象

### 3.3 字段命名约定（ST 唯一命名规范）

全链路（DB 列 / View / REST / 工具 schema / 客户端 UI / ST JSON）统一使用 SillyTavern 编辑器内部字段名，**无映射层**：

| 字段 | 说明 |
| --- | --- |
| `key` / `keysecondary` | 主/副触发关键词（数组） |
| `order` | 注入优先级（SQL 保留字，SQL 中写 `"order"`） |
| `disable` | 是否禁用（ST 语义，`true`=禁用） |
| `selectiveLogic` | 选择性逻辑 0-3 |
| `caseSensitive` / `matchWholeWords` | 三态（null=用全局） |
| `scanDepth` / `excludeRecursion` / `preventRecursion` / `useProbability` | 扫描/递归/概率 |
| `displayIndex` | 自定义排序序数（导出到 `extensions.display_index`） |
| `probability` / `depth` / `sticky` / `cooldown` / `delay` / `position` | 基础语义 |

`enabled` 仅用于世界书本级（`worldbooks.enabled`，插件自身概念，非 ST 条目字段）；条目禁用一律用 `disable`。

### 3.4 新增一个条目字段

1. `schema.sql` 加列（或用 `db/index.ts` 的 `migrate` 里 `addCol`/`renameCol` 补老库）。
2. `WorldbookEntryRow`（接口）+ `normalizeEntry`（读写映射）+ `toEntryView`（输出视图）三处同步。
3. 若需跨轮状态，参照 `worldbook_timed_effects` 模式加表 + `getTimedEffects/setTimedEffect/pruneTimedEffects/clearTimedEffects`。

## 四、注入引擎（二次开发核心）

入口 `src/context/worldbook.ts` + `src/context/inject.ts`。

### 4.1 引擎签名

```ts
renderWorldbookInjection(
  messageLines: string[],                       // 本次扫描的文本行（深度截断后的最近消息）
  opts: {
    depth?: number
    cursor?: number                             // 时间游标（sticky/cooldown/delay）
    character?: CharacterContext                // 当前角色（worldbook.context.character，见第七章）
    sourceBooks?: Worldbook[]                   // 宿主提供的书（worldbook.source，ST 格式）
    boundBookNames?: string[]                   // 绑定到本会话的书名（worldbook.context.books）
  } = {},
): InjectedWorldEntry[]
```

- `cursor` 语义对齐 ST `chat.length`：只随真实对话消息（直接用户消息 + assistant 消息）推进，排除插件注入消息与系统快照。
- `matchLinesFromMessages(messages)` 从 dsh 消息数组提取文本行，供引擎扫描。
- 取书顺序：`sourceBooks` → `boundBookNames` 按名查本库 → 全局启用书，同级去重（source 优先于同名本库书）。

### 4.2 已实现语义（对齐 ST world-info.js）

| 特性 | 说明 |
| --- | --- |
| 关键词触发 | 主键 key + 副键 keysecondary，支持大小写/整词/正则 |
| 选择性 | selectiveLogic 1=NOT_ALL / 2=NOT_ANY / 3=AND_ALL |
| 深度 | scanDepth 扫描最近 N 条消息（<=0 全扫） |
| 递归 | 命中 content 入 buffer → 递归轮扫描；MAX_RECURSION=5 |
| excludeRecursion | 递归轮跳过该条目 |
| preventRecursion | 命中但 content 不进 buffer |
| delayUntilRecursion | 非递归轮跳过，第 N 层递归激活 |
| sticky | 命中后 N 条消息内无条件强制注入 |
| cooldown | 命中后 N 条消息内再命中不注入 |
| delay | cursor < delay 时强制注入 |
| 概率 | useProbability + probability 百分比 |
| 组互斥 | 同组按 order 胜出 |
| 排序 | 注入按 order 降序；展示用 displayIndex |
| 角色卡绑定 | 条目 `characterFilter` 按「当前角色」过滤；绑定书按名注入（兼容层，见第七章） |



### 4.3 自定义注入场景

不想用内置 `agent/pre-step` 接入时，可直接调用 `renderWorldbookInjection`：

```ts
import { renderWorldbookInjection, matchLinesFromMessages } from 'dsh-worldbook'
import { openDb } from 'dsh-worldbook/db'

openDb(dataDir)  // 初始化（也可交给插件 apply 统一初始化）

// 在任意时机：
const world = renderWorldbookInjection(textLines, {
  cursor,
  character,              // { name, tags } 可选——传入时按条目 characterFilter 过滤（见第七章）
  sourceBooks,            // 宿主 worldbook.source 的书（ST 格式），可选
  boundBookNames,         // 绑定到本会话的书名，可选
})
// world: InjectedWorldEntry[]，取 .content 拼装进你的请求
```

兼容开关（`compatEnabled`）是**双模式闸门**：开启后插件才进入「全局 + 角色卡绑定」双模式并消费宿主数据；关闭时纯全局单模式。组装一轮注入的兼容上下文统一走 `resolveSessionInjection(ctx, agent)`（见第七章）。

## 五、REST API

前缀 `/api/worldbook`，全部返回 `{ success, data }` 或 `{ success, message }`。

### 世界书

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/worldbooks` | 列表（含条目数） |
| POST | `/worldbooks` | 新建 `{ name, description? }` |
| PUT | `/worldbooks/:id` | 更新 `{ name?\|description?\|enabled?\|scanDepth? }` |
| DELETE | `/worldbooks/:id` | 删除 |
| POST | `/worldbooks/:id/import` | 导入 ST JSON `{ json }`（覆盖全部条目） |
| GET | `/worldbooks/:id/export` | 导出 ST JSON `{ name, json }` |

### 条目

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/worldbooks/:id/entries?q=&sort=&order=&page=&pageSize=` | 分页/搜索/排序 |
| POST | `/worldbooks/:id/entries` | 新增 `{ entry? }` |
| PUT | `/worldbooks/:id/entries/:eid` | 更新（整条字段） |
| DELETE | `/worldbooks/:id/entries/:eid` | 删除 |
| PUT | `/worldbooks/:id/entries/reorder` | `{ orderedIds }` 重写 displayIndex |

### 设置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/settings` | `{ enabled, workspaceMode, workspaceIds, theme, injectMode, devMode, devAction, devBookId, devEntryIds, devPerms, compatEnabled, exposeOperations }` |
| PUT | `/settings` | 更新 `{ enabled?\|workspaceMode?\|workspaceIds?\|theme?\|injectMode?\|devMode?\|devAction?\|devBookId?\|devEntryIds?\|devPerms?\|compatEnabled?\|exposeOperations? }`（兼容/操作接口开关变化时即时同步服务注册） |

## 六、槽位契约（ui内嵌指南）

本插件提供**两处可集成的 UI**：世界书管理页与插件设置卡片。管理页由 `nav` 一个槽承载，宿主自行决定挂到悬浮窗还是设置页；设置卡片是独立一个槽。

### 6.1 本插件声明的槽位

| 槽位 | kind | scope | 说明 |
| --- | --- | --- | --- |
| `settings.section`（id: `worldbook`） | list | root | 插件**独立存在**时，世界书管理页出现在 dsh 设置侧边栏 |
| `mindlink.worldbook.nav` | single | root | 世界书管理页（完整页面，含列表、新建、导入导出、编辑）；宿主自行决定挂到悬浮窗还是设置页 |
| `mindlink.worldbook.settings-card` | single | root | 插件设置卡片（启用开关、作用域、主题、注入时机、开发模式；内嵌、就地修改不弹窗） |
| `worldbook.host.present` | single | root | **宿主在线握手**：宿主集成后注册，通知本插件隐藏 dsh 设置分区 |

所有自定义槽由本插件在 `shell.overlay`（list/root，additive）注册时通过 `children` 声明，**常驻不注销**——保证它们不随 `settings.section` 的动态注销而塌缩。`shell.overlay` 的 SlotMap 类型由官方 `dsh-client-ui-layout` 声明；本地类型检查时若未安装该包，需在 `src/client/slots.ts` 里按运行时 slot-catalog（list/root）补全声明（见该文件内注释）。

**界面文案与 locale**：自定义槽的 `label`（dsh 设置侧边栏「世界书」分区标题）通过 `ctx.locale` 读取，随 dsh 语言切换动态更新（中文「世界书」/ 英文「World Book」）。词典注册在 `src/client/client.ts` 的 `ctx.effect(() => ctx.locale.register(...))`，命名空间 `dsh.worldbook`（key 声明见 `src/client/slots.ts` 的 `LocaleNamespaceMap`）。若 `dsh-client-locale` 未安装到本地 node_modules，其类型由 `slots.ts` 补全声明，仅用于本地类型检查，运行时仍由 dsh 提供。

### 6.2 宿主在线握手（重要）

`settings.section` 按需注册：
- 检测到 `worldbook.host.present` 有条目（宿主在线）→ 注销 `settings.section`，世界书 UI 只在宿主位置，dsh 设置无重复分区。
- 宿主停用（dsh 插件级停用，client 半不加载）→ `worldbook.host.present` 无条目 → 恢复 `settings.section`。

集成方只需：集成本插件 UI 时，注册到 `worldbook.host.present`（注册返回的 disposer 在停用时调用即可）。本插件据此决定是否保留自己的 dsh 设置分区。

### 6.3 集成方对接

对接分四步，全部走 dsh 的 `slots` 服务：

1. **订阅槽**：监听 `mindlink.worldbook.nav` 与 `mindlink.worldbook.settings-card` 是否有注册条目，本插件加载/卸载时同步（用 `slots.subscribe(key, sync)`，并在 `ctx.effect` 内注销）。
2. **读取组件**：从对应槽的条目里取出 `component` 引用；没有条目说明世界书插件未安装或未加载。
3. **渲染**：用 React 把组件渲染到你的位置；同时注册 `worldbook.host.present`（`slots.register({ name: 'worldbook.host.present', priority: 0 }, () => null)`）完成握手。
4. **卸载**：组件卸载时，注销订阅返回的 disposer 与握手注册返回的 disposer（放在同一个 `ctx.effect` 里随 fiber 清理）。

要点：
- 管理页由 `nav` 一个槽承载，**只挂载一个位置**（悬浮窗或设置页任选）；设置卡片（`settings-card`）单独挂载到设置页。
- 本插件对 `shell.overlay`、`nav`、`settings-card` 的注册均用 `slots.inject(key, () => slots.register(...))` 包裹——先等目标槽声明建立再注册，声明折叠时级联清理；对接方若也向 `shell.overlay` 注册，建议同样用 `inject` 包裹。
- 未读到条目时可按需回退到你自己的兜底界面。
- 若宿主不需要本插件 UI，可只用 REST API 或 `renderWorldbookInjection`（见第三/四/五章），完全脱离槽位。

**关于 React 依赖（重要）**：dsh 官方前端本身就是 React（`@deepseek-ai/dsh-client-web-react` 直接依赖 `react@^18.2.0`），整个 slot / 组件渲染 / 状态桥都是 React 技术栈。本插件的 `lib/client.js` 只 externalize 了一个 `require("react")`（经 `__ModuleLoader__` 包装），运行时由 dsh 的 Web ModuleLoader 共享模块表解析——**react 是 dsh 生态共享的，宿主/集成方对接本插件 UI 时无需单独安装 react**。只有用 TypeScript 编写并 import 本插件组件/类型时，编译期才需要在 `devDependencies` 装 `react` + `@types/react` 做类型检查，不会进入最终 bundle。

硬性约束与常见问题见 6.4、6.5。

### 6.4 集成约束（必须遵守，否则必然出问题）

- 组件必须返回 React 元素（返回原生 DOM 会报 `Minified React error #31`）。
- 用 `subscribe` 监听变化，不要假设加载顺序；槽条目变化要重新同步。
- 主题：本插件样式限定在 `.dsh-worldbook-root` 作用域，宿主开启时不污染宿主；宿主关闭时独立主题完整可用。主题开发注意点见第八章。

### 6.5 可能出现的问题（特定场景下才会出现，留意规避）

- **契约页与宿主滚动/固定底栏的布局（Bottom-nav content overlap）**：
  - **触发条件**：宿主把契约页放进自己的**外部滚动容器**（整页滚动），且该容器底部有**固定浮层**（底部导航 / TabBar）。
  - **成因**：契约页根容器 `.dsh-worldbook-root` 由 `WithRoot` 渲染，带 `height: 100%` 内联样式，默认按「填满宿主给定高度、内部自滚动」设计。放入外部滚动容器后，`height: 100%` 把世界书内容限死在可视高度内，内容一旦超高就溢出，压穿宿主滚动容器的 `padding-bottom`，导致**滚动到底时最后条目被固定底栏遮挡**。
  - **规避**：让契约页根容器高度自适应（覆盖为 `height: auto`），由宿主滚动容器统一滚动，并用宿主滚动容器的**底部 padding** 为固定底栏预留空间。世界书页内 `max-height + overflow` 的卡片内滚动不受影响，仍正常工作。



## 七、世界书接管协议（通用兼容）

与宿主插件（提供角色卡 / 会话 / 预设，可能自带世界书功能的插件）的兼容接口约定。
**宿主只需实现接口目标（黑盒，实现方式自定）；宿主不需要使用 SQLite、了解 agent-rp，或复制本插件内部实现。**
协议实现代码在 `src/integration/`，不绑定任何具体宿主。

### 7.0 协议状态与冻结范围

当前协议版本为 **0.5 冻结候选**，不是仅凭文档即可宣布的最终冻结版本。核心注入协议必须先通过第 7.10 节的独立第三方宿主验收，再将本版本标记为冻结。验收前只允许修复通用协议的矛盾、遗漏和实现偏差，不向核心协议加入宿主私有字段。

本章分为两部分：

- **核心协议**：`worldbook.engine`、`worldbook.context.get`、`worldbook.source`，以及 `source → context.books → global` 的注入流程。任何宿主接入都必须遵守。
- **可选能力**：`worldbook.operations` 和角色卡世界书管理投影。它们不影响核心注入接入；宿主可以不实现或不消费。

本章的 `Worldbook` 是本协议的 **Worldbook Interop Profile**：字段和语义参考 SillyTavern World Info，但不是 ST 原始导出 JSON 的声明，也不是 ST 全部功能的声明。宿主已经使用同一 profile 时可以直接提供；宿主使用其它内部模型时，只需在 `src/compat/<host>/` 中做一次映射。

### 7.1 角色与双模式

- **dsh-worldbook（本插件）**：世界书插件，负责注入、存储、管理。
- **宿主插件（Host）**：任何想被本插件接管世界书的插件；具体宿主适配不属于本章协议。

本插件有两种模式，由设置 `compatEnabled`（兼容宿主插件，默认关）作**双模式闸门**：

| 模式 | 行为 |
|---|---|
| **全局世界书**（兼容关） | 只注入本库全局启用的书，不消费任何宿主数据 |
| **全局 + 角色卡绑定**（兼容开） | 额外消费宿主数据：绑定书按名注入、条目按角色过滤、宿主 source 取书 |

### 7.2 总体约定

1. 接口均为 DSH 服务键。服务可以晚注册或注销；消费方必须在每次使用前重新读取，不得永久缓存服务实例。
2. 宿主必须在每次实际生成请求前读取 `worldbook.engine.active`。一次请求从取书到最终请求完成必须使用同一个接管状态，不得混用宿主注入和本插件注入。
3. `active === true` 时，宿主所有世界书注入路径让位；`active === false`、服务不存在或服务注销时，宿主恢复自己的注入。
4. **跨边界书籍引用一律使用精确书名**，不用 id、路径或模糊匹配。书名比较区分大小写；同名书只保留合并优先级最高的第一本。
5. 世界书交换数据使用本章定义的 **Worldbook Interop Profile**。协议附加的本地操作标识不属于 profile 数据，不得写入宿主原始文件。
6. 宿主必须把自己世界书的所有注入入口收拢到能检查接管状态的位置，否则无法保证协议语义。

### 7.3 接口定义

#### 7.3.1 `worldbook.engine` —— 接管声明（本插件提供 / 宿主检查）

`worldbook.engine` 只有一个字段：`active: boolean`。

- 本插件提供唯一的接管声明，`active` 是动态状态，不是加载时快照。
- `active === true` 时，宿主必须停止所有自己的世界书注入路径。
- `active === false`、服务不存在或服务被注销时，宿主必须恢复自己的注入。
- 宿主只检查 `active`，不读取本插件内部数据，也不需要了解本插件的存储方式。
- `active` 只控制注入让位，不控制宿主数据是否删除、迁移或同步。

#### 7.3.2 `worldbook.context` —— 会话上下文（宿主提供 / 本插件消费）

`worldbook.context` 提供按会话读取的上下文。会话不存在或当前无法确定时返回空结果，不抛出业务错误。

`character` 只包含角色名和角色标签；`books` 是绑定到本会话的书名列表。

角色卡世界书管理投影是独立的可选能力，不属于核心注入协议。其正式服务键为 `worldbook.character-books`；若提供，必须只返回当前角色卡实际可见的 ST `character_book` 摘要。只有明确提供本地管理标识的书籍才能复用本插件的编辑操作，其它书籍只能展示。宿主不提供此服务时，不影响核心注入接入。

- 谁持有会话 / 角色生态谁提供（通常宿主）；本插件消费。
- 无提供方 / 拿不到 → 不过滤、不注入绑定书（优雅降级，不阻塞注入）。

#### 7.3.3 `worldbook.source` —— 世界书数据源（宿主提供 / 本插件消费，可选）

`worldbook.source` 提供一个按会话读取的方法：`readBooks(sessionId)`，返回该会话作用域内的 ST 世界书列表。

- 宿主把“如果仍由宿主负责，会注入哪些书”以 ST 格式返回；本插件优先使用这些书，不解析宿主私有格式。
- `sessionId` 是本插件传入的稳定会话标识。宿主自行把它映射到自己的会话对象、状态或事件，不得要求本插件传入宿主事件。
- 返回空数组表示该会话没有宿主作用域书；服务不可用、会话不存在或读取失败时按空数组处理，不阻塞本插件的全局书注入。
- 同一列表中出现重复书名时只保留第一次出现的书。
- 未提供时，本插件只使用自己的全局书和上下文书名引用。

#### 7.3.4 `worldbook.operations` —— 世界书操作（本插件提供 / 宿主消费）

`worldbook.operations` 提供以下可选操作：列出书籍、按精确名称读取书籍、新建整本书、替换整本书、按精确名称删除书籍、按稳定 `entryId` 更新或启停条目，以及按名称启停书籍。

- 宿主的**管理界面 / 命令**和**脚本 / AI 能力**对世界书的一切读写，都通过它完成——保住宿主侧"世界书操作"能力不因接管而失效（具体操作什么、怎么操作，本插件不管）。
- 实现背后是 data 层（`src/data/worldbook.ts`），协议的书名 / 条目标引映射到 data 层的 id。
- `entryId` 是操作协议的稳定元数据，不是 ST 原生字段；导出或交还宿主时不得依赖或强制写入该字段。
- `getBook()` 返回的 ST 书籍字段和条目字段必须原样保留；`updateBook()` 是整本书替换，调用方必须传入完整书籍。未知 ST 字段必须透传。
- `updateEntry()` 是条目部分更新；未提供的字段保持不变。`toggleEntry()` 的 `enabled` 与 ST 的 `disable` 互相转换。
- 操作成功返回成功结果；目标不存在、名称冲突、参数不合法或版本冲突必须返回明确错误。删除不存在的书可以幂等成功。
- 操作必须保证单次调用原子完成；调用方不得依赖数组位置。
- 暴露与否由设置 `exposeOperations` 控制，可运行时切换（保存设置时即时同步注册）。

### 7.4 对接（握手）

本插件每次注入前读取当前会话的兼容数据：

1. 本插件每次请求前读取接管状态；关闭时不消费宿主上下文和来源，宿主继续自己的注入。
2. 开启时按以下顺序合并：`source` 会话书 → `context.books` 书名引用 → 本插件全局启用书。
3. 每一层内部按返回顺序保留；跨层按精确书名去重，优先保留前一层。
4. 宿主服务可以晚于本插件注册，也可以运行时注销；本插件会优雅降级。
5. 宿主必须保证 `worldbook.engine.active` 与自己的实际让位状态一致。

### 7.5 黑盒实现边界

本协议只约定服务键、输入输出和行为，不约定宿主的存储、事件、文件、角色卡结构、命令或 UI 实现。宿主可以用任意内部模型实现，只要满足以下不可省略的语义：

- 会话能由 `sessionId` 稳定定位。
- `worldbook.engine.active` 为真时，宿主所有世界书注入路径都让位。
- `worldbook.context.get(sessionId)` 返回当前角色和绑定书名，无法确定时返回空结果。
- 角色过滤只要求遵循 ST 的 `names`、`tags`、排除标志语义；不要求宿主暴露角色卡原文。
- 角色卡书管理投影（若提供）只返回 ST `character_book` 摘要，不得暴露宿主私有事件或文件格式。
- `worldbook.source.readBooks(sessionId)` 只返回该会话作用域书，统一使用 ST 字段。
- 服务缺失、会话不存在和无匹配书都不会阻塞本插件的全局注入。
- 书名是跨边界书籍引用；书名比较精确且区分大小写；条目操作使用稳定 `entryId`。

文档中的字段和行为是协议数据契约，不要求宿主采用某种实现代码。协议的数据模型采用与 SillyTavern World Info 对齐的字段和语义，但不宣称覆盖 SillyTavern 的全部功能。宿主如果已经使用本节约定的数据结构，可以直接提供；否则只需在自己的适配层转换为本节约定的数据，不需要改变内部存储。

#### 7.5.1 ST 对齐数据契约

本协议不是任意 SillyTavern World Info 文件的完整兼容声明。协议定义的是一个与 ST World Info 语义对齐的数据 profile。对方如果内部已经使用同一 profile，可以直接提供；如果只有 ST 原始导出文件对象，则需要在宿主适配层做字段映射。

协议书籍字段为：`name: string`（非空）、`description?: string`、`scan_depth?: number`、`recursive_scanning?: boolean`、`extensions?: object` 和 `entries: array`。

协议条目字段为：`key?: string[]`、`keysecondary?: string[]`、`comment?: string|null`、`content?: string`、`constant?: boolean`、`vectorized?: boolean`、`selective?: boolean`、`selectiveLogic?: 0|1|2|3`、`addMemo?: boolean`、`order?: number`、`position?: number`、`disable?: boolean`、`ignoreBudget?: boolean`、`caseSensitive?: boolean|null`、`matchWholeWords?: boolean|null`、`scanDepth?: number|null`、`excludeRecursion?: boolean`、`preventRecursion?: boolean`、`matchPersonaDescription?: boolean`、`matchCharacterDescription?: boolean`、`matchCharacterPersonality?: boolean`、`matchCharacterDepthPrompt?: boolean`、`matchScenario?: boolean`、`matchCreatorNotes?: boolean`、`delayUntilRecursion?: boolean|number`、`useProbability?: boolean|null`、`probability?: number`、`depth?: number`、`outletName?: string`、`group?: string`、`groupOverride?: boolean`、`groupWeight?: number`、`scanDepth?: number|null`、`useGroupScoring?: boolean|null`、`automationId?: string`、`role?: number`、`sticky?: number|null`、`cooldown?: number|null`、`delay?: number|null`、`triggers?: string[]` 和 `characterFilter?: { names?: string[]; tags?: string[]; isExclude?: boolean }`。未提供的可选字段使用协议 profile 默认值。

上面是协议字段名，不是 ST 原始导出 JSON 的完整字段层级。ST 导出映射中，`key` 对应 `keys`，`keysecondary` 对应 `secondary_keys`，`order` 对应 `insertion_order`；`position`、`scanDepth`、`excludeRecursion`、`preventRecursion`、`delayUntilRecursion`、`depth`、`probability`、`caseSensitive`、`matchWholeWords`、`useGroupScoring`、`automationId`、`role`、`sticky`、`cooldown`、`delay` 和 `triggers` 等字段位于 ST 条目的 `extensions` 下。`characterFilter` 是 ST 条目对象字段；角色卡 `character_book` 则使用其独立的 `keys` / `secondary_keys` / `insertion_order` / `enabled` 结构，宿主适配层负责转换。

未知书籍字段和条目扩展字段必须放入 `extensions` 并原样透传。`entryId` 只属于操作协议元数据，不属于 ST 数据，不得写回宿主原始文件。

#### 7.5.2 合并算法

本插件只执行以下确定流程：读取一次本次请求的接管状态；若开启，读取 `source.readBooks(sessionId)`、读取 `context.get(sessionId).books` 书名引用、读取本插件全局启用书；按 `source → context → global` 顺序追加。每一层保持返回顺序；书名以 Unicode 字符串精确比较并区分大小写；遇到已经出现的书名跳过后者。`source` 返回的书已经是宿主最终作用域书，不再按 `context.books` 二次筛选。

`context.books` 只是书名引用，不是 ST 书籍数据；引用不存在时跳过。`source` 缺失、返回空数组、会话不存在或抛错都按空 source 处理。角色过滤只作用于最终合并后的条目，不改变书籍去重结果。

#### 7.5.3 请求时序

宿主在每次生成请求开始前读取一次 `engine.active` 并锁定本次请求的结果。锁定后直到请求完成不得切换数据源；兼容开关变化只影响下一次尚未开始的请求。`active === true` 时宿主不得先生成原生世界书 prompt 再等待本插件结果，必须在自身所有世界书注入入口最前面让位。

#### 7.5.4 服务与错误

服务方法为同步方法；服务不存在、返回值不符合契约或读取抛错时，消费方对可选服务执行优雅降级。一个服务键同一时刻只能有一个有效提供方；提供方替换或注销后，消费方下一次使用时重新读取。

操作服务的方法、参数和返回值以公开协议类型为准。成功操作返回 `void`；`getBook`、`updateBook`、`updateEntry` 等目标不存在或参数无效时抛出 `WorldbookProtocolError`，其 `code` 至少区分 `NOT_FOUND`、`NAME_CONFLICT`、`INVALID_ARGUMENT` 和 `CONFLICT`；重名创建或改名必须失败；删除不存在的书可幂等成功；单次操作必须原子完成。

### 7.6 服务生命周期

- 服务提供方可以晚于本插件加载，也可以在运行时注销。
- 消费方每次使用前重新读取服务；服务不存在等同于该可选能力不可用。
- 同一个服务键只允许一个当前有效提供方；多提供方由宿主适配层自行选择，不属于协议能力。
- 服务注销不会删除任何宿主或本插件数据，只触发优雅降级。
- 接管状态变化只影响后续尚未开始的请求；正在生成的请求不得中途切换数据源。

### 7.7 设置项

| 设置 | 说明 | 默认 |
|---|---|---|
| 兼容宿主插件 | 双模式闸门，开启才接管 | 关 |
| 向宿主暴露世界书操作接口 | 决定是否 `provide('worldbook.operations')` | 关 |

### 7.8 角色卡绑定（ST 移植重点）

本插件**没有角色卡**，绑定由宿主按名决定：

- **绑定**：宿主在 `worldbook.context.books` 里声明本会话绑定的书名 → 本插件按名在自己的库查书注入，**即使该书全局未启用也会注入**。
- **角色过滤**：宿主在 `worldbook.context.character` 给出当前角色 `{ name, tags }`；条目级角色过滤按 ST 的 names、tags 和排除标志语义执行。
- 角色卡数据如何取得、保存和导入属于宿主实现，不是通用协议要求。

> **设计定位（重点）**：对移植 ST 的插件，UI 槽位契约（第六章）接入与否无所谓，**角色卡绑定是硬性兼容点**——世界书绑不上角色卡，对 ST 移植插件就是废的。本插件没有角色卡，无法预知目标插件如何暴露当前角色，故定下 `worldbook.context` 这一稳定协议让移植方适配；若目标插件已有自己的角色上下文网关，应在宿主层写适配器转成此协议。

### 7.9 服务键与实现状态

| 键 | 提供方 | 消费方 | 本插件侧状态 |
|---|---|---|---|
| `worldbook.engine` | 本插件 | 宿主 | ✅ 已实现（`src/integration/engine.ts`） |
| `worldbook.context` | 宿主 | 本插件 | ✅ 消费侧已实现（`src/data/character.ts` + `resolveSessionInjection`） |
| `worldbook.source` | 宿主 | 本插件 | ✅ 消费侧已实现（`src/integration/source.ts`） |
| `worldbook.operations` | 本插件 | 宿主 | ✅ 已实现（`src/integration/operations.ts`） |
| `worldbook.character-books` | 宿主 | 管理页（可选） | ✅ 消费侧已实现；宿主适配可选 |

### 7.10 第三方宿主验收标准

真实宿主或独立模拟宿主在声明接入完成前，必须只依赖本章协议完成以下验收：

1. **最小注册**：不依赖本插件 SQLite、agent-rp、事件对象或私有文件，只提供 `worldbook.context.get(sessionId)`；服务不存在时本插件仍能注入全局书。
2. **宿主来源**：提供 `worldbook.source.readBooks(sessionId)`，返回一份符合 7.5.1 的 profile 书籍；本插件能注入其条目。
3. **合并规则**：同时提供 source 书、context 书名引用和全局书，验证顺序为 `source → context → global`，同名保留首次出现。
4. **会话隔离**：两个 sessionId 返回不同书籍，验证本插件不会串会话。
5. **角色过滤**：提供 `{ character: { name, tags } }`，验证 `characterFilter` 的 names、tags 和 `isExclude` 语义。
6. **接管时序**：在一次请求开始前切换 `active`，验证同一个最终请求只出现一个世界书来源；正在生成的请求不因中途状态变化混用来源。
7. **生命周期**：服务晚注册、注销和读取抛错时，验证核心注入能够优雅降级。
8. **可选 operations**：若消费 `worldbook.operations`，验证精确书名、稳定 `entryId`、整本替换、部分条目更新、重名错误、`NOT_FOUND` 和 `INVALID_ARGUMENT`。

验收必须由独立宿主数据模型完成，不能直接调用本插件 `src/data/`、`src/context/` 或 agent-rp 适配代码。通过后才可将协议版本从“冻结候选”标记为“冻结”。

> 冒烟测试：`npm run test:worldbook:all` 里的 `worldbook-compat-smoke.mjs` 覆盖协议侧行为。
> 具体宿主适配不属于通用协议文档，应由宿主适配层另行说明。

## 八、主题开发

本插件的 UI 主题有两态：**跟随 DSH**（默认）与**粉色独立主题**（可选）。主题相关代码全部在 client 半：`src/client/theme.css`、`src/client/wb-theme.ts`、`src/client/client.ts`（`WithRoot`）。

### 8.1 主题机制

- **默认是「跟随 DSH」**：插件设置 `theme: 'dsh'`，UI 根容器加 `.dsh-theme` 类。
- **粉色是可选独立主题**（`theme: 'pink'`）：根容器**不加** `.dsh-theme` 类，使用 theme.css 里 `.dsh-worldbook-root` 上定义的粉色变量。
- 所有颜色一律经内部 `--ml-*` 变量路由，**组件里绝不硬编码色值**。`.dsh-theme` 只是把 `--ml-*` 映射到 dsh 的语义 token，因此：
  - 跟随 DSH 时，颜色随 dsh 明暗自动切换；
  - 粉色时，颜色用 theme.css 顶部的粉色变量。

### 8.2 dsh 统一颜色 token 的权威位置

`--dsw-alias-*` 语义 token（Semantic Token）来自 dsh 的 **`@deepseek-ai/dsh-client-ui-theme`** 包，在 DeepSeek Harness 仓库 **`packages/client/ui-theme/`**：

- **类型定义**：`src/client/index.ts` 的 `BUILTIN_INSPECT_TOKENS`
- **样式源**：`src/styles/design-platform.css`
- **运行时定义处**：注入的 `<style data-plugin-css="@deepseek-ai/dsh-client-ui-theme/design-platform.css">`，选择器为 **`body`（明色）** 与 **`body[data-ds-dark-theme]`（暗色）**，两组各自完整声明。

只要本插件根在 body 内，`var(--dsw-alias-*)` 就随 dsh 明暗切换自动更新，无需自己监听主题变化。

常用取值（明色）：`bg-layer-1/2/3`=#fff、`bg-overlay`=#e9ecf2（灰）、`label-primary`=#0f1115、`label-secondary`=#61666b、`label-tertiary`=#81858c、`state-business-primary`=#4176e6（蓝）、`border-l1`=#0000000a、`border-l2`=#0000001a。

### 8.3 token 的两层与精细度

dsh 的 token 分两层，**写主题时要知道用哪层**：

| 层 | 前缀 | 特点 | 精细度 |
| --- | --- | --- | --- |
| 语义层 | `--dsw-alias-*` | 角色层面，一个语义位一个值（如 `state-business-primary` 只有一个蓝）；随明暗自动切换 | **低**：同色系深浅会多对一撞值 |
| 色板层 | `--dsw-static-*` | 完整色阶（如 `neutral-bluish-00~1000` 十几级），固定色值 | **高**：能表达深浅渐变，但**不随明暗变化** |

结论：
- 结构/背景/文字用**语义层**（自动跟随明暗），代价是色阶少；
- 需要"同色系深浅渐变"（hover 深、正文中、边框浅）时用**色板层**，但要在暗色下**自行补一套覆盖**——dsh 自己也是"明暗两套值"这么做的。
- **不要**把语义层 token 当正文色用（例如把 `state-business-primary`（蓝）映射给标题文字），那是视觉事故（蓝字）的根源。

### 8.4 映射要点（视觉约定）

- 标题/正文文字用 `label-*`（中性色），**不要**用 `state-business-primary`（蓝）当正文色。
- 卡片背景用 `bg-layer-*`（正常表面），**不要**用 `bg-overlay`（那是浮层灰）。
- 蓝色只保留给强调控件：选中态、开关、勾选框、focus 环、主按钮渐变。
- 模态遮罩用 `var(--ml-mask)`，不要硬编码 `rgba(0,0,0,.4)` 之类。

### 8.5 常见坑

- **不要给子容器重复加 `.dsh-worldbook-root` 类**：该类规则会在该元素上直接声明粉色变量，覆盖外层 `.dsh-theme` 的映射，导致该元素永远粉色（ConfirmHost 曾踩过：确认框套了自己的 `.dsh-worldbook-root` 根类，结果粉色无法跟随 DSH）。子容器应去掉根类，让变量从父级继承。
- **新增 UI 元素一律走 `--ml-*` 变量**，不要在 tsx 里写死 `#hex` / `rgba`。
- 修改映射前，先到 7.2 的运行时 `<style>` 里核对 token 是否存在、明暗取值，避免 `var()` 失效回落到默认。

## 九、开源与协议

MIT。开发文档、测试、代码均公开。集成与二次开发均欢迎。
