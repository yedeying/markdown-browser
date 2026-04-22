import { useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import type { SelectionProps } from './FolderView.js'
import { assetUrl } from '../utils/fsApi.js'

function getNodeIcon(node: FileNode): string {
  if (node.type === 'folder') return '📁'
  switch (getFileType(node.name)) {
    case 'markdown': return '📝'
    case 'image':    return '🖼'
    case 'video':    return '🎬'
    case 'code':     return '📄'
    case 'text':     return '📃'
    default:         return '📎'
  }
}

interface Props {
  node: FileNode
  thumbSize: number
  /** 是否为"当前打开文件"（高亮） */
  selected: boolean
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
}

const FolderCard: FunctionalComponent<Props> = ({
  node,
  thumbSize,
  selected,
  onSelect,
  selectionProps,
}) => {
  const {
    selectedPaths,
    selectionMode,
    onToggleSelect,
    onEnterSelectionMode,
    onContextMenu,
    onLongPress,
  } = selectionProps

  const [imgError, setImgError] = useState(false)
  const isImage = node.type === 'file' && getFileType(node.name) === 'image'
  const showThumb = isImage && !imgError
  const isChecked = selectedPaths.has(node.path)

  const makeLongPress = useLongPress<FileNode>({ onLongPress })
  const lpHandlers = makeLongPress(node)

  const handleClick = (e: MouseEvent) => {
    if (selectionMode) {
      onToggleSelect(node.path, e)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      onEnterSelectionMode(node.path)
      return
    }
    onSelect(node)
  }

  return (
    <div
      class={`folder-card ${selected ? 'active' : ''} ${isChecked ? 'selected' : ''}`}
      style={{ '--thumb-size': `${thumbSize}px` } as Record<string, string>}
      onClick={handleClick}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(node, e as MouseEvent) }}
      {...lpHandlers}
      title={node.name}
    >
      {/* Checkbox 角标（选择模式或 hover 时显示） */}
      <div
        class={`card-checkbox-wrap ${isChecked ? 'checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(node.path, e as MouseEvent) }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => {/* controlled */}}
        />
      </div>

      <div
        class="folder-card-thumb"
        style={{ width: `${thumbSize}px`, height: `${thumbSize}px` }}
      >
        {showThumb ? (
          <img
            src={assetUrl(node.path)}
            alt={node.name}
            onError={() => setImgError(true)}
          />
        ) : (
          <span class="folder-card-icon">{getNodeIcon(node)}</span>
        )}
      </div>
      <div class="folder-card-name">{node.name}</div>
    </div>
  )
}

export default FolderCard
