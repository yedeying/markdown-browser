import { useState, useCallback, useRef } from 'preact/hooks'
import { apiFetch } from '../utils/fsApi.js'
import { getFileType } from '../utils/fileType.js'
import { clientPerfLog, clientPerfTimed } from '../utils/perfLog.js'

export function useFileContent() {
  const [content, setContent] = useState<string | null>(null)
  /** 当前 content 对应的路径；与 currentPath 不一致时表示内容尚未就绪（勿渲染旧文） */
  const [loadedPath, setLoadedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)

  // 记录最近一次 self-save 的时间戳，SSE reload 在此窗口内应被忽略
  const selfSaveAt = useRef<number>(0)
  const SELF_SAVE_IGNORE_WINDOW = 2000 // ms

  /** 递增世代：快速连点时只让「最后一次」请求落地，避免光标/内容往复 */
  const loadGenRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const contentRef = useRef<string | null>(content)
  contentRef.current = content
  const loadedPathRef = useRef<string | null>(loadedPath)
  loadedPathRef.current = loadedPath

  /**
   * 返回值：是否真的触发了内容更新（false = 被 self-save 抑制，或静默重载时内容无变化）。
   * silent=true 用于 SSE 热更新/重连校验：不闪烁 loading 态，且字节完全一致时不触发 state 更新。
   */
  const loadFile = useCallback(async (
    path: string,
    { ignoreSelfSave = false, silent = false } = {},
  ): Promise<boolean> => {
    // 如果是 SSE 触发的 reload，且距上次 self-save 不足 2s，则忽略（避免屏闪）
    if (!ignoreSelfSave && Date.now() - selfSaveAt.current < SELF_SAVE_IGNORE_WINDOW) {
      return false
    }

    const gen = ++loadGenRef.current
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    // 实时光标：路径立刻切换，不等网络；过期响应不得回写
    if (!silent) {
      setCurrentPath(path)
      setError(null)
    }

    // 图片/视频/PDF 等二进制类型不走文本内容拉取
    const ft = getFileType(path)
    if (ft === 'image' || ft === 'video' || ft === 'pdf') {
      if (gen !== loadGenRef.current) return false
      if (silent && loadedPathRef.current === path) return false
      setContent('')
      setLoadedPath(path)
      setLoading(false)
      return true
    }

    if (!silent) setLoading(true)
    const t0 = performance.now()
    clientPerfLog('loadFile:start', { path, silent })
    try {
      const res = await apiFetch(`/api/file/${encodeURI(path)}`, { signal: ac.signal })
      if (gen !== loadGenRef.current) return false
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (gen !== loadGenRef.current) return false
      // 静默重载且内容字节完全一致：跳过 state 写入，避免重连触发无意义的刷新/闪动
      if (silent && loadedPathRef.current === path && contentRef.current === text) {
        return false
      }
      setContent(text)
      setLoadedPath(path)
      setCurrentPath(path)
      clientPerfTimed('loadFile:ok', performance.now() - t0, { path, bytes: text.length, silent })
      return true
    } catch (e) {
      if (gen !== loadGenRef.current) return false
      if (e instanceof DOMException && e.name === 'AbortError') return false
      if (silent) return false
      setError(String(e))
      setContent(null)
      setLoadedPath(null)
      clientPerfTimed('loadFile:err', performance.now() - t0, { path, error: String(e) })
      return false
    } finally {
      if (!silent && gen === loadGenRef.current) setLoading(false)
    }
  }, [])

  // 主动加载（文件选择、导航等），强制忽略 self-save 窗口
  const selectFile = useCallback((path: string) => {
    return loadFile(path, { ignoreSelfSave: true })
  }, [loadFile])

  const saveFile = useCallback(async (path: string, text: string): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/save/${encodeURI(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      if (res.ok) {
        // 标记 self-save 时间，2s 内的 SSE reload 事件将被忽略
        selfSaveAt.current = Date.now()
      }
      return res.ok
    } catch {
      return false
    }
  }, [])

  const setContentForPath = useCallback((path: string, text: string) => {
    setContent(text)
    setLoadedPath(path)
  }, [])

  return {
    content,
    loadedPath,
    loading,
    error,
    currentPath,
    loadFile,
    selectFile,
    saveFile,
    setContent,
    setContentForPath,
  }
}
