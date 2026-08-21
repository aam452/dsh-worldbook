/**
 * dsh-worldbook 槽位契约。
 *
 * 本插件向 dsh 声明两类槽：
 * - `settings.section`（dsh 官方）：插件独立存在时，世界书设置页出现在 dsh 设置侧边栏。
 * - `mindlink.worldbook.nav` / `mindlink.worldbook.settings-card`（自定义，由宿主插件消费）：
 *   当世界书插件被宿主（如 MindLink）集成时，宿主检测到这些槽被注入，就在自己的悬浮窗
 *   「世界书」导航位与设置页分别渲染世界书页面/设置卡片，而不是再开一个 dsh 设置分区。
 * - `worldbook.host.present`（宿主在线握手槽）：宿主在集成世界书后注册此槽，向世界书插件
 *   声明「我在使用你的 UI」。世界书插件据此隐藏 dsh 设置分区（避免重复），宿主停用则
 *   dsh 设置分区重新出现。
 *
 * 槽位语义：
 * - nav：宿主悬浮窗「世界书」导航位渲染的世界书管理页（完整页面，宿主可自行决定挂到悬浮窗或设置页）。
 * - settings-card：宿主设置页里的「世界书」设置卡片（设置对话框内嵌）。
 * - host.present：宿主集成标志（single，宿主导入）。
 * 宿主通过 ctx.slots 检查 `mindlink.worldbook.nav` / `mindlink.worldbook.settings-card`
 * 是否有注册条目（entriesOfSlot），有则渲染本插件页面，无则渲染宿主自身内置世界书页。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * dsh 官方壳层浮层槽（list/root，additive，点击穿透）。
     * 类型声明本应由 dsh-client-ui-layout 合并提供，但该项目本地未安装该包；
     * 此处按运行时 slot-catalog 补全，仅用于本地类型检查，运行时仍由官方声明。
     */
    'shell.overlay': {
      kind: 'list'
      scope: 'root'
      owner: {}
    }
    'mindlink.worldbook.nav': {
      kind: 'single'
      scope: 'root'
      owner: {}
    }
    'mindlink.worldbook.settings-card': {
      kind: 'single'
      scope: 'root'
      owner: {}
    }
    'worldbook.host.present': {
      kind: 'single'
      scope: 'root'
      owner: {}
    }
  }

  /**
   * 本插件自定义 UI 文案的 locale 命名空间。
   * 声明 key 集合后，register 时中英词典 key 必须完全一致（类型检查保证）。
   */
  interface LocaleNamespaceMap {
    'dsh.worldbook': 'settings.section.title'
  }
}

/**
 * dsh-client-locale 提供的 `ctx.locale` 服务声明，以及 cordis 的 `ctx.effect`
 * 生命周期 API（该包未安装到本地 node_modules / fiber 合并未在 Bundler 模式下
 * 生效，此处按运行时 LocaleRuntime 与 Fiber.effect 的最小可用子集补全，仅用于
 * 本地类型检查）。
 */
declare module '@deepseek-ai/cordis' {
  interface Context {
    locale: {
      register(ns: string, dicts: Record<string, Record<string, string>>): () => void
      bind(ns: string): (key: string, params?: Record<string, unknown>) => string
    }
    effect(execute: () => (() => void) | Iterable<() => void>, label?: string): () => void
  }
}
