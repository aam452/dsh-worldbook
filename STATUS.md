# dsh-worldbook 状态

## 一、架构健康度

- 模块：host 半（index/db/rest/data/context）+ client 半（client/worldbook-page/api/theme/slots）+ 测试脚本 6 个。
- 跨模块违规：无。数据层经 REST 供前端，注入经 agent/pre-step，职责分离。

## 二、本轮变更（从 dsh-mindlink-plugin 搬迁）

- **数据层**：`src/db/`（独立 SQLite `worldbook.db`，schema 只含 worldbooks/worldbook_entries/worldbook_timed_effects/settings）+ `src/data/worldbook.ts`（完整 ST 语义，从 MindLink 复制精简）。
- **注入引擎**：`src/context/worldbook.ts`（递归/sticky/cooldown/delay/selective/组互斥/概率/深度）+ `src/context/inject.ts`（agent/pre-step 接入，cursor 从会话事件流统计，工作区启用开关）。
- **REST**：`src/rest/index.ts` `/api/worldbook`（世界书 CRUD/导入导出/排序 + 设置开关）。
- **前端**：`src/client/worldbook-page.tsx`（从 MindLink 提取 653 行，改调 `/api/worldbook`）+ 独立 `theme.css`（补全 `--ml-*` 变量与全部 wb/wbed 样式，作用域限定 `.dsh-worldbook-root`，不依赖 MindLink）+ 独立 `api.ts`（`/api/worldbook` + 独立 `dsh-worldbook-data-changed` 事件）。
- **槽位**：`settings.section`（独立设置页）+ `mindlink.worldbook.nav`/`.settings`（宿主嵌入）+ `worldbook.host.present`（宿主在线握手）。
  - 常驻 `shell.overlay` 注册声明全部自定义槽（避免 settings.section 注销时塌缩）。
  - settings.section 按需注册：宿主在线（host.present 有注册）→ 注销 dsh 设置分区；宿主停用 → 恢复。
- **测试**：78/78 全过（smoke 23 + display 8 + inject 21 + real 5 + recur 21），复制 MindLink 测试脚本与数据。

## 三、真实环境验证

- **共存**：MindLink 开 + 世界书开 → dsh 设置无世界书分区（被 host.present 隐藏），MindLink 悬浮窗显示世界书 UI。
- **独立**：MindLink 关 + 世界书开 → dsh 设置有世界书分区，UI 完整（粉色卡片样式）。
- **注入**：`temp/测试对话.jsonl`（11 轮）逐轮核对——延迟仅第1轮强制、递归链（启动递归→递归命中2）、粘性持续2轮后结束、冷却命中→抑制→恢复、防递归、延迟递归全部正确，timed effects 自然清理为 0，注入源标记 `dsh-worldbook`。
- **已知小问题**：测试时导入了两本「注入测试世界书」（enabled 0/1 各一），非 bug。

## 四、未完成

- 主题切换（跟随 dsh / 独立主题）——已记录需求，后置。
- 世界书项目首提交（git）尚未做。
- 宿主集成文档（docs/DEVELOPMENT.md 集成章节）已写，待随首提交一并入库。
