import { useState, useEffect } from 'preact/hooks'
import type { FileNode } from '../../types.js'
import { apiFetch } from '../utils/fsApi.js'

export function useFileTree() {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setLoading(true)
      const res = await apiFetch('/api/files')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTree(data)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return { tree, loading, error, refresh }
}
