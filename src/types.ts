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
}

export type WatchEventType = 'reload' | 'tree-change' | 'ping'

export type WatchEvent =
  | { type: 'reload'; mtime: number }
  | { type: 'tree-change' }
  | { type: 'ping' }
