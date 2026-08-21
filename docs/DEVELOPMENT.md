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
- Client 半：`inject: ['slots']`（UI 槽位注册）

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
- **条目**：`entries(bookId)` / `getEntry(bookId, entryId)` / `addEntry(bookId, patch)` / `updateEntry(bookId, entryId, patch)` / `removeEntry(bookId, entryId)` / `reorderEntries(bookId, orderedIds)`（重写 `display_index`）
- **ST 导入导出**：`parseStWorldJson(json)` → `{ name, scanDepth, entries }`；`toStWorldJson(bookId)` → ST 兼容 JSON（含 `extensions.display_index`）
- **归一化**：`normalizeEntry(src)` 把前端/ST 字段规范化为 `NormalizedEntry`（驼峰字段名）；`toEntryView(row)` 读库行 → 视图对象

### 3.3 新增一个条目字段

1. `schema.sql` 加列（或用 `db/index.ts` 的 `migrate` 里 `addCol` 补老库）。
2. `WorldbookEntryRow`（接口）+ `normalizeEntry`（读写映射）+ `toEntryView`（输出视图）三处同步。
3. 若需跨轮状态，参照 `worldbook_timed_effects` 模式加表 + `getTimedEffects/setTimedEffect/pruneTimedEffects/clearTimedEffects`。

## 四、注入引擎（二次开发核心）

入口 `src/context/worldbook.ts` + `src/context/inject.ts`。

### 4.1 引擎签名

```ts
renderWorldbookInjection(
  messageLines: string[],                       // 本次扫描的文本行（深度截断后的最近消息）
  opts: { depth?: number; cursor?: number } = {}, // depth=扫描最近 N 条；cursor=时间游标（sticky/cooldown/delay）
): InjectedWorldEntry[]
```

- `cursor` 语义对齐 ST `chat.length`：只随真实对话消息（直接用户消息 + assistant 消息）推进，排除插件注入消息与系统快照。
- `matchLinesFromMessages(messages)` 从 dsh 消息数组提取文本行，供引擎扫描。

### 4.2 已实现语义（对齐 ST world-info.js）

| 特性 | 说明 |
| --- | --- |
| 关键词触发 | 主键 keys + 副键 keysecondary，支持大小写/整词/正则 |
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
| 排序 | 注入按 order 降序；展示用 display_index |

### 4.3 自定义注入场景

不想用内置 `agent/pre-step` 接入时，可直接调用 `renderWorldbookInjection`：

```ts
import { renderWorldbookInjection, matchLinesFromMessages } from 'dsh-worldbook'
import { openDb } from 'dsh-worldbook/db'

openDb(dataDir)  // 初始化（也可交给插件 apply 统一初始化）

// 在任意时机：
const world = renderWorldbookInjection(textLines, { cursor })
// world: InjectedWorldEntry[]，取 .content 拼装进你的请求
```

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
| PUT | `/worldbooks/:id/entries/reorder` | `{ orderedIds }` 重写 display_index |

### 设置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/settings` | `{ enabled, workspaceMode, workspaceIds, theme, injectMode, devMode, devAction, devBookId, devEntryIds, devPerms }` |
| PUT | `/settings` | 更新 `{ enabled?\|workspaceMode?\|workspaceIds?\|theme?\|injectMode?\|devMode?\|devAction?\|devBookId?\|devEntryIds?\|devPerms? }` |

## 六、槽位契约（集成指南）

本插件提供**两处可集成的 UI**：世界书管理页与插件设置卡片。管理页由 `nav` 一个槽承载，宿主自行决定挂到悬浮窗还是设置页；设置卡片是独立一个槽。

### 6.1 本插件声明的槽位

| 槽位 | kind | scope | 说明 |
| --- | --- | --- | --- |
| `settings.section`（id: `worldbook`） | list | root | 插件**独立存在**时，世界书管理页出现在 dsh 设置侧边栏 |
| `mindlink.worldbook.nav` | single | root | 世界书管理页（完整页面，含列表、新建、导入导出、编辑）；宿主自行决定挂到悬浮窗还是设置页 |
| `mindlink.worldbook.settings-card` | single | root | 插件设置卡片（启用开关、作用域、主题、注入时机、开发模式；内嵌、就地修改不弹窗） |
| `worldbook.host.present` | single | root | **宿主在线握手**：宿主集成后注册，通知本插件隐藏 dsh 设置分区 |

