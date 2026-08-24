import { useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { useLongPress } from '../hooks/useLongPress.js'
import { getTypeLabel } from '../utils/sortNodes.js'
import { getNodeIconName } from '../utils/nodeIcon.js'
import type { SortField, SortOrder } from '../utils/prefs.js'
import type { SelectionProps } from './FolderView.js'
import Icon from './ui/Icon.js'
import { useMarqueeSelect } from '../hooks/useMarqueeSelect.js'

interface Props {
  /** 已按 sortField/sortOrder 排序、按 showHidden 过滤过的节点（由 FolderView 统一处理） */
  nodes: FileNode[]
  currentPath: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  /** 空白区域右键（无目标：新建/粘贴） */
  onBgContextMenu?: (e: MouseEvent) => void
  onMarqueeSelect?: (paths: string[], additive: boolean) => void
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
  onMarqueeSelect,
  sortField,
  sortOrder,
  onSortChange,
}) => {
  const {
    selectedPaths,
    selectionMode,
    onToggleSelect,
    onClearSelection,
    onContextMenu,
    onLongPress,
  } = selectionProps

  const wrapRef = useRef<HTMLDivElement>(null)
  const marquee = useMarqueeSelect(wrapRef, {
    enabled: !!onMarqueeSelect,
    onSelect: (paths, additive) => onMarqueeSelect?.(paths, additive),
  })

  const makeLongPress = useLongPress<FileNode>({ onLongPress })

  const sortIndicator = (key: SortField) => {
    if (key !== sortField) return ''
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
  }

  const handleRowClick = (node: FileNode, e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      onToggleSelect(node.path, e)
      return
    }
    if (selectionMode) onClearSelection()
    onSelect(node)
  }

  return (
    <div
      class="folder-list"
      data-testid="folder-list"
      ref={wrapRef}
      onContextMenu={(e) => {
        onBgContextMenu?.(e as MouseEvent)
      }}
    >
      {/* 表头 */}
      <div class={`folder-list-th ${selectionMode || selectedPaths.size > 0 ? 'has-checkbox' : ''}`}>
        {(selectionMode || selectedPaths.size > 0) && (
          <div class="folder-list-th-col folder-list-checkbox-col" />
        )}
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

      {nodes.map(node => {
        const isSelected = selectedPaths.has(node.path)
        const lpHandlers = makeLongPress(node)
        const showCb = selectionMode || selectedPaths.size > 0
        return (
          <div
            key={node.path}
            class={`folder-list-row ${currentPath === node.path ? 'active' : ''} ${isSelected ? 'selected' : ''} ${showCb ? 'has-checkbox' : ''}`}
            data-path={node.path}
            onClick={(e) => handleRowClick(node, e as MouseEvent)}
            onContextMenu={(e) => { e.stopPropagation(); onContextMenu(node, e as MouseEvent) }}
            {...lpHandlers}
            title={node.name}
          >
            {showCb && (
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
      {marquee && (
        <div
          class="selection-marquee"
          style={{
            left: `${marquee.left}px`,
            top: `${marquee.top}px`,
            width: `${marquee.width}px`,
            height: `${marquee.height}px`,
          }}
        />
      )}
    </div>
  )
}

export default FolderListView
