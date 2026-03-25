import { useState, useCallback, useRef } from 'preact/hooks'
import { apiFetch } from '../utils/fsApi.js'

export function useFileContent() {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)

  // 记录最近一次 self-save 的时间戳，SSE reload 在此窗口内应被忽略
  const selfSaveAt = useRef<number>(0)
  const SELF_SAVE_IGNORE_WINDOW = 2000 // ms

  const loadFile = useCallback(async (path: string, { ignoreSelfSave = false } = {}) => {
    // 如果是 SSE 触发的 reload，且距上次 self-save 不足 2s，则忽略（避免屏闪）
    if (!ignoreSelfSave && Date.now() - selfSaveAt.current < SELF_SAVE_IGNORE_WINDOW) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/file/${encodeURI(path)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setContent(text)
      setCurrentPath(path)
    } catch (e) {
      setError(String(e))
      setContent(null)
    } finally {
      setLoading(false)
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

  return { content, loading, error, currentPath, loadFile, selectFile, saveFile, setContent }
}
