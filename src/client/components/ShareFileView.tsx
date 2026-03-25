import { useState, useEffect, useCallback } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import ContentArea from './ContentArea.js'
import ThemeToggle from './ThemeToggle.js'
import { useTheme } from '../hooks/useTheme.js'
import { apiFetch, getSharePrefix } from '../utils/fsApi.js'

/**
 * 单文件分享预览页
 * 无侧边栏，直接加载分享的文件内容，只读 + 下载
 */
const ShareFileView: FunctionalComponent = () => {
  const { theme, toggle } = useTheme()
  const sharePath = window.__VMD_SHARE_PATH__ || ''
  const fileName = sharePath.split('/').pop() || 'file'

  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadContent = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const prefix = getSharePrefix()
      const res = await apiFetch(`/api/file/${encodeURI(sharePath)}`)
      if (res.status === 410) {
        setError('此分享链接已过期')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      setContent(text)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [sharePath])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '36px' }}>⏰</div>
        <div style={{ fontSize: '16px', color: 'var(--text)' }}>{error}</div>
        <div style={{ fontSize: '13px' }}>请联系文件所有者重新生成分享链接</div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ContentArea
        filePath={sharePath}
        content={content}
        loading={loading}
        error={null}
        theme={theme}
        themeToggle={<ThemeToggle theme={theme} onToggle={toggle} />}
        shareMode={true}
      />
    </div>
  )
}

export default ShareFileView
