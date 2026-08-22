# dsh-worldbook

[English](README.en.md) | **简体中文**

这是一个DeepSeek Harness的世界书插件。
---

## 这个项目能干嘛

- **用世界书**：新建、导入、编辑、导出世界书，并且有注入机制，给 AI 挂一套背景设定。
- **兼容 SillyTavern**：SillyTavern 的世界书 JSON 可以直接导入用，语义和注入行为也对齐。
- **让 AI 自己维护设定**：开启「开发世界书模式」后，AI 能自己新建世界书、增删改条目，适合做角色扮演/创作类工作区。

## 说明

本插件把 SillyTavern 的世界书搬到 DSH 里，并在此基础上补了两个很实用的能力：**让 AI 自己写世界书**、**编写的权限设置**。

目前仅开发了pc端ui，未进行移动端ui适配

DeepSeek Harness版本：**0.1.0-rc.8**。其它版本未测试

## 主要特点

| 特点 | 说明 |
| --- | --- |
| 🗂️ 兼容 SillyTavern 世界书 | 导入/导出 ST JSON，字段与注入语义全对齐，较完整的注入系统 |
| 🤖 世界书开发模式 | 让 AI 自己编写世界书，可配置增/删/改/查权限，也可设置ai能够编辑哪一本世界书 |
| 🎨 界面主题 | 可跟随 DSH 主题，也可用独立的粉色主题 |
| 🧩 可集成 | 世界书管理页和设置卡片都能嵌进你自己的插件里 |

---

## 安装与更新

> 前置：Node.js ≥ 22.18，并安装 pnpm（`dsh plugin` 会把参数转发给 pnpm 执行）。插件数据（SQLite 世界书库）统一存放在 `~/.dsh/worldbook/`，两种方式安装后一致。

### 方式一：dsh 官方命令安装（推荐）

如果本机已全局安装 `dsh` CLI，直接：

```bash
dsh plugin --profile web add github:aam452/dsh-worldbook
```

- 更新插件：

```bash
dsh plugin --profile web update dsh-worldbook
```

- 卸载插件

```bash
dsh plugin --profile web remove dsh-worldbook
```

### 方式二：脚本安装

本地开发时用，`link:` 会指向本地项目目录，改代码 `npm run build` 后实时生效，无需提交/发布即可验证。

**命令行方式：**

```bash
git clone https://github.com/aam452/dsh-worldbook
cd dsh-worldbook
powershell -ExecutionPolicy Bypass -File .\link-install.ps1 web -Method 1
```

**双击脚本方式：**

1. 下载项目到本地，进入 `dsh-worldbook` 目录。
2. 双击 `link-install.ps1`（Windows 会提示选择打开方式，选 PowerShell）。
3. 按提示输入即可；

>可选软连接安装：非常适合二次开发的安装方式



### 方式三：npx安装

也可以不依赖全局安装，用 `npx` 拉取最新版 CLI：

```bash
npx -p @deepseek-ai/dsh@latest dsh plugin --profile web add github:aam452/dsh-worldbook
npx -p @deepseek-ai/dsh@latest dsh --profile web
```



---

## 快速上手

1. **启用**：在 DSH 设置 → 插件里启用本插件。
2. **建书**：打开「世界书」页面，新建一本，或直接导入 SillyTavern 世界书 JSON。
3. **编辑条目**：选中世界书，新增条目，填关键词和内容。

> 设置页里有「启用开关」「生效工作区」「主题」「注入时机」「开发世界书模式」等选项，按需调整即可。



### 仿照 SillyTavern 世界书的注入行为实行

按注入引擎的真实实现（`src/context/`），这里分两类说明：**已实现真实注入** 与 **仅兼容格式（存取/导入导出，暂不影响注入）**。

#### 已实现真实注入

