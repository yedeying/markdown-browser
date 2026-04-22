import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { FileNode } from '../../types.js'
import { apiFetch } from '../utils/fsApi.js'

/**
 * 懒加载文件树。
 * 首次加载根目录 1 层；文件夹展开时再按需 fetch 子节点。
 * tree-change SSE 事件携带 affectedPath 时只失效相关子树。
 */
export function useFileTree() {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 已加载 children 的路径集合（path='' 代表根）
  const loadedRef = useRef<Set<string>>(new Set())
  // 正在加载的路径，避免重复请求
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map())

  /** 拉取指定路径下一层 */
  const fetchLevel = useCallback(async (path: string): Promise<FileNode[]> => {
    const q = path
      ? `/api/files?path=${encodeURIComponent(path)}&depth=1`
      : `/api/files?path=&depth=1`
    const res = await apiFetch(q)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json() as FileNode[]
  }, [])

  /** 递归更新 tree：将 target path 的 children 替换为新数据 */
  const patchChildren = (nodes: FileNode[], targetPath: string, newChildren: FileNode[]): FileNode[] => {
    if (targetPath === '') return newChildren
    return nodes.map(n => {
      if (n.type !== 'folder') return n
      if (n.path === targetPath) return { ...n, children: newChildren }
      if (targetPath.startsWith(n.path + '/') && n.children) {
        return { ...n, children: patchChildren(n.children, targetPath, newChildren) }
      }
      return n
    })
  }

  /** 加载指定路径下一层并合并到 tree；已加载过则不重复 */
  const loadChildren = useCallback(async (path: string) => {
    if (loadedRef.current.has(path)) return
    const existing = inflightRef.current.get(path)
    if (existing) return existing

    const promise = (async () => {
      try {
        const children = await fetchLevel(path)
        setTree(prev => patchChildren(prev, path, children))
        loadedRef.current.add(path)
      } catch (e) {
        // 忽略单次加载失败，保留已有结构
        console.warn('loadChildren failed', path, e)
      } finally {
        inflightRef.current.delete(path)
      }
    })()
    inflightRef.current.set(path, promise)
    return promise
  }, [fetchLevel])

  /** 完整刷新（或按 affectedPath 局部失效） */
  const refresh = useCallback(async (affectedPath?: string) => {
    if (affectedPath !== undefined) {
      // 局部失效：清除当前及所有祖先的 loaded 标记，再按需重载受影响的那一层
      let cur = affectedPath
      while (true) {
        loadedRef.current.delete(cur)
        if (!cur) break
        const i = cur.lastIndexOf('/')
        cur = i === -1 ? '' : cur.slice(0, i)
      }
      // 重新加载受影响目录（若该目录是已展开的）
      try {
        const children = await fetchLevel(affectedPath)
        setTree(prev => patchChildren(prev, affectedPath, children))
        loadedRef.current.add(affectedPath)
      } catch { /* ignore */ }
      return
    }
    try {
      setLoading(true)
      const root = await fetchLevel('')
      setTree(root)
      loadedRef.current = new Set([''])
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [fetchLevel])

  useEffect(() => {
    refresh()
  }, [])

  return { tree, loading, error, refresh, loadChildren }
}
