# 兼容 dsh-agent-rp

本目录是「我们去兼容对方」的实现与设计文档。**新会话先读这篇**，就能了解兼容部分的全部背景，不必再翻 agent-rp 源码。

- 对方插件：`@dsh-external/dsh-agent-rp`（私有包，`0.0.0-rc.181`，MIT），对方经常更新，**不能改对方源码**，所有兼容靠 DSH 宿主机制 + 只读适配。
- 我方插件：`dsh-worldbook`（本仓库）。
- **通用兼容已实现**：世界书接管协议（`src/integration/`，权威见 `docs/DEVELOPMENT.md` 第七章）已把 `worldbook.engine` / `worldbook.operations` 的**提供**、`worldbook.context` / `worldbook.source` 的**消费侧**做好。**本模块只做 agent-rp 专属适配**（提供 source/context、拦截、命令影子、迁移），通用侧不再重复实现。
- 兼容开关：通用闸门 `compatEnabled`（默认关，双模式闸门，见开发文档 7.1）+ 本模块开关 `agentRpCompat`（默认关）。`compatEnabled` 关着时，本模块提供的 `worldbook.source` / `worldbook.context` 不会被消费（`resolveSessionInjection` 直接返回空，纯全局单模式）。

## 0. 通用兼容与本模块的分工

| 能力 | 归属 | 状态 |
|---|---|---|
| `worldbook.engine` 提供（active 实时反映 compatEnabled） | 通用 | ✅ `src/integration/engine.ts` |
| `worldbook.operations` 提供（命令/脚本 CRUD，`exposeOperations` 控制） | 通用 | ✅ `src/integration/operations.ts` |
| `worldbook.context` 消费（绑定书按名注入 + characterFilter） | 通用 | ✅ `src/data/character.ts` + `src/integration/source.ts` |
| `worldbook.source` 消费（注入三级取书 source→绑定书→全局书） | 通用 | ✅ `src/context/worldbook.ts` |
| `worldbook.source` 提供：解析 agent-rp 会话事件 → ST 书 | 本模块 | ✅ `adapter.ts` |
| `worldbook.context` 提供：桥接对方 `worldbook.characterContext` | 本模块 | ✅ `character.ts` |
| 拦截 `import_world_info` / 命令影子 | 本模块 | ✅ `tools.ts` / `commands.ts` |
| 迁移对方书到本库 | 本模块 | ✅ `import.ts` |
| agent-rp 事件格式解析（内部辅助） | 本模块 | ✅ `events.ts` |

装配入口 `src/compat/agent-rp/index.ts`：本模块开关 `agentRpCompat`（设置项，默认关）+ 通用 `compatEnabled`。
运行时经 REST 保存设置时 `syncAgentRpCompat` 即时挂载/卸载（与 `syncOperations` 同模式）。

通用侧的消费方管线（`resolveSessionInjection` → `renderWorldbookInjection`）对我们已经就位：本模块只要把「对方会话里有哪些书、当前角色是谁」通过上面两个服务键交出去，注入、角色过滤、同名去重全部由通用侧完成。

## 1. 对方的插件是怎么工作的（要点速查）

### 1.1 世界书存储：全部会话级，嵌在会话事件流里

- **独立世界书**：AI 通过 `import_world_info` 工具 / 客户端通过 `/rp-world-info-import` 命令 / 会话启动种子 `agent-rp/world-info-library-seed` 导入。**完整 ST JSON 直接存在会话事件的 `meta.raw` 里**（`参考文献/dsh-agent-rp-main/src/import/session-world-info.ts`）。
- **角色卡世界书**：内嵌在角色卡 `data.character_book` 里随卡导入。**对方不走 ST 的 `extensions.world` 按名引用，也没有 `charLore`**。
- 宿主级 `WorldInfoLibrary`（`~/.dsh/agent-rp/world-info-imports/`，按内容寻址存原始 JSON）只是"开新会话预选默认书"的源，**不是注入数据源**。
- 另有会话级世界书覆盖 `world-info-configuration`（AI 可 toggle/edit/delete 条目，状态存在 `command/done` 事件，前缀 `agent-rp-world-info-v0:`）。

### 1.2 注入：对方自己在 system prompt 里算，不进消息流

