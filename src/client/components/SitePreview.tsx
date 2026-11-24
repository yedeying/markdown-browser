import type { FunctionalComponent } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { siteUrl } from '../utils/fsApi.js'

interface SitePreviewProps {
  /** 文件夹相对路径，例如 docs/demo-site */
  dir: string
  /** 入口文件名，默认 index.html */
  entry?: string
  title?: string
}

/**
 * 文件夹静态站点预览：将 `<dir>/<entry>` 交给服务端 `/site/*` 托管，
 * 使用 iframe 隔离样式与脚本，页面内的相对路径资源由同前缀解析。
 */
const SitePreview: FunctionalComponent<SitePreviewProps> = ({ dir, entry = 'index.html', title }) => {
  const [nonce, setNonce] = useState(0)
  const [frameHeight, setFrameHeight] = useState<number | null>(null)

  const src = useMemo(() => {
    const base = siteUrl(dir, entry)
    return nonce ? `${base}?v=${nonce}` : base
  }, [dir, entry, nonce])

  useEffect(() => { setFrameHeight(null) }, [dir, entry])

  return (
    <div class="site-preview" data-testid="site-preview">
      <div class="site-preview-bar">
        <span class="site-preview-path" title={`${dir}/${entry}`}>
          {title || dir}
        </span>
        <span class="site-preview-actions">
          <button
            class="site-preview-btn"
            onClick={() => setNonce(n => n + 1)}
            title="重新加载网页"
            aria-label="重新加载网页"
            data-testid="site-preview-reload"
          >
            刷新
          </button>
          <a
            class="site-preview-btn"
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            title="在新标签页打开"
            data-testid="site-preview-open"
          >
            新窗口
          </a>
        </span>
      </div>
      <div class="site-preview-frame-wrap">
        <iframe
          key={`${dir}:${entry}:${nonce}`}
          class="site-preview-frame"
          src={src}
          title={title || `${dir} 网页预览`}
          data-testid="site-preview-frame"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          style={frameHeight ? { height: `${frameHeight}px` } : undefined}
          onLoad={(e) => {
            try {
              const doc = (e.currentTarget as HTMLIFrameElement).contentDocument
              const h = doc?.documentElement?.scrollHeight
              if (h && h > 200) setFrameHeight(Math.min(20000, h))
            } catch {
              /* 跨源：保持 CSS 默认高度 */
            }
          }}
        />
      </div>
    </div>
  )
}

export default SitePreview
