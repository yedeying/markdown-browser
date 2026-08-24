import { useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import FolderCard from './FolderCard.js'
import type { SelectionProps } from './FolderView.js'
import { useMarqueeSelect } from '../hooks/useMarqueeSelect.js'

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
  /** 键盘焦点（可与当前打开文件不同；网格需 Enter 才打开） */
  focusPath?: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  onBgContextMenu?: (e: MouseEvent) => void
  onMarqueeSelect?: (paths: string[], additive: boolean) => void
  /** 点击空白处：取消多选/单选光标 */
  onBlankClick?: () => void
}

const FolderGridView: FunctionalComponent<Props> = ({
  nodes,
  cardSize,
  currentPath,
  focusPath = null,
  onSelect,
  selectionProps,
  onBgContextMenu,
  onMarqueeSelect,
  onBlankClick,
}) => {
  const { minWidth, thumbSize } = CARD_SIZES[cardSize]
  const wrapRef = useRef<HTMLDivElement>(null)
  const marquee = useMarqueeSelect(wrapRef, {
    enabled: !!onMarqueeSelect,
    onSelect: (paths, additive) => onMarqueeSelect?.(paths, additive),
    onBlankClick,
  })

  return (
    <div
      class="folder-grid-wrap"
      ref={wrapRef}
      onContextMenu={(e) => onBgContextMenu?.(e as MouseEvent)}
      onClick={(e) => {
        // 无框选时走 click；有框选时由 useMarqueeSelect 的空白单击处理
        if (onMarqueeSelect) return
        const t = e.target as Element | null
        if (!t || t.closest('[data-path], .card-checkbox-wrap, button, input')) return
        onBlankClick?.()
      }}
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
            kbFocus={focusPath === node.path}
            onSelect={onSelect}
            selectionProps={selectionProps}
          />
        ))}
      </div>
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

export default FolderGridView
