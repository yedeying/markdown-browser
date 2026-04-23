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
 * 持久化到 .vmd-config.json 的整体配置
 */
export interface VmdConfig {
  mounts: MountConfig[]
}

export interface ServerConfig {
  mode: 'dir' | 'single' | 'multi'
  // dir / single 模式：单一路径
  basePath?: string
  // multi 模式：多挂载点
  workspace?: string           // 工作区根目录（存放 .vmd-config.json）
  mounts?: MountConfig[]       // 初始化挂载点
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