`resolveSessionRoleplayRuntime`（session-roleplay-runtime.ts:75）→ `readActiveSessionLorebookSourcesFromEvents`（world-info-configuration.ts:46）→ 从事件流读书 → `renderSessionLorebooks`（prompt.ts:119）→ 自己的引擎 → 拼进 `systemPrompt.section('deployment:persona')`，该 section 是 **`complete:true`**。

### 1.3 关键机制事实（决定技术选型）

| DSH 机制 | 位置 | 结论 |
|---|---|---|
| `system-prompt/assemble` 瀑布 | dsh-system-prompt/lib/index.js:283 | **对 complete section 无效**（284-289 会用预瀑布拷贝强制还原），注入层无法从外部改 |
| `tools/pre-execute` / `tools/execute` / `tools/post-execute` 瀑布 | dsh-tools/lib/index.js:3105 / 3202 / 3367 | **可整体替换工具调用结果** → 拦截对方工具 |
| 命令执行 | dsh-commands/lib/index.js:300 | 无 pre-execute 钩子，但 `commands.view(agent).get(name)` 支持 **agent 作用域同名 shadow 全局命令** |
| `Agent.ctx` | dsh-agent types/runtime-types.d.ts:72 | 公开作用域 ctx，可 per-agent 注册 shadow |
| session.append | dsh-session/lib/index.js:1444 | 无钩子，事件写入不可拦 |
| `worldbook.characterContext` | 对方 index.ts:517-523 读 / :1197 提供（host 模式） | 对方自己的键，**不是**我方协议键 `worldbook.context`；由本模块 `character.ts` 桥接 |
| `worldbook.context` / `worldbook.source`（我方协议键） | `src/data/character.ts` / `src/integration/source.ts` | 通用兼容已实现**消费侧**；本模块只需**提供**这两键（见 §0），注入引擎自动接管 |

对方插件默认 `mode: character`（preset/agent.cordis.yml），此时**不跑**快照合并、**不提供** characterContext，只注入自己的世界书。

**角色上下文桥**：我方协议键是 `worldbook.context`（`{ get(sessionId) → { character?, books? } }`，**消费侧已由通用兼容实现**：`resolveSessionInjection` → 绑定书按名注入 + characterFilter 过滤）。agent-rp 用的是它自己的 `worldbook.characterContext`（`{ register(sessionId, resolve) }` 注册 / `{ getCurrentCharacter(sessionId) }` 消费）。本模块 `character.ts` 负责桥接：提供我方 `worldbook.context`，把 agent-rp 的角色解析器转写成 `get(sessionId) → { character }`，并把当前角色卡内嵌书（迁移后）报在 `books` 里实现「角色卡绑定按名注入」。

---

## 2. 核心问题的答案：怎么让对方的注入引擎失效（不动源码）

**定性**：对方注入的唯一数据源是 `readActiveSessionLorebookSourcesFromEvents(events)` 从会话事件流读出来的书。**让会话事件流里永远不出现它认识的世界书 → 它读到空数组 → 引擎注入空气 → 自然失效。** 书本身在别处（我们的库里）不受影响。

**三个拦截口子：**

1. **`tools/execute` 拦截 `import_world_info`**（对方注册于 index.ts:1131）。钩 `tools/execute`，`exec.name === 'import_world_info'` 时：
   - 读附件 → 解析 ST JSON → 导入**我们的 SQLite**
   - 返回 `isError` 结果 → DSH 写 `tool/result` 带 `isError:true` → 对方 `readActiveSessionWorldInfos` 首行跳过（session-world-info.ts:182）→ 事件流里没有书
2. **命令影子**：per-agent 用 `agent.ctx.commands.register` 注册同名 `rp-world-info`（index.ts:598）/ `rp-world-info-import`（index.ts:604），shadow 全局命令：
   - `/rp-world-info-import`：接住 → 导入我们库 → 返回成功但文本**不带 `agent-rp-world-info-library-v0:` 前缀** → 对方 `decodeWorldInfoLibraryImport` 不认 → 事件里没书
   - `/rp-world-info`：接住 → 解析对方 `WorldInfoConfigurationRequest`（toggle/edit/delete/set-book-enabled/reset…，格式见 world-info-configuration-types.ts）→ bookId 按迁移映射表转我们的书 → **走通用 `worldbook.operations`（协议 §4.4）实际读写我们的库** → 保证"AI 会话里改世界书"不失效
3. **（可选）`import_character_card` 剥卡书**：把卡 JSON 的 `data.character_book` 抽出导入我们库，置空后再让对方存卡。v1 建议不做（要改写卡 JSON，风险高）。

