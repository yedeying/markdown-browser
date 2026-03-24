import { useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import type { SelectionProps } from './FolderView.js'

type SortKey = 'name' | 'type' | 'size'
type SortDir = 'asc' | 'desc'

function getTypeLabel(node: FileNode): string {
  if (node.type === 'folder') return '文件夹'
  switch (getFileType(node.name)) {
    case 'markdown': return 'Markdown'
    case 'image':    return '图片'
    case 'video':    return '视频'
    case 'code':     return '代码'
    case 'text':     return '文本'
    default:         return '文件'
  }
}

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

function parseSizeBytes(size?: string): number {
  if (!size) return 0
  const match = size.match(/^([\d.]+)\s*([KMGT]?)/)
  if (!match) return 0
  const num = parseFloat(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = { '': 1, K: 1024, M: 1024 * 1024, G: 1024 ** 3, T: 1024 ** 4 }
  return num * (multipliers[unit] ?? 1)
}

interface Props {
  nodes: FileNode[]
  currentPath: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  /** 空白区域右键（以当前文件夹为目标）*/
  onBgContextMenu?: (e: MouseEvent) => void
}

const FolderListView: FunctionalComponent<Props> = ({
  nodes,
  currentPath,
  onSelect,
  selectionProps,
  onBgContextMenu,
}) => {
  const {
    selectedPaths,
    selectionMode,
    onToggleSelect,
    onEnterSelectionMode,
    onContextMenu,
    onLongPress,
  } = selectionProps

  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const makeLongPress = useLongPress<FileNode>({ onLongPress })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = [...nodes].sort((a, b) => {
    const folderFirst = (a.type === 'folder' ? 0 : 1) - (b.type === 'folder' ? 0 : 1)
    if (folderFirst !== 0) return folderFirst
    let cmp = 0
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortKey === 'type') cmp = getTypeLabel(a).localeCompare(getTypeLabel(b))
    else if (sortKey === 'size') cmp = parseSizeBytes(a.size) - parseSizeBytes(b.size)
    return sortDir === 'asc' ? cmp : -cmp
  })

  const sortIndicator = (key: SortKey) => {
    if (key !== sortKey) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  const handleRowClick = (node: FileNode, e: MouseEvent) => {
    if (selectionMode) {
      // 选择模式下：任何点击都切换选中
      onToggleSelect(node.path, e)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd 点击：进入选择模式并切换
      onEnterSelectionMode(node.path)
      return
    }
    // 普通点击：打开文件/文件夹
    onSelect(node)
  }

  return (
    <div
      class="folder-list"
      data-testid="folder-list"
      onContextMenu={(e) => {
        // 只处理点在容器空白处的右键（行上的右键由行自己处理并 stopPropagation）
        onBgContextMenu?.(e as MouseEvent)
      }}
    >
      {/* 表头 */}
      <div class={`folder-list-th ${selectionMode ? 'has-checkbox' : ''}`}>
        {selectionMode && <div class="folder-list-th-col folder-list-checkbox-col" />}
        <div
          class={`folder-list-th-col folder-list-name ${sortKey === 'name' ? 'sorted' : ''}`}
          style={{ cursor: 'pointer' }}
          data-sort="name"
          onClick={() => handleSort('name')}
        >
          名称{sortIndicator('name')}
        </div>
        <div
          class={`folder-list-th-col folder-list-type ${sortKey === 'type' ? 'sorted' : ''}`}
          style={{ cursor: 'pointer' }}
          data-sort="type"
          onClick={() => handleSort('type')}
        >
          类型{sortIndicator('type')}
        </div>
        <div
          class={`folder-list-th-col folder-list-size ${sortKey === 'size' ? 'sorted' : ''}`}
          style={{ cursor: 'pointer' }}
          data-sort="size"
          onClick={() => handleSort('size')}
        >
          大小{sortIndicator('size')}
        </div>
      </div>

      {/* 行 */}
      {sorted.map(node => {
        const isSelected = selectedPaths.has(node.path)
        const lpHandlers = makeLongPress(node)
        return (
          <div
            key={node.path}
            class={`folder-list-row ${currentPath === node.path ? 'active' : ''} ${isSelected ? 'selected' : ''} ${selectionMode ? 'has-checkbox' : ''}`}
            onClick={(e) => handleRowClick(node, e as MouseEvent)}
            onContextMenu={(e) => { e.stopPropagation(); onContextMenu(node, e as MouseEvent) }}
            {...lpHandlers}
            title={node.name}
          >
            {/* Checkbox（选择模式时显示） */}
            {selectionMode && (
              <div class="row-checkbox" onClick={(e) => { e.stopPropagation(); onToggleSelect(node.path, e as MouseEvent) }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {/* controlled by onClick */}}
                />
              </div>
            )}
            <span style={{ fontSize: '16px', flexShrink: 0 }}>{getNodeIcon(node)}</span>
            <div class="folder-list-name">{node.name}</div>
            <div class="folder-list-type">{getTypeLabel(node)}</div>
            <div class="folder-list-size">{node.type === 'folder' ? '—' : (node.size || '—')}</div>
          </div>
        )
      })}
    </div>
  )
}

export default FolderListView
