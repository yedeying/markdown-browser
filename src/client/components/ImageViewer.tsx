import type { FunctionalComponent } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { FileNode } from '../../types.js'
import { displayAssetUrl } from '../utils/fsApi.js'
import { downloadSingleFile } from '../utils/download.js'
import {
  fitScale,
  resetTransform,
  rotateLeft,
  rotateRight,
  zoomIn,
  zoomOut,
} from '../utils/imageTransform.js'
import { stepPlaylistPath } from '../utils/galleryMedia.js'
import MediaToolbar from './MediaToolbar.js'
import { showToast } from './ui/Toast.js'

interface Props {
  filePath: string
  playlist?: FileNode[]
  onNavigate?: (path: string) => void
}

const ImageViewer: FunctionalComponent<Props> = ({
  filePath,
  playlist = [],
  onNavigate,
}) => {
  const fileName = filePath.split('/').pop() || filePath
  const src = displayAssetUrl(filePath)
  const [scale, setScale] = useState(1)
  const [rotateDeg, setRotateDeg] = useState(0)
  const index = playlist.findIndex((node) => node.path === filePath)

  useEffect(() => {
    const transform = resetTransform()
    setScale(transform.scale)
    setRotateDeg(transform.rotateDeg)
  }, [filePath])

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

  const handleWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setScale((value) => event.deltaY < 0 ? zoomIn(value) : zoomOut(value))
  }

  return (
    <div class="image-viewer" data-testid="image-viewer">
      <MediaToolbar
        name={fileName}
        path={filePath}
        kind="image"
        index={index >= 0 ? index : undefined}
        count={playlist.length}
        onDownload={() => downloadSingleFile(filePath)}
        onCopyPath={copyPath}
        onZoomIn={() => setScale(zoomIn)}
        onZoomOut={() => setScale(zoomOut)}
        onZoomFit={() => setScale(fitScale())}
        onRotateLeft={() => setRotateDeg(rotateLeft)}
        onRotateRight={() => setRotateDeg(rotateRight)}
        onPrev={() => navigateBy(-1)}
        onNext={() => navigateBy(1)}
        testIdPrefix="image-viewer"
      />
      <div
        class="image-viewer-stage"
        data-testid="image-viewer-stage"
        onWheel={handleWheel}
      >
        <img
          class={rotateDeg % 180 !== 0 ? 'is-quarter-turn' : undefined}
          src={src}
          alt={fileName}
          title={fileName}
          style={{
            transform: `rotate(${rotateDeg}deg) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />
      </div>
    </div>
  )
}

export default ImageViewer