**注入侧已由通用兼容接管**：拦截后事件流为空 → 本模块 `adapter.ts` 提供的 `worldbook.source.readBooks(events)` 读空 → 通用注入引擎（`resolveSessionInjection` → `renderWorldbookInjection`）只注入本库书（全局 + 绑定书）。**不需要为 agent-rp 单独写注入管线。**

**已确认走不通**：system-prompt complete section（见 1.3）、命令无钩子、session.append 无钩子。

---

## 3. 能做到的程度

| 能力 | 程度 | 机制 |
|---|---|---|
| 世界书注入 | ✅ 完全接管（新会话） | 拦截 + 通用 source 消费 |
| 我们的全局书注入 | ✅ 照常 | 通用注入引擎（src/integration/source.ts → src/context/inject.ts） |
| AI 会话里导入世界书 | ✅ 落我们库 | tools/execute 拦截 |
| 对方客户端「导入世界书」 | ✅ 落我们库 | 命令影子 `/rp-world-info-import` |
| 角色卡内嵌书迁移 | ✅ 迁我们库 | 迁移适配器读卡书 |
| AI 会话里 toggle/edit/delete | ✅ 实际读写我们库 | 命令影子 `/rp-world-info` → `worldbook.operations` |
| characterFilter 角色过滤 | ✅ 通 | 本模块提供 `worldbook.context`，通用侧过滤 |
| 脚本（Tavern Helper）改世界书 | ✅ 读侧尊重、按名字映射 | adapter.ts 读 TavernHelperState，经 `worldbook.source` 交给通用侧注入 |

**三个漏点（必须向用户交代）：**

1. **会话启动种子**（`agent-rp/world-info-library-seed`）：对方"用世界书启动会话"界面写的，不是工具不是命令，拦不住。→ 兼容后别用它启动会话（工作流规避）。
2. **旧会话历史书**：开兼容之前事件流里已有的书，对方仍注入。→ 迁移后开新会话才干净。
3. **脚本新建并绑定的世界书（硬边界）**：Tavern Helper 脚本可**新建**书并绑定，走 `rp-tavern-variables` 命令 + 状态（tavern-helper.ts worldbooks/deletedWorldbookNames/worldbookBindings），只能读不能拦。**脚本新造的书对方仍注入。**

**设计取舍**：脚本世界书 = 对方的领地，我们完全不碰（不造书、不注入、不在读侧重复），只在读侧对齐避免行为冲突（adapter.ts 经 `worldbook.source` 把它们原样交给通用侧注入）。其余一切世界书 = 我们的领地。

**两个诚实保留：**
- 对方世界书管理面板（投影 projection.ts）列表展示它自己的书，**我们的全局书不会出现在那里**；该面板只对"迁移过的书"还有效。管理入口是我们的页面。（若对方愿意配合，可用 §5 接口 2 委托。）
- 命令影子 + tools/execute 拦截是从 DSH 源码确认机制存在，**需真机冒烟验证**（见 §6）。

---

## 4. 模块结构（规划）

```
src/integration/      ← 通用兼容（已实现，见 docs/DEVELOPMENT.md 第七章）：engine/operations 提供 + context/source 消费
src/compat/agent-rp/   ← 本模块（已实现），只做 agent-rp 专属适配
  README.md            ← 本文档
  events.ts            ← 只读解析会话事件（standalone 书 + 卡书 + TavernHelperState + 覆盖态/命令请求格式），ST 转换
  adapter.ts           ← 提供 worldbook.source：assembleSessionBooks → ST 书，跳过已迁移书、原样交脚本书
  import.ts            ← 迁移：把对方书导入本库 SQLite，维护 sourceKey ↔ bookId 映射（settings JSON）；会话活跃书（内存）
  tools.ts             ← 钩 tools/execute 拦 import_world_info：跑真实工具体 → 迁入本库 → 返回 isError
  commands.ts          ← per-agent 注册同名 /rp-world-info、/rp-world-info-import shadow；CRUD 落本库 data 层
  character.ts         ← 提供 worldbook.context：桥接对方 worldbook.characterContext（register/getCurrentCharacter）
  index.ts             ← 装配：按 agentRpCompat 开关挂载/卸载（syncAgentRpCompat）
```

