import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { useLongPress } from '../hooks/useLongPress.js'
import { getTypeLabel } from '../utils/sortNodes.js'
import { getNodeIconName } from '../utils/nodeIcon.js'
import type { SortField, SortOrder } from '../utils/prefs.js'
import type { SelectionProps } from './FolderView.js'
import Icon from './ui/Icon.js'

interface Props {
  /** 已按 sortField/sortOrder 排序、按 showHidden 过滤过的节点（由 FolderView 统一处理） */
  nodes: FileNode[]
  currentPath: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  /** 空白区域右键（以当前文件夹为目标）*/
  onBgContextMenu?: (e: MouseEvent) => void
  sortField: SortField
  sortOrder: SortOrder
  onSortChange: (field: SortField) => void
}

const FolderListView: FunctionalComponent<Props> = ({
  nodes,
  currentPath,
  onSelect,
  selectionProps,
  onBgContextMenu,
  sortField,
  sortOrder,
  onSortChange,
}) => {
  const {
    selectedPaths,
    selectionMode,
    onToggleSelect,
    onEnterSelectionMode,
    onContextMenu,
    onLongPress,
  } = selectionProps

  const makeLongPress = useLongPress<FileNode>({ onLongPress })

  const sortIndicator = (key: SortField) => {
    if (key !== sortField) return ''
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
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
          class={`folder-list-th-col folder-list-name ${sortField === 'name' ? 'sorted' : ''}`}
          style={{ cursor: 'pointer' }}
          data-sort="name"
          onClick={() => onSortChange('name')}
        >
          名称{sortIndicator('name')}
        </div>
        <div
          class={`folder-list-th-col folder-list-type ${sortField === 'type' ? 'sorted' : ''}`}
          style={{ cursor: 'pointer' }}
          data-sort="type"
          onClick={() => onSortChange('type')}
        >
          类型{sortIndicator('type')}
        </div>
        <div
          class={`folder-list-th-col folder-list-size ${sortField === 'size' ? 'sorted' : ''}`}
          style={{ cursor: 'pointer' }}
          data-sort="size"
          onClick={() => onSortChange('size')}
        >
          大小{sortIndicator('size')}
        </div>
      </div>

      {/* 行（已由 FolderView 按 sortField/sortOrder 排序） */}
      {nodes.map(node => {
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
            <Icon name={getNodeIconName(node)} size={16} class="row-icon" aria-hidden="true" />
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
