/**
 * 服务端托管的状态文件
 *
 * 这些文件住在被服务的目录里，但它们是服务端状态，不是用户内容：
 * - .vmd-config.json      决定下一次启动的根目录（startupMode / singleMountAlias）
 * - .vmd-config.json.tmp  上面这个文件原子写（tmp + rename）的中间文件，
 *                         抢先写它等于改写配置
 * - .vmd-shares.json      免登录分享令牌
 *
 * 通用文件接口（读、写、改名、复制、移动、删除、列表、搜索）必须一律拒绝它们，
 * 否则任何能访问内容接口的客户端都能改写服务端行为。
 * 修改它们只能走专用入口：挂载点与启动设置走 /api/admin/*（带鉴权的父 app），
 * 分享令牌走 ShareStore。
 */

export const CONFIG_FILENAME = '.vmd-config.json'
export const SHARES_FILENAME = '.vmd-shares.json'

const RESERVED_FILENAMES = new Set([
  CONFIG_FILENAME,
  `${CONFIG_FILENAME}.tmp`,
  SHARES_FILENAME,
])

/** 大小写不敏感：macOS / Windows 上 .VMD-Config.JSON 写的是同一个文件 */
export function isReservedFilename(name: string): boolean {
  return RESERVED_FILENAMES.has(name.toLowerCase())
}

/** 路径里任意一段命中保留名就算命中（覆盖子目录里的配置文件和复制/移动的目标目录） */
export function hasReservedSegment(relPath: string): boolean {
  return relPath
    .replace(/\\/g, '/')
    .split('/')
    .some(seg => seg !== '' && isReservedFilename(seg))
}
