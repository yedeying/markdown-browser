import { useState, useCallback } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import { fsApi } from '../utils/fsApi.js'

interface Props {
  path: string
  type: 'file' | 'folder'
  name: string
  onClose: () => void
}

const TTL_OPTIONS = [
  { label: '1 天', value: 86400 },
  { label: '7 天', value: 86400 * 7 },
  { label: '30 天', value: 86400 * 30 },
  { label: '永久', value: null },
]

const ShareDialog: FunctionalComponent<Props> = ({ path, type, name, onClose }) => {
  const [ttl, setTtl] = useState<number | null>(86400 * 7)
  const [creating, setCreating] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = useCallback(async () => {
    setCreating(true)
    setError(null)
    const res = await fsApi.createShare(path, type, ttl)
    setCreating(false)
    if (res.ok) {
      setShareUrl(res.url)
      setShareToken(res.token)
    } else {
      setError(res.error || '生成失败')
    }
  }, [path, type, ttl])

  const handleCopy = useCallback(() => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [shareUrl])

  const handleDelete = useCallback(async () => {
    if (!shareToken) return
    setDeleting(true)
    await fsApi.deleteShare(shareToken)
    setDeleting(false)
    setShareUrl(null)
    setShareToken(null)
  }, [shareToken])

  const icon = type === 'folder' ? '📁' : '📄'

  return (
    <div class="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog-box share-dialog">
        <div class="dialog-header">
          <span class="dialog-title">分享 {icon} {name}</span>
          <button class="dialog-close" onClick={onClose}>✕</button>
        </div>

        {!shareUrl ? (
          <div class="dialog-body">
            <div class="share-ttl-label">有效期</div>
            <div class="share-ttl-group">
              {TTL_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  class={`share-ttl-btn${ttl === opt.value ? ' active' : ''}`}
                  onClick={() => setTtl(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {type === 'folder' && (
              <div class="share-note">
                访客可浏览、预览文件，并新建文件（不可编辑或删除已有文件）
              </div>
            )}
            {type === 'file' && (
              <div class="share-note">
                访客可预览和下载此文件
              </div>
            )}
            {error && <div class="share-error">{error}</div>}
            <div class="dialog-footer">
              <button class="btn" onClick={onClose}>取消</button>
              <button class="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? '生成中...' : '生成链接'}
              </button>
            </div>
          </div>
        ) : (
          <div class="dialog-body">
            <div class="share-url-label">分享链接</div>
            <div class="share-url-row">
              <input class="share-url-input" value={shareUrl} readOnly onClick={(e) => (e.target as HTMLInputElement).select()} />
              <button class="btn btn-primary share-copy-btn" onClick={handleCopy}>
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            {ttl && (
              <div class="share-expire-hint">
                有效期：{TTL_OPTIONS.find(o => o.value === ttl)?.label}
              </div>
            )}
            <div class="dialog-footer">
              <button class="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? '撤销中...' : '撤销链接'}
              </button>
              <button class="btn btn-primary" onClick={onClose}>完成</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ShareDialog
