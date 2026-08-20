export interface FileNode {
  name: string
  type: 'file' | 'folder'
  path: string       // 相对于 basePath
  size?: string      // "12.3K"
  children?: FileNode[]
}

export interface SearchMatch {
  lineNumber: number
  lineContent: string  // 截断至 120 字符
}

export interface SearchResult {
  filePath: string
  fileName: string
  matches: SearchMatch[]
}

/**
 * 单个挂载点配置
 * alias: URL 标识符，仅允许 [a-zA-Z0-9_-]
 * path:  宿主机或容器内绝对路径
 */
export interface MountConfig {
  alias: string
  name: string
  path: string
  readonly?: boolean
}

/**
 * 启动时使用的挂载形态
 * dir:   单目录（配合 singleMountAlias 指向某个挂载点）
 * multi: 多挂载工作区
 */
export type StartupMode = 'dir' | 'multi'

/**
 * 持久化到 .vmd-config.json 的整体配置
 * startupMode / singleMountAlias 为后续新增字段，缺失时按命令行参数推断。
 */
export interface VmdConfig {
  startupMode?: StartupMode
  singleMountAlias?: string
  mounts: MountConfig[]
}

/**
 * GET /api/admin/settings 的响应：当前运行形态 + 下次启动使用的挂载设置
 */
export interface AdminSettings {
  /** 当前进程正在以哪种形态运行 */
  mode: 'dir' | 'multi'
  /** 下次启动使用的模式；配置里没写时等于 mode（仍由命令行参数决定） */
  startupMode: StartupMode
  /** startupMode 是否真的写在配置文件里 */
  startupModePersisted: boolean
  /** dir 启动模式的目标挂载点 */
  singleMountAlias?: string
  /** 配置里已登记的挂载点（path 已解析为绝对路径） */
  mounts: MountConfig[]
  /**
   * 配置里存在、但校验不通过因此不可选的条目数量（为 0 时省略）。
   * 这些条目仍留在文件里，保存时会原样带回去。
   */
  invalidMountEntries?: number
  /** 当前服务的根目录：dir 的 basePath 或 multi 的 workspace */
  root: string
  /** .vmd-config.json 的完整路径 */
  configPath: string
}

export interface ServerConfig {
  mode: 'dir' | 'single' | 'multi'
  // dir / single 模式：单一路径
  basePath?: string
  // multi 模式：多挂载点
  workspace?: string           // 工作区根目录（存放 .vmd-config.json）
  mounts?: MountConfig[]       // 初始化挂载点
  /**
   * .vmd-config.json 所在目录。dir 模式下 basePath 可能是配置里选中的挂载点，
   * 与配置目录不是同一个路径，写回启动设置必须用这里的值。
   */
  configDir?: string
  port: number
  host: string
  distPath: string
  password?: string
  sessionMaxAge?: number        // Cookie 有效期（秒），默认 7 天
}

export interface AuthConfig {
  password: string
  signingKey: Uint8Array
  maxAge: number
}

export interface ShareToken {
  token: string
  path: string           // 相对于 basePath
  type: 'file' | 'folder'
  expiresAt: number | null  // null = 永久
  createdAt: number
}

export type WatchEventType = 'reload' | 'tree-change' | 'ping'

export type WatchEvent =
  | { type: 'reload'; mtime: number }
  | { type: 'tree-change'; affectedPath?: string }
  | { type: 'ping' }
