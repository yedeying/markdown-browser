import type { FunctionalComponent } from 'preact'
import Icon from './Icon.js'

interface Props {
  onReload: () => void
  onDismiss: () => void
}

/**
 * 编辑模式下检测到磁盘文件被外部修改，且本地有未保存改动时展示。
 * 不会自动覆盖用户的编辑内容，需用户主动选择。
 */
const ExternalUpdateBanner: FunctionalComponent<Props> = ({ onReload, onDismiss }) => {
  return (
    <div class="external-update-banner" role="alert">
      <Icon name="file-text" size={14} aria-hidden="true" />
      <span class="external-update-banner-text">文件已在磁盘上被修改，你有未保存的编辑</span>
      <div class="external-update-banner-actions">
        <button class="btn" onClick={onReload}>加载新版本</button>
        <button class="btn" onClick={onDismiss}>忽略</button>
      </div>
    </div>
  )
}

export default ExternalUpdateBanner
