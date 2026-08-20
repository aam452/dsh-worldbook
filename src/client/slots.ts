/**
 * dsh-worldbook 槽位契约。
 *
 * 本插件向 dsh 声明两类槽：
 * - `settings.section`（dsh 官方）：插件独立存在时，世界书设置页出现在 dsh 设置侧边栏。
 * - `mindlink.worldbook.nav` / `mindlink.worldbook.settings`（自定义，由宿主插件消费）：
 *   当世界书插件被宿主（如 MindLink）集成时，宿主检测到这些槽被注入，就在自己的悬浮窗
 *   「世界书」导航位与设置页分别渲染世界书页面/卡片，而不是再开一个 dsh 设置分区。
 * - `worldbook.host.present`（宿主在线握手槽）：宿主在集成世界书后注册此槽，向世界书插件
 *   声明「我在使用你的 UI」。世界书插件据此隐藏 dsh 设置分区（避免重复），宿主停用则
 *   dsh 设置分区重新出现。
 *
 * 槽位语义：
 * - nav：宿主悬浮窗「世界书」导航位渲染的世界书管理页（完整页面）。
 * - settings：宿主设置页里的「世界书」卡片（设置对话框内嵌）。
 * - host.present：宿主集成标志（single，宿主导入）。
 * 宿主通过 ctx.slots 检查 `mindlink.worldbook.nav` / `mindlink.worldbook.settings`
 * 是否有注册条目（entriesOfSlot），有则渲染本插件页面，无则渲染宿主自身内置世界书页。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'mindlink.worldbook.nav': {
      kind: 'single'
      scope: 'root'
      owner: {}
    }
    'mindlink.worldbook.settings': {
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
}
