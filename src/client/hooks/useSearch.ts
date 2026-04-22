import { useState, useEffect, useRef } from 'preact/hooks'
import type { SearchResult, FileNode } from '../../types.js'
import { apiFetch } from '../utils/fsApi.js'

export type SearchType = 'name' | 'content'

export function useSearch(_tree: FileNode[]) {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('name')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults(null)
      return
    }

    // 无论 name 还是 content，懒加载模式下都走服务端，以获得全量结果
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(query)}&type=${searchType}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setResults(Array.isArray(data) ? data : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [query, searchType])

  return { query, setQuery, searchType, setSearchType, results, loading }
}
