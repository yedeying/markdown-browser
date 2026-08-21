import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import FolderCard from './FolderCard.js'
import type { SelectionProps } from './FolderView.js'

interface Props {
  nodes: FileNode[]
  currentPath: string | null
  focusPath?: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  onBgContextMenu?: (e: MouseEvent) => void
}

/** 瀑布流：CSS multi-column；卡片复用 FolderCard。 */
const FolderMasonryView: FunctionalComponent<Props> = ({
  nodes,
  currentPath,
  focusPath = null,
  onSelect,
  selectionProps,
  onBgContextMenu,
}) => {
  return (
    <div
      class="folder-masonry-wrap"
      onContextMenu={(e) => onBgContextMenu?.(e as MouseEvent)}
    >
      <div class="folder-masonry" data-testid="folder-masonry">
        {nodes.map((node) => (
          <FolderCard
            key={node.path}
            node={node}
            thumbSize={120}
            selected={currentPath === node.path}
            kbFocus={focusPath === node.path}
            onSelect={onSelect}
            selectionProps={selectionProps}
          />
        ))}
      </div>
    </div>
  )
}

export default FolderMasonryView
