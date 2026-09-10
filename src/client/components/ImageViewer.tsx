import type { FunctionalComponent } from 'preact'
import { displayAssetUrl } from '../utils/fsApi.js'

interface Props {
  filePath: string
}

const ImageViewer: FunctionalComponent<Props> = ({ filePath }) => {
  const fileName = filePath.split('/').pop() || filePath
  const src = displayAssetUrl(filePath)

  return (
    <div class="image-viewer" data-testid="image-viewer">
      <img src={src} alt={fileName} title={fileName} />
    </div>
  )
}

export default ImageViewer
