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
| GET | `/settings` | `{ enabled, workspaceMode, workspaceIds }` |
| PUT | `/settings` | 更新 `{ enabled?\|workspaceMode?\|workspaceIds? }` |

## 六、槽位契约（集成指南）

### 6.1 本插件声明的槽位

| 槽位 | kind | scope | 说明 |
| --- | --- | --- | --- |
| `settings.section`（id: `worldbook`） | list | root | 插件**独立存在**时，管理页出现在 dsh 设置侧边栏 |
| `mindlink.worldbook.nav` | single | root | 宿主「世界书」导航位渲染本插件页面 |
| `mindlink.worldbook.settings` | single | root | 宿主设置页内嵌本插件卡片 |
| `worldbook.host.present` | single | root | **宿主在线握手**：宿主集成后注册，通知本插件隐藏 dsh 设置分区 |

所有自定义槽由本插件在 `shell.overlay`（list/root，additive）注册时通过 `children` 声明，**常驻不注销**——保证它们不随 `settings.section` 的动态注销而塌缩。

### 6.2 宿主在线握手（重要）

`settings.section` 按需注册：
- 检测到 `worldbook.host.present` 有条目（宿主在线）→ 注销 `settings.section`，世界书 UI 只在宿主位置，dsh 设置无重复分区。
- 宿主停用（dsh 插件级停用，client 半不加载）→ `worldbook.host.present` 无条目 → 恢复 `settings.section`。

集成方只需：集成本插件 UI 时，`register` 到 `worldbook.host.present`（返回的 disposer 在停用时调用即可）。

### 6.3 集成方三步

1. **监听**：`slots.subscribe('mindlink.worldbook.nav', sync)`，读到本插件注册条目。
2. **读取组件**：`slots.entriesOfSlot('mindlink.worldbook.nav')` → 取 `[0].component`。
3. **渲染**：用 React `createElement(component)` 渲染到你的位置；同时 `register` 到 `worldbook.host.present` 完成握手。

```ts
// 宿主插件 client 半
import { createElement as h } from 'react'

export const inject = ['slots']

export function apply(ctx: { slots?: any }) {
  const slots = ctx.slots
  if (!slots) return

  // 1. 订阅：世界书插件加载/卸载时同步
  const update = () => {
    const entries = slots.entriesOfSlot('mindlink.worldbook.nav')
    setWorldbookEntry(entries[0]?.component ?? null)
  }
  update()
  const unsub = slots.subscribe('mindlink.worldbook.nav', update)

  // 2. 宿主在线握手：告诉世界书插件「我在用你的 UI」
  let present: (() => void) | null = null
  const syncPresent = () => {
    if (getWorldbookEntry() && !present) {
      present = slots.register({ name: 'worldbook.host.present', priority: 0 }, () => null)
    } else if (!getWorldbookEntry() && present) {
      present(); present = null
    }
  }
  syncPresent()

  return () => { unsub?.(); present?.() }
}

// 3. 渲染到你的位置；无世界书插件时用宿主兜底
function MyPanel() {
  const WorldbookComponent = getWorldbookEntry()
  return WorldbookComponent ? h(WorldbookComponent) : h('div', null, '未安装世界书插件')
}
```

### 6.4 集成约束

- 组件必须返回 React 元素（返回原生 DOM 会报 `Minified React error #31`）。
- 用 `subscribe` 监听变化，不要假设加载顺序。
- 若宿主不想用本插件 UI，也可只用 REST API 或 `renderWorldbookInjection`（见第三/四/五章），完全脱离槽位。
- 主题：本插件样式限定在 `.dsh-worldbook-root` 作用域，宿主开启时不污染宿主；宿主关闭时独立主题完整可用。

## 七、开源与协议

MIT。开发文档、测试、代码均公开。集成与二次开发均欢迎。
