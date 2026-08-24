import { useRef, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import type { SelectionProps } from './FolderView.js'
import { assetUrl } from '../utils/fsApi.js'
import { getNodeIconName } from '../utils/nodeIcon.js'
import Icon from './ui/Icon.js'
import { useMarqueeSelect } from '../hooks/useMarqueeSelect.js'

interface Props {
  nodes: FileNode[]
  currentPath: string | null
  focusPath?: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  onBgContextMenu?: (e: MouseEvent) => void
  onMarqueeSelect?: (paths: string[], additive: boolean) => void
}

interface TileProps {
  node: FileNode
  selected: boolean
  kbFocus: boolean
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
}

/** 默认占位比例（未知尺寸时）；加载后改为真实宽高比 */
const PLACEHOLDER_RATIO = 3 / 4

const MasonryTile: FunctionalComponent<TileProps> = ({
  node,
  selected,
  kbFocus,
  onSelect,
  selectionProps,
}) => {
  const {
    selectedPaths,
    selectionMode,
    onToggleSelect,
    onClearSelection,
    onContextMenu,
    onLongPress,
  } = selectionProps

  const [ratio, setRatio] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const ft = node.type === 'file' ? getFileType(node.name) : null
  const isImage = ft === 'image'
  const isVideo = ft === 'video'
  const isFolder = node.type === 'folder'
  const isChecked = selectedPaths.has(node.path)

  const makeLongPress = useLongPress<FileNode>({ onLongPress })
  const lpHandlers = makeLongPress(node)

  const handleClick = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      onToggleSelect(node.path, e)
      return
    }
    if (selectionMode) onClearSelection()
    onSelect(node)
  }

  return (
    <div
      class={`masonry-tile${selected ? ' active' : ''}${isChecked ? ' selected' : ''}${kbFocus ? ' kb-focus' : ''}${isFolder ? ' is-folder' : ''}${isVideo ? ' is-video' : ''}`}
      data-path={node.path}
      onClick={handleClick}
      onContextMenu={(e) => { e.stopPropagation(); onContextMenu(node, e as MouseEvent) }}
      {...lpHandlers}
      title={node.name}
    >
      <div
        class={`card-checkbox-wrap${isChecked ? ' checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(node.path, e as MouseEvent) }}
      >
        <input type="checkbox" checked={isChecked} onChange={() => {}} />
      </div>

      {isImage && !imgError ? (
        <div
          class="masonry-tile-media"
          style={{ aspectRatio: String(ratio ?? PLACEHOLDER_RATIO) }}
        >
          {!loaded && <div class="masonry-placeholder" aria-hidden="true" />}
          <img
            src={assetUrl(node.path)}
            alt={node.name}
            class={loaded ? 'is-loaded' : ''}
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                setRatio(img.naturalWidth / img.naturalHeight)
              }
              setLoaded(true)
            }}
            onError={() => setImgError(true)}
          />
        </div>
      ) : isVideo ? (
        <div class="masonry-tile-media masonry-tile-video" style={{ aspectRatio: '16 / 9' }}>
          <div class="masonry-placeholder" aria-hidden="true" />
          <Icon name="file-video" size={36} class="masonry-tile-glyph" aria-hidden="true" />
          <span class="masonry-tile-play" aria-hidden="true">▶</span>
        </div>
      ) : (
        <div class="masonry-tile-media masonry-tile-folder" style={{ aspectRatio: '1' }}>
          <Icon name={getNodeIconName(node)} size={40} class="masonry-tile-glyph" aria-hidden="true" />
        </div>
      )}

      <div class="masonry-tile-caption">{node.name}</div>
    </div>
  )
}

/** Pinterest 式瀑布流：列布局 + 按真实比例高度，紧凑缝隙。 */
const FolderMasonryView: FunctionalComponent<Props> = ({
  nodes,
  currentPath,
  focusPath = null,
  onSelect,
  selectionProps,
  onBgContextMenu,
  onMarqueeSelect,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const marquee = useMarqueeSelect(wrapRef, {
    enabled: !!onMarqueeSelect,
    onSelect: (paths, additive) => onMarqueeSelect?.(paths, additive),
  })

  return (
    <div
      class="folder-masonry-wrap"
      ref={wrapRef}
      onContextMenu={(e) => onBgContextMenu?.(e as MouseEvent)}
    >
      <div class="folder-masonry" data-testid="folder-masonry">
        {nodes.map((node) => (
          <MasonryTile
            key={node.path}
            node={node}
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

export default FolderMasonryView
