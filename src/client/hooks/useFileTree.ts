import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import type { FileNode } from '../../types.js'
import { apiFetch, withHidden } from '../utils/fsApi.js'
import { clientPerfLog, clientPerfTimed } from '../utils/perfLog.js'
import { patchChildren } from '../utils/treePatch.js'

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
  /** 每路径世代：晚到的响应不得写回 tree（含与 refresh 并行） */
  const fetchGenRef = useRef<Map<string, number>>(new Map())

  /** 拉取指定路径下一层 */
  const fetchLevel = useCallback(async (path: string): Promise<FileNode[]> => {
    const t0 = performance.now()
    const q = path
      ? `/api/files?path=${encodeURIComponent(path)}&depth=1`
      : `/api/files?path=&depth=1`
    const res = await apiFetch(withHidden(q, showHidden))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as FileNode[]
    clientPerfTimed('fetchLevel', performance.now() - t0, {
      path: path || '(root)',
      nodes: data.length,
    })
    return data
  }, [showHidden])

  const bumpGen = (path: string): number => {
    const gen = (fetchGenRef.current.get(path) ?? 0) + 1
    fetchGenRef.current.set(path, gen)
    return gen
  }

  /**
   * 加载指定路径下一层并合并到 tree；已加载过则不重复。
   * force=true 用于 mkdir/touch/失败重试：使在飞请求过期并重新拉取。
   */
  const loadChildren = useCallback(async (path: string, force = false) => {
    if (!force && loadedRef.current.has(path)) return

    const existing = inflightRef.current.get(path)
    if (existing) {
      await existing
      if (!force) return
      // force：并入的请求可能是 mutation 前的空列表；结束后若仍无在飞则再拉一次
      const again = inflightRef.current.get(path)
      if (again) return again
    } else if (!force && loadedRef.current.has(path)) {
      return
    }

    // 先抬世代，再启动 fetch：任何在飞的旧请求完成时都会被丢弃
    const gen = bumpGen(path)

    const promise = (async () => {
      const t0 = performance.now()
      clientPerfLog('loadChildren:start', { path: path || '(root)', force, gen })
      try {
        const children = await fetchLevel(path)
        if (fetchGenRef.current.get(path) !== gen) {
          clientPerfLog('loadChildren:stale', { path: path || '(root)', gen })
          return
        }
        setTree(prev => patchChildren(prev, path, children))
        loadedRef.current.add(path)
        setChildErrors(prev => {
          if (!(path in prev)) return prev
          const next = { ...prev }
          delete next[path]
          return next
        })
        clientPerfTimed('loadChildren:done', performance.now() - t0, {
          path: path || '(root)',
          children: children.length,
        })
      } catch (e) {
        if (fetchGenRef.current.get(path) !== gen) return
        // 保留已有结构，但记录错误：调用方（文件夹视图）据此显示错误与重试入口
        setChildErrors(prev => ({ ...prev, [path]: String(e) }))
        clientPerfLog('loadChildren:error', { path: path || '(root)', error: String(e) })
      } finally {
        if (inflightRef.current.get(path) === promise) {
          inflightRef.current.delete(path)
        }
      }
    })()
    inflightRef.current.set(path, promise)
    return promise
  }, [fetchLevel])

  /** 完整刷新（或按 affectedPath 局部失效） */
  const refresh = useCallback(async (affectedPath?: string) => {
    if (affectedPath !== undefined) {
      // 从未展开过的目录不必拉取——否则 watch 噪音会打爆 /api/files。
      // 若 affected 自身未加载，改刷最近已加载祖先（上传嵌套目录时常见）。
      let reloadPath = affectedPath
      let shouldReload = loadedRef.current.has(affectedPath)
      if (!shouldReload) {
        let cur = affectedPath
        while (true) {
          if (!cur) {
            if (loadedRef.current.has('')) {
              reloadPath = ''
              shouldReload = true
            }
            break
          }
          const i = cur.lastIndexOf('/')
          cur = i === -1 ? '' : cur.slice(0, i)
          if (loadedRef.current.has(cur)) {
            reloadPath = cur
            shouldReload = true
            break
          }
        }
      }
      let cur = affectedPath
      while (true) {
        loadedRef.current.delete(cur)
        if (!cur) break
        const i = cur.lastIndexOf('/')
        cur = i === -1 ? '' : cur.slice(0, i)
      }
      if (!shouldReload) {
        clientPerfLog('refresh:skip-unloaded', { path: affectedPath || '(root)' })
        return
      }
      // 与 mkdir/touch 后的 force loadChildren 共用通道，避免并行 bumpGen 互标 stale
      await loadChildren(reloadPath, true)
      return
    }
    const gen = bumpGen('')
    try {
      setLoading(true)
      const root = await fetchLevel('')
      if (fetchGenRef.current.get('') !== gen) return
      // 全量根刷新：不保留旧子树（showHidden 切换等）
      setTree(root)
      loadedRef.current = new Set([''])
      setChildErrors({})
      setError(null)
    } catch (e) {
      if (fetchGenRef.current.get('') !== gen) return
      setError(String(e))
    } finally {
      if (fetchGenRef.current.get('') === gen) setLoading(false)
    }
  }, [fetchLevel, loadChildren])

  useEffect(() => {
    refresh()
  }, [showHidden])

  /**
   * 深链：按层加载祖先目录，使 path 出现在 tree 中。
   * includeSelf=true 时再加载 path 自身（文件夹视图需要 children）。
   */
  const ensurePathLoaded = useCallback(async (fullPath: string, includeSelf: boolean) => {
    const parts = fullPath.split('/').filter(Boolean)
    await loadChildren('')
    const last = includeSelf ? parts.length : Math.max(0, parts.length - 1)
    for (let i = 0; i < last; i++) {
      await loadChildren(parts.slice(0, i + 1).join('/'))
    }
  }, [loadChildren])

  return { tree, loading, error, childErrors, refresh, loadChildren, ensurePathLoaded }
}
