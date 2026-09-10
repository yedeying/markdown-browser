import { useEffect, useRef, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import type { SelectionProps } from './FolderView.js'
import { assetUrl } from '../utils/fsApi.js'
import { getNodeIconName } from '../utils/nodeIcon.js'
import Icon from './ui/Icon.js'
import { useMarqueeSelect } from '../hooks/useMarqueeSelect.js'
import {
  estimateMasonryTileHeight,
  masonryColumnCount,
  MASONRY_PLACEHOLDER_RATIO,
  packMasonryColumns,
  prioritizeLoadedMasonryNodes,
} from '../utils/masonryLayout.js'

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
  /** 已测得的宽/高；未知时用占位 */
  aspectRatio: number | null
  onAspectRatio: (path: string, ratio: number) => void
  onLoadError: (path: string) => void
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
}

const COL_WIDTH = 200
const COL_GAP = 4

const MasonryTile: FunctionalComponent<TileProps> = ({
  node,
  selected,
  kbFocus,
  aspectRatio,
  onAspectRatio,
  onLoadError,
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

  const [loaded, setLoaded] = useState(() => aspectRatio != null && aspectRatio > 0)
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

  const mediaRatio = aspectRatio && aspectRatio > 0
    ? aspectRatio
    : MASONRY_PLACEHOLDER_RATIO

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
          style={{ aspectRatio: String(mediaRatio) }}
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
                onAspectRatio(node.path, img.naturalWidth / img.naturalHeight)
              } else {
                onLoadError(node.path)
              }
              setLoaded(true)
            }}
            onError={() => {
              setImgError(true)
              onLoadError(node.path)
            }}
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

type PackSnapshot = {
  ratios: Record<string, number>
  failed: Record<string, true>
}

/** 瀑布流：已就绪图优先；按真实宽高比最短列分配。 */
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
  const [colCount, setColCount] = useState(1)
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [failed, setFailed] = useState<Record<string, true>>({})
  const packTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pack, setPack] = useState<PackSnapshot>({ ratios: {}, failed: {} })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      setColCount(masonryColumnCount(el.clientWidth, COL_WIDTH, COL_GAP))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 目录内容变化：丢掉已不存在的缓存
  useEffect(() => {
    const keep = new Set(nodes.map((n) => n.path))
    const prune = <T,>(prev: Record<string, T>): Record<string, T> => {
      let changed = false
      const next: Record<string, T> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (keep.has(k)) next[k] = v
        else changed = true
      }
      return changed || Object.keys(next).length !== Object.keys(prev).length ? next : prev
    }
    setRatios(prune)
    setFailed(prune)
    setPack((prev) => {
      const ratios = prune(prev.ratios)
      const failedNext = prune(prev.failed)
      if (ratios === prev.ratios && failedNext === prev.failed) return prev
      return { ratios, failed: failedNext }
    })
  }, [nodes])

  // 防抖后重排：就绪项提前 + 真实高度齐平
  useEffect(() => {
    if (packTimerRef.current) clearTimeout(packTimerRef.current)
    packTimerRef.current = setTimeout(() => {
      setPack({ ratios, failed })
      packTimerRef.current = null
    }, 80)
    return () => {
      if (packTimerRef.current) clearTimeout(packTimerRef.current)
    }
  }, [ratios, failed])

  const handleAspectRatio = (path: string, ratio: number) => {
    setFailed((prev) => {
      if (!(path in prev)) return prev
      const next = { ...prev }
      delete next[path]
      return next
    })
    setRatios((prev) => {
      if (prev[path] === ratio) return prev
      return { ...prev, [path]: ratio }
    })
  }

  const handleLoadError = (path: string) => {
    setFailed((prev) => (prev[path] ? prev : { ...prev, [path]: true }))
  }

  const settled = new Set([
    ...Object.keys(pack.ratios),
    ...Object.keys(pack.failed),
  ])
  const ordered = prioritizeLoadedMasonryNodes(nodes, settled)
  const columns = packMasonryColumns(ordered, colCount, (n) =>
    estimateMasonryTileHeight(n, pack.ratios),
  )

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
      <div
        class="folder-masonry"
        data-testid="folder-masonry"
        data-cols={colCount}
        style={{ '--masonry-gap': `${COL_GAP}px` } as Record<string, string>}
      >
        {columns.map((col, i) => (
          <div class="masonry-col" key={i}>
            {col.map((node) => (
              <MasonryTile
                key={node.path}
                node={node}
                selected={currentPath === node.path}
                kbFocus={focusPath === node.path}
                aspectRatio={ratios[node.path] ?? null}
                onAspectRatio={handleAspectRatio}
                onLoadError={handleLoadError}
                onSelect={onSelect}
                selectionProps={selectionProps}
              />
            ))}
          </div>
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
