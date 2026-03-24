import { useState, useEffect, useCallback } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import ContentArea from './ContentArea.js'
import { useSSE } from '../hooks/useSSE.js'
import type { WatchEvent } from '../../types.js'

interface Props {
  theme: 'dark' | 'light'
}

function showToast(message: string, type: 'success' | 'error') {
  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 2200)
}

const SingleFileView: FunctionalComponent<Props> = ({ theme }) => {
  const [content, setContent] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadContent = useCallback(async () => {
    try {
      const res = await fetch('/api/content')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const name = decodeURIComponent(res.headers.get('X-File-Name') || 'document.md')
      setContent(text)
      setFileName(name)
      setError(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadContent()
  }, [])

  const handleSSEEvent = useCallback((event: WatchEvent) => {
    if (event.type === 'reload') {
      const scrollTop = document.documentElement.scrollTop
      loadContent().then(() => {
        requestAnimationFrame(() => window.scrollTo(0, scrollTop))
      })
    }
  }, [loadContent])

  const connected = useSSE('/api/watch', handleSSEEvent)

  const handleSave = useCallback(async (_path: string, text: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  return (
    <div class="app-layout">
      <ContentArea
        filePath={fileName}
        content={content}
        loading={loading}
        error={error}
        theme={theme}
        onSave={handleSave}
        watchConnected={connected}
      />
    </div>
  )
}

export default SingleFileView
