import type { FunctionalComponent } from 'preact'
import { assetUrl } from '../utils/fsApi.js'

interface Props {
  filePath: string
}

const VideoViewer: FunctionalComponent<Props> = ({ filePath }) => {
  const src = assetUrl(filePath)

  return (
    <div class="video-viewer">
      <video controls src={src} />
    </div>
  )
}

export default VideoViewer
