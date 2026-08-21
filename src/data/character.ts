// 角色卡绑定兼容层（仅逻辑对齐，无角色卡实体）。
//
// 本插件没有角色卡。为兼容其它 DSH ST 插件（带角色卡的），世界书条目支持 ST 的
// characterFilter 语义：条目可声明 `characterFilter: { isExclude, names, tags }`，
// 注入时按「当前角色」过滤（对齐 ST world-info.js 4704-4731）。
//
// 「当前角色」由其它插件提供：它们注册一个 CharacterContextProvider（经 ctx.get 读取），
// 每次会话给出当前角色上下文 { name, tags }。本插件不创建角色卡实体，只消费该上下文。

export interface CharacterContext {
  /** 角色文件名（不含扩展名，对齐 ST getCharaFilename） */
  name: string
  /** 角色标签 id（对齐 ST tagMap 里该实体的 tag id 列表） */
  tags: string[]
}

export interface CharacterContextProvider {
  /** 返回某会话的当前角色上下文；无角色/无法确定时返回 undefined */
  getCurrentCharacter(sessionId: string): CharacterContext | undefined
}

// 其它插件注册此服务名的约定键（ctx.provide / ctx.get）。
export const CHARACTER_PROVIDER_KEY = 'worldbook.characterContext'

// 解析当前角色上下文：没有提供方或拿不到角色时返回 undefined（此时不做角色过滤）。
export function resolveCharacterContext(ctx: { get(name: string): unknown }, sessionId: string): CharacterContext | undefined {
  let provider: CharacterContextProvider | undefined
  try {
    provider = ctx.get(CHARACTER_PROVIDER_KEY) as CharacterContextProvider | undefined
  } catch {
    provider = undefined
  }
  if (!provider || typeof provider.getCurrentCharacter !== 'function') return undefined
  try {
    return provider.getCurrentCharacter(sessionId) ?? undefined
  } catch {
    return undefined
  }
}
