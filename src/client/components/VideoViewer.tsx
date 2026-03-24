import type { FunctionalComponent } from 'preact'

interface Props {
  filePath: string
}

const VideoViewer: FunctionalComponent<Props> = ({ filePath }) => {
  const src = `/api/asset/${encodeURIComponent(filePath)}`

  return (
    <div class="video-viewer">
      <video controls src={src} />
    </div>
  )
}

export default VideoViewer
