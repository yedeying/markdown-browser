import { useState, useEffect, useRef } from 'preact/hooks'
import type { SearchResult, FileNode } from '../../types.js'

export type SearchType = 'name' | 'content'

function filterByName(tree: FileNode[], query: string): SearchResult[] {
  const results: SearchResult[] = []
  function walk(nodes: FileNode[]) {
    for (const node of nodes) {
      if (node.type === 'file' && node.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({ filePath: node.path, fileName: node.name, matches: [] })
      } else if (node.type === 'folder' && node.children) {
        walk(node.children)
      }
    }
  }
  walk(tree)
  return results
}

export function useSearch(tree: FileNode[]) {
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

    if (searchType === 'name') {
      setResults(filterByName(tree, query))
      return
    }

    // 全文搜索：防抖 400ms
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=content`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [query, searchType, tree])

  return { query, setQuery, searchType, setSearchType, results, loading }
}