所有自定义槽由本插件在 `shell.overlay`（list/root，additive）注册时通过 `children` 声明，**常驻不注销**——保证它们不随 `settings.section` 的动态注销而塌缩。`shell.overlay` 的 SlotMap 类型由官方 `dsh-client-ui-layout` 声明；本地类型检查时若未安装该包，需在 `src/client/slots.ts` 里按运行时 slot-catalog（list/root）补全声明（见该文件内注释）。

### 6.2 宿主在线握手（重要）

`settings.section` 按需注册：
- 检测到 `worldbook.host.present` 有条目（宿主在线）→ 注销 `settings.section`，世界书 UI 只在宿主位置，dsh 设置无重复分区。
- 宿主停用（dsh 插件级停用，client 半不加载）→ `worldbook.host.present` 无条目 → 恢复 `settings.section`。

集成方只需：集成本插件 UI 时，注册到 `worldbook.host.present`（注册返回的 disposer 在停用时调用即可）。本插件据此决定是否保留自己的 dsh 设置分区。

### 6.3 集成方对接

对接分四步，全部走 dsh 的 `slots` 服务：

1. **订阅槽**：监听 `mindlink.worldbook.nav` 与 `mindlink.worldbook.settings-card` 是否有注册条目，本插件加载/卸载时同步。
2. **读取组件**：从对应槽的条目里取出组件引用；没有条目说明世界书插件未安装或未加载。
3. **渲染**：用 React 把组件渲染到你的位置；同时注册 `worldbook.host.present` 完成握手。
4. **卸载**：组件卸载时，注销订阅返回的 disposer 与握手注册返回的 disposer。

要点：
- 管理页由 `nav` 一个槽承载，**只挂载一个位置**（悬浮窗或设置页任选）；设置卡片（`settings-card`）单独挂载到设置页。
- 未读到条目时可按需回退到你自己的兜底界面。
- 若宿主不需要本插件 UI，可只用 REST API 或 `renderWorldbookInjection`（见第三/四/五章），完全脱离槽位。

**关于 React 依赖（重要）**：dsh 官方前端本身就是 React（`@deepseek-ai/dsh-client-web-react` 直接依赖 `react@^18.2.0`），整个 slot / 组件渲染 / 状态桥都是 React 技术栈。本插件的 `lib/client.js` 只 externalize 了一个 `require("react")`（经 `__ModuleLoader__` 包装），运行时由 dsh 的 Web ModuleLoader 共享模块表解析——**react 是 dsh 生态共享的，宿主/集成方对接本插件 UI 时无需单独安装 react**。只有用 TypeScript 编写并 import 本插件组件/类型时，编译期才需要在 `devDependencies` 装 `react` + `@types/react` 做类型检查，不会进入最终 bundle。

硬性约束与常见问题见 6.4、6.5。

### 6.4 集成约束（必须遵守，否则必然出问题）

- 组件必须返回 React 元素（返回原生 DOM 会报 `Minified React error #31`）。
- 用 `subscribe` 监听变化，不要假设加载顺序；槽条目变化要重新同步。
- 主题：本插件样式限定在 `.dsh-worldbook-root` 作用域，宿主开启时不污染宿主；宿主关闭时独立主题完整可用。主题开发注意点见第七章。

### 6.5 可能出现的问题（特定场景下才会出现，留意规避）

- **契约页与宿主滚动/固定底栏的布局（Bottom-nav content overlap）**：
  - **触发条件**：宿主把契约页放进自己的**外部滚动容器**（整页滚动），且该容器底部有**固定浮层**（底部导航 / TabBar）。
  - **成因**：契约页根容器 `.dsh-worldbook-root` 由 `WithRoot` 渲染，带 `height: 100%` 内联样式，默认按「填满宿主给定高度、内部自滚动」设计。放入外部滚动容器后，`height: 100%` 把世界书内容限死在可视高度内，内容一旦超高就溢出，压穿宿主滚动容器的 `padding-bottom`，导致**滚动到底时最后条目被固定底栏遮挡**。
  - **规避**：让契约页根容器高度自适应（覆盖为 `height: auto`），由宿主滚动容器统一滚动，并用宿主滚动容器的**底部 padding** 为固定底栏预留空间。世界书页内 `max-height + overflow` 的卡片内滚动不受影响，仍正常工作。

## 七、主题开发

