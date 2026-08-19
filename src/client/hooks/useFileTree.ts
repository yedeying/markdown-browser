import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { FileNode } from '../../types.js'
import { apiFetch, withHidden } from '../utils/fsApi.js'

/**
 * 懒加载文件树。
 * 首次加载根目录 1 层；文件夹展开时再按需 fetch 子节点。
 * tree-change SSE 事件携带 affectedPath 时只失效相关子树。
 *
 * showHidden 变化时整棵树重新拉取：服务端默认不返回点文件，
 * 光靠客户端过滤是拿不到隐藏节点的。
 */
export function useFileTree(showHidden = false) {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 子层加载失败的路径 → 错误信息（用于文件夹视图显示错误与重试，而不是永久骨架屏）
  const [childErrors, setChildErrors] = useState<Record<string, string>>({})
  // 已加载 children 的路径集合（path='' 代表根）
  const loadedRef = useRef<Set<string>>(new Set())
  // 正在加载的路径，避免重复请求
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map())

  /** 拉取指定路径下一层 */
  const fetchLevel = useCallback(async (path: string): Promise<FileNode[]> => {
    const q = path
      ? `/api/files?path=${encodeURIComponent(path)}&depth=1`
      : `/api/files?path=&depth=1`
    const res = await apiFetch(withHidden(q, showHidden))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json() as FileNode[]
  }, [showHidden])

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

  /**
   * 加载指定路径下一层并合并到 tree；已加载过则不重复。
   * force=true 用于失败后的手动重试。
   */
  const loadChildren = useCallback(async (path: string, force = false) => {
    if (!force && loadedRef.current.has(path)) return
    const existing = inflightRef.current.get(path)
    if (existing) return existing

    const promise = (async () => {
      try {
        const children = await fetchLevel(path)
        setTree(prev => patchChildren(prev, path, children))
        loadedRef.current.add(path)
        setChildErrors(prev => {
          if (!(path in prev)) return prev
          const next = { ...prev }
          delete next[path]
          return next
        })
      } catch (e) {
        // 保留已有结构，但记录错误：调用方（文件夹视图）据此显示错误与重试入口
        setChildErrors(prev => ({ ...prev, [path]: String(e) }))
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
      setChildErrors({})
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [fetchLevel])

  useEffect(() => {
    refresh()
  }, [showHidden])

  return { tree, loading, error, childErrors, refresh, loadChildren }
}
