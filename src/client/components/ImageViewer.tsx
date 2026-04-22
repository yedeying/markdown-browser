import type { FunctionalComponent } from 'preact'
import { assetUrl } from '../utils/fsApi.js'

interface Props {
  filePath: string
}

const ImageViewer: FunctionalComponent<Props> = ({ filePath }) => {
  const fileName = filePath.split('/').pop() || filePath
  const src = assetUrl(filePath)

  return (
    <div class="image-viewer">
      <img src={src} alt={fileName} title={fileName} />
    </div>
  )
}

export default ImageViewer
