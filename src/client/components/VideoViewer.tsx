import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { assetUrl } from '../utils/fsApi.js'
import { downloadSingleFile } from '../utils/download.js'
import { stepPlaylistPath } from '../utils/galleryMedia.js'
import MediaToolbar from './MediaToolbar.js'
import { showToast } from './ui/Toast.js'

interface Props {
  filePath: string
  playlist?: FileNode[]
  onNavigate?: (path: string) => void
}

const VideoViewer: FunctionalComponent<Props> = ({
  filePath,
  playlist = [],
  onNavigate,
}) => {
  const fileName = filePath.split('/').pop() || filePath
  const src = assetUrl(filePath)
  const index = playlist.findIndex((node) => node.path === filePath)

  const navigateBy = (delta: number) => {
    const path = stepPlaylistPath(playlist, filePath, delta)
    if (path) onNavigate?.(path)
  }

  const copyPath = () => {
    navigator.clipboard.writeText(filePath).then(() => {
      showToast('路径已复制', 'success')
    }).catch(() => {
      showToast('复制失败', 'error')
    })
  }

  return (
    <div class="video-viewer" data-testid="video-viewer">
      <MediaToolbar
        name={fileName}
        path={filePath}
        kind="video"
        index={index >= 0 ? index : undefined}
        count={playlist.length}
        onDownload={() => downloadSingleFile(filePath)}
        onCopyPath={copyPath}
        onPrev={() => navigateBy(-1)}
        onNext={() => navigateBy(1)}
        testIdPrefix="video-viewer"
      />
      <div class="video-viewer-stage" data-testid="video-viewer-stage">
        <video controls src={src} />
      </div>
    </div>
  )
}

export default VideoViewer