本插件的 UI 主题有两态：**跟随 DSH**（默认）与**粉色独立主题**（可选）。主题相关代码全部在 client 半：`src/client/theme.css`、`src/client/wb-theme.ts`、`src/client/client.ts`（`WithRoot`）。

### 7.1 主题机制

- **默认是「跟随 DSH」**：插件设置 `theme: 'dsh'`，UI 根容器加 `.dsh-theme` 类。
- **粉色是可选独立主题**（`theme: 'pink'`）：根容器**不加** `.dsh-theme` 类，使用 theme.css 里 `.dsh-worldbook-root` 上定义的粉色变量。
- 所有颜色一律经内部 `--ml-*` 变量路由，**组件里绝不硬编码色值**。`.dsh-theme` 只是把 `--ml-*` 映射到 dsh 的语义 token，因此：
  - 跟随 DSH 时，颜色随 dsh 明暗自动切换；
  - 粉色时，颜色用 theme.css 顶部的粉色变量。

### 7.2 dsh 统一颜色 token 的权威位置

`--dsw-alias-*` 语义 token（Semantic Token）来自 dsh 的 **`@deepseek-ai/dsh-client-ui-theme`** 包，在 DeepSeek Harness 仓库 **`packages/client/ui-theme/`**：

- **类型定义**：`src/client/index.ts` 的 `BUILTIN_INSPECT_TOKENS`
- **样式源**：`src/styles/design-platform.css`
- **运行时定义处**：注入的 `<style data-plugin-css="@deepseek-ai/dsh-client-ui-theme/design-platform.css">`，选择器为 **`body`（明色）** 与 **`body[data-ds-dark-theme]`（暗色）**，两组各自完整声明。

只要本插件根在 body 内，`var(--dsw-alias-*)` 就随 dsh 明暗切换自动更新，无需自己监听主题变化。

常用取值（明色）：`bg-layer-1/2/3`=#fff、`bg-overlay`=#e9ecf2（灰）、`label-primary`=#0f1115、`label-secondary`=#61666b、`label-tertiary`=#81858c、`state-business-primary`=#4176e6（蓝）、`border-l1`=#0000000a、`border-l2`=#0000001a。

### 7.3 token 的两层与精细度

dsh 的 token 分两层，**写主题时要知道用哪层**：

| 层 | 前缀 | 特点 | 精细度 |
| --- | --- | --- | --- |
| 语义层 | `--dsw-alias-*` | 角色层面，一个语义位一个值（如 `state-business-primary` 只有一个蓝）；随明暗自动切换 | **低**：同色系深浅会多对一撞值 |
| 色板层 | `--dsw-static-*` | 完整色阶（如 `neutral-bluish-00~1000` 十几级），固定色值 | **高**：能表达深浅渐变，但**不随明暗变化** |

结论：
- 结构/背景/文字用**语义层**（自动跟随明暗），代价是色阶少；
- 需要"同色系深浅渐变"（hover 深、正文中、边框浅）时用**色板层**，但要在暗色下**自行补一套覆盖**——dsh 自己也是"明暗两套值"这么做的。
- **不要**把语义层 token 当正文色用（例如把 `state-business-primary`（蓝）映射给标题文字），那是视觉事故（蓝字）的根源。

### 7.4 映射要点（视觉约定）

- 标题/正文文字用 `label-*`（中性色），**不要**用 `state-business-primary`（蓝）当正文色。
- 卡片背景用 `bg-layer-*`（正常表面），**不要**用 `bg-overlay`（那是浮层灰）。
- 蓝色只保留给强调控件：选中态、开关、勾选框、focus 环、主按钮渐变。
- 模态遮罩用 `var(--ml-mask)`，不要硬编码 `rgba(0,0,0,.4)` 之类。

### 7.5 常见坑

- **不要给子容器重复加 `.dsh-worldbook-root` 类**：该类规则会在该元素上直接声明粉色变量，覆盖外层 `.dsh-theme` 的映射，导致该元素永远粉色（ConfirmHost 曾踩过：确认框套了自己的 `.dsh-worldbook-root` 根类，结果粉色无法跟随 DSH）。子容器应去掉根类，让变量从父级继承。
- **新增 UI 元素一律走 `--ml-*` 变量**，不要在 tsx 里写死 `#hex` / `rgba`。
- 修改映射前，先到 7.2 的运行时 `<style>` 里核对 token 是否存在、明暗取值，避免 `var()` 失效回落到默认。

## 八、开源与协议

MIT。开发文档、测试、代码均公开。集成与二次开发均欢迎。