| 行为 | 说明 |
| --- | --- |
| 关键词触发 | 命中主关键词（子串 / 整词 / 正则）即注入 |
| 选择性 | 命中主键后，再按副关键词的组合逻辑（selectiveLogic）过滤 |
| 常驻注入 | `constant` 条目无条件始终注入 |
| 延迟 delay | 会话刚开始的若干条消息内强制注入 |
| 粘性 sticky | 命中后若干条消息内强制注入 |
| 冷却 cooldown | 命中后若干条消息内不再注入 |
| 概率 probability | 命中后按百分比决定本次是否注入 |
| 递归扫描 | 已注入内容里的关键词，可继续触发其它条目（最多 5 层） |
| 递归控制 | `excludeRecursion`（递归轮跳过）/ `preventRecursion`（内容不进递归缓冲）/ `delayUntilRecursion` |
| 组互斥 | 同一分组（`group`）内按 order 取一条，`groupOverride` 可强制覆盖 |
| 位置 / 排序 | 按 position 分组、组内按 order 排序后注入 |
| @D 深度插入 | `position=@D` 的条目按深度插到聊天指定位置（同深度合并为一条） |

> 注入相关的时间游标对齐 ST 的 `chat.length`（只按真实对话消息推进），保证跨轮行为（粘性/冷却/延迟）与 SillyTavern 一致。

#### 仅兼容格式（存取 / 导入导出，暂无真实注入逻辑）

以下字段可以正常导入、编辑、导出、往返保留，但**当前不参与注入判定**：

| 字段 | 说明 |
| --- | --- |
| `vectorized` | 无真实向量检索，目前当作常驻处理 |
| `groupWeight` | 存取保留；组互斥只按 `order`，不用组权重 |
| `scanDepth`（条目级） | 存取保留；实际扫描范围用固定深度（最近 2 条），条目级不生效 |
| `role` | 存取保留；@D 条目的深度插入生效，但消息角色统一为「用户」 |
| `outletName` / `automationId` / `triggers` / `matchPersonaDescription` 等 | 存取保留，无注入逻辑 |

另外两个说明：

- `characterFilter`（条目级角色过滤）已有真实注入逻辑：仅当宿主提供「当前角色」上下文（`worldbook.characterContext`，角色卡绑定兼容层）时生效；无角色上下文时不做过滤，全部注入。
- 非 @D 的 `位置` 只影响**注入顺序**（消息内部排序），不会像 ST 那样把内容放到不同的提示区域（角色定义 / 示例消息 / 作者注释等）；普通位置条目统一追加在上下文末尾。

---

## 二次开发 / 集成

如果你不满足于直接用，可以：

- **给插件加功能 / 改注入逻辑 / 扩展数据模型**；
- **把世界书 UI 集成进你自己的插件**：世界书管理页 + 插件设置卡片，通过 DSH 槽位对接；
- **只用它的能力**：直接调用注入引擎，或走 REST API 读写世界书。

详细说明见 **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**。

---

## 设置项一览

在插件的「设置」里可以配置：

| 配置 | 说明 |
| --- | --- |
| 启用开关 | 关闭后世界书不再注入 |
| 生效工作区 | 选择dsh的工作区，全部工作区 / 仅指定工作区 |
| 主题 | 跟随 DSH 主题 / 独立粉色主题 |
| 注入时机 | 正文注入（默认）/ 每轮注入（不推荐，可能重复） |
| 开发世界书模式 | 开启后向 AI 暴露世界书编辑工具 |
| AI 权限 | 控制 AI 能增 / 删 / 改 / 查哪些操作 |

---

## 已知限制

- 本插件仅为世界书插件，没有"角色卡"的概念，不能绑定角色卡
- 与其它世界书插件同时启用时注意配置，不要同时开启同一本世界书，否则会导致重复注入。不建议同时开启其它世界书插件/功能
- 开发模式下，AI的世界书编辑区域/权限目前是**书级**的（以一本世界书为单位进行管理），未实现**条目级**权限控制。
- 未配置开发世界书的提示词，用开发功能开发世界书时建议先行配置，可自写或导入"写世界书的世界书"约束字段的使用场景，并进行书写指导，如"世界书条目统一用不可递归"等作为提示词。
- 开发世界书模式下，AI 的编辑范围受「开发模式」与「AI 权限」约束，属安全设计。

---

## 开发 / 构建

```bash
npm install
npm run build        # 构建 host 半 + client 半
npm run typecheck    # 类型检查
npm run test:worldbook  # 核心逻辑冒烟测试
```

技术栈：TypeScript / Cordis / React，数据存独立 SQLite。

---

## 协议

[MIT](LICENSE)

---

## 致谢

SillyTavern 的世界书（World Info）语义是本项目行为对齐的参照。
