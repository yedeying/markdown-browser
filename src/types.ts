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

export interface ServerConfig {
  mode: 'dir' | 'single'
  basePath: string     // 绝对路径
  port: number
  distPath: string     // dist/client 绝对路径
  password?: string    // 访问密码，未设置时跳过认证
  sessionMaxAge?: number  // Cookie 有效期（秒），默认 7 天
}

export interface AuthConfig {
  password: string
  signingKey: Uint8Array  // HMAC-SHA256 32 字节密钥
  maxAge: number          // Cookie 有效期（秒）
}

export type WatchEventType = 'reload' | 'tree-change' | 'ping'

export type WatchEvent =
  | { type: 'reload'; mtime: number }
  | { type: 'tree-change' }
  | { type: 'ping' }
