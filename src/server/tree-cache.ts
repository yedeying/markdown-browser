/**
 * 目录树缓存（LRU + TTL）
 *
 * 作用：避免重复 readdir/stat 大目录；按 mount 分区可整体失效
 *
 * 键：`${scope}:${relativePath}` —— scope 通常是 mount alias 或 basePath
 * 值：Directory listing (FileNode[])
 */
import type { FileNode } from '../types.js'

interface Entry {
  nodes: FileNode[]
  expiresAt: number
}

export class TreeCache {
  private map = new Map<string, Entry>()
  private maxEntries: number
  private ttlMs: number

  constructor(maxEntries = 500, ttlMs = 60_000) {
    this.maxEntries = maxEntries
    this.ttlMs = ttlMs
  }

  private key(scope: string, relPath: string): string {
    return `${scope}:${relPath}`
  }

  get(scope: string, relPath: string): FileNode[] | null {
    const k = this.key(scope, relPath)
    const entry = this.map.get(k)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.map.delete(k)
      return null
    }
    // LRU：重新插入到末尾
    this.map.delete(k)
    this.map.set(k, entry)
    return entry.nodes
  }

  set(scope: string, relPath: string, nodes: FileNode[]) {
    const k = this.key(scope, relPath)
    if (this.map.has(k)) this.map.delete(k)
    this.map.set(k, { nodes, expiresAt: Date.now() + this.ttlMs })
    // 超限时淘汰最旧
    while (this.map.size > this.maxEntries) {
      const first = this.map.keys().next().value
      if (!first) break
      this.map.delete(first)
    }
  }

  /** 失效指定 scope 的全部条目 */
  invalidateScope(scope: string) {
    const prefix = `${scope}:`
    for (const key of this.map.keys()) {
      if (key.startsWith(prefix)) this.map.delete(key)
    }
  }

  /** 失效 scope 下特定路径及其所有祖先（因为祖先的子节点集发生变化） */
  invalidatePath(scope: string, relPath: string) {
    // 规范化
    let cur = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    // 失效当前及所有祖先
    while (true) {
      this.map.delete(this.key(scope, cur))
      if (!cur) break
      const i = cur.lastIndexOf('/')
      cur = i === -1 ? '' : cur.slice(0, i)
    }
  }

  clear() {
    this.map.clear()
  }

  size(): number {
    return this.map.size
  }
}

/** 全局单例（进程范围共享） */
export const treeCache = new TreeCache()
