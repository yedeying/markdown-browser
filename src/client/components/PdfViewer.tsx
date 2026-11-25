import type { FunctionalComponent } from 'preact'
import { assetUrl } from '../utils/fsApi.js'
import { downloadSingleFile } from '../utils/download.js'
import Icon from './ui/Icon.js'
import { showToast } from './ui/Toast.js'

interface Props {
  filePath: string
  compact?: boolean
}

const PdfViewer: FunctionalComponent<Props> = ({ filePath, compact = false }) => {
  const fileName = filePath.split('/').pop() || filePath
  const src = assetUrl(filePath)

  const copyPath = () => {
    navigator.clipboard.writeText(filePath).then(() => {
      showToast('路径已复制', 'success')
    }).catch(() => {
      showToast('复制失败', 'error')
    })
  }

  return (
    <div
      class={`pdf-viewer${compact ? ' is-compact' : ''}`}
      data-testid="pdf-viewer"
    >
      {!compact && (
        <div class="media-toolbar pdf-viewer-toolbar">
          <div class="media-toolbar-title" title={filePath}>
            <span class="media-toolbar-name">{fileName}</span>
          </div>
          <div class="media-toolbar-actions">
            <a
              class="btn media-toolbar-btn"
              data-testid="pdf-viewer-open-external"
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="在新标签页打开"
              title="在新标签页打开"
            >
              <Icon name="external-link" size={18} aria-hidden="true" />
            </a>
            <button
              type="button"
              class="btn media-toolbar-btn"
              data-testid="pdf-viewer-download"
              aria-label="下载"
              title="下载"
              onClick={() => downloadSingleFile(filePath)}
            >
              <Icon name="download" size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              class="btn media-toolbar-btn"
              data-testid="pdf-viewer-copy-path"
              aria-label="复制路径"
              title={filePath}
              onClick={copyPath}
            >
              <Icon name="copy" size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div class="pdf-viewer-stage">
        <iframe
          key={filePath}
          class="pdf-viewer-frame"
          data-testid="pdf-viewer-frame"
          src={src}
          title={fileName}
        />
      </div>
    </div>
  )
}

export default PdfViewer