开关：`agentRpCompat`（默认 false，`src/data/setting.ts`）。未开 → 上述文件全部不挂载。开启后还需通用 `compatEnabled` 开着，source/context 才会被消费（双模式闸门，见开发文档 7.1）。

---

## 5. 对方提供接口就能完美兼容（越少越好）

现状：三个漏点 + 命令影子 hack 都源于**对方没有任何"世界书被外部接管"的钩子**。若对方愿意配合，只需 **1 个必须接口 + 2 个可选**，且全部使用**我方已实现的标准协议键**（第七章，不需要新键）：

### 接口 1（必须）：对方在世界书注入入口检查 `worldbook.engine` —— 一个钩子解决全部三个漏点

- 该键我方**已经实现**（`src/integration/engine.ts`）：兼容开启时 `worldbook.engine` 存在且 `active === true`（实时反映 `compatEnabled`）。
- **对方**：`resolveSessionRoleplayRuntime`（session-roleplay-runtime.ts:75）里加一行判断：
  ```ts
  const engine = ctx.get('worldbook.engine')
  // 存在且 active 时跳过自己的世界书读取/注入
  const lorebooks = engine?.active ? [] : readActiveSessionLorebookSourcesFromEvents(events).map(...)
  ```
- **为什么这一个就够**：注入的唯一入口就是这条函数。它返回空 → 新会话、旧会话历史书、启动种子、脚本新建书**全部失效**（四个漏点一次清零），且与我们的事件解析/命令影子不冲突。
- 契约即第七章 7.3.1：只判断 `active`。可选扩展 `getBooks(events)` 让对方完全不再解析事件（更彻底，但不是必须）。

### 接口 2（可选，完美 UI）：世界书管理投影委托

想让对方世界书面板也能显示/编辑**我们的**书：对方在 `worldInfoProjection`（projection.ts:308）里检测 `worldbook.engine` 存在时，改从外部引擎取书列表——直接用我方 `worldbook.operations.listBooks()` / `getBook(name)`（该键由 `exposeOperations` 控制暴露）。不做也能用：管理入口是我们的页面。

### 接口 3（可选，数据干净）：会话启动种子检查

对方写 `world-info-library-seed` 前同样检查 `worldbook.engine?.active`，存在则不写种子，避免脏数据进事件流。不做不影响功能（种子写了也会被接口 1 变 inert）。

**结论**：对方只改 `resolveSessionRoleplayRuntime` 一处（接口 1），就能实现"我方完整接管、对方引擎全场景失效"的完美兼容；接口 2/3 是锦上添花。且接口全部落在**标准协议键**（第七章）上，将来换别的宿主插件也能复用同一套约定。

---

## 6. 需要真机验证的点

1. `agent.ctx.commands.register` 同名命令能否正确 shadow 对方全局 `/rp-world-info`（含客户端 `session.command` 路径）。
2. `tools/execute` 瀑布对 `import_world_info` 的拦截：替换结果后 `tool/result` 事件确实带 `isError:true`，且对方读不到。
3. 双方都 provide `worldbook.characterContext` 时 Cordis 谁赢——设计上保证**只有我方 provide**（对方 host 模式才 provide，默认 character 模式不 provide，不冲突）。
4. 迁移映射表：`standalone:<attachmentId>` / `character:<attachmentId>` ↔ 我们 bookId 的映射在对方 UI 编辑路径下能正确回写。
5. `worldbook.operations` 在 `exposeOperations` 开关下随保存设置即时注册/注销（通用侧已由冒烟测试覆盖，真机复核一遍即可）。

---

## 7. 版本耦合与测试

- 对方是 `0.0.0-rc.181` 私有包、频繁更新：**所有解析对方事件/状态的逻辑必须隔离在本目录适配器里**，并用冒烟测试锁事件格式（参照 scripts/worldbook-*.mjs 的写法）。
- 对方事件格式要点：`tool/result`（import_world_info，meta.raw 存 ST JSON）、`command/done`（`agent-rp-world-info-v0:` 覆盖态 / `agent-rp-world-info-library-v0:` 导入）、`agent-rp/world-info-library-seed`、`agent-rp/tavern-state` 或 `command/done` 里的 TavernHelperState。
- 通用侧（协议本身）的回归由 `worldbook-compat-smoke.mjs` 覆盖；本模块的事件解析 / 迁移映射 / source/context 桥接由 `worldbook-agentrp-smoke.mjs` 覆盖（都挂在 `npm run test:worldbook:all`）。
