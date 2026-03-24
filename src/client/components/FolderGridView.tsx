import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import FolderCard from './FolderCard.js'
import type { SelectionProps } from './FolderView.js'

type CardSize = 's' | 'm' | 'l'

const CARD_SIZES: Record<CardSize, { minWidth: number; thumbSize: number }> = {
  s: { minWidth: 100, thumbSize: 64 },
  m: { minWidth: 140, thumbSize: 96 },
  l: { minWidth: 180, thumbSize: 128 },
}

interface Props {
  nodes: FileNode[]
  cardSize: CardSize
  currentPath: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  onBgContextMenu?: (e: MouseEvent) => void
}

const FolderGridView: FunctionalComponent<Props> = ({
  nodes,
  cardSize,
  currentPath,
  onSelect,
  selectionProps,
  onBgContextMenu,
}) => {
  const { minWidth, thumbSize } = CARD_SIZES[cardSize]

  return (
    <div
      class="folder-grid-wrap"
      onContextMenu={(e) => onBgContextMenu?.(e as MouseEvent)}
    >
      <div
        class="folder-grid"
        data-testid="folder-grid"
        style={{ '--card-min-width': `${minWidth}px` } as Record<string, string>}
      >
        {nodes.map(node => (
          <FolderCard
            key={node.path}
            node={node}
            thumbSize={thumbSize}
            selected={currentPath === node.path}
            onSelect={onSelect}
            selectionProps={selectionProps}
          />
        ))}
      </div>
    </div>
  )
}

export default FolderGridView
