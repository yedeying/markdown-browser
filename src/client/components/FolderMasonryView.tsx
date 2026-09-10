import { useEffect, useRef, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import type { SelectionProps } from './FolderView.js'
import { assetUrl, fetchAssetBlob } from '../utils/fsApi.js'
import { getNodeIconName } from '../utils/nodeIcon.js'
import Icon from './ui/Icon.js'
import { useMarqueeSelect } from '../hooks/useMarqueeSelect.js'
import { MasonryVideoSession } from '../utils/masonryVideoSession.js'
import {
  estimateMasonryTileHeight,
  masonryColumnCount,
  MASONRY_PLACEHOLDER_RATIO,
  MASONRY_THUMB_WIDTH,
  orderMasonryForPack,
  packMasonryColumns,
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
  aspectRatio: number | null
  videoCover: string | null
  videoError: boolean
  /** 视口外延后加载；首屏若干张 eager */
  eager: boolean
  onAspectRatio: (path: string, ratio: number) => void
  onLoadError: (path: string) => void
  onSelect: (node: FileNode) => void
  onPreviewStart: (path: string) => boolean
  onPreviewEnd: (path: string) => void
  selectionProps: SelectionProps
}

const COL_WIDTH = 200
const COL_GAP = 4

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

const MasonryTile: FunctionalComponent<TileProps> = ({
  node,
  selected,
  kbFocus,
  aspectRatio,
  videoCover,
  videoError,
  eager,
  onAspectRatio,
  onLoadError,
  onSelect,
  onPreviewStart,
  onPreviewEnd,
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

  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(() => aspectRatio != null && aspectRatio > 0)
  const [imgError, setImgError] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const mediaRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const cancelClickRef = useRef(false)
  const touchPreviewGestureRef = useRef(false)
  const onLoadErrorRef = useRef(onLoadError)
  onLoadErrorRef.current = onLoadError
  const onAspectRatioRef = useRef(onAspectRatio)
  onAspectRatioRef.current = onAspectRatio

  const ft = node.type === 'file' ? getFileType(node.name) : null
  const isImage = ft === 'image'
  const isVideo = ft === 'video'
  const isFolder = node.type === 'folder'
  const isChecked = selectedPaths.has(node.path)

  const makeLongPress = useLongPress<FileNode>({ onLongPress })
  const lpHandlers = makeLongPress(node)
  // Selection mode keeps the existing action-sheet long press. Outside it,
  // the pointer handlers below own the gesture so lifting can still click/open.
  const selectionLongPressHandlers = selectionMode ? lpHandlers : {}

  const clearPreviewTimer = () => {
    if (previewTimerRef.current != null) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }

  const stopPreview = () => {
    clearPreviewTimer()
    previewRef.current?.pause()
    onPreviewEnd(node.path)
    setPreviewing(false)
  }

  const startPreview = () => {
    if (onPreviewStart(node.path)) setPreviewing(true)
  }

  useEffect(() => {
    if (!previewing) return
    const video = previewRef.current
    if (!video) return
    const playResult = video.play()
    void playResult?.catch(() => {
      onPreviewEnd(node.path)
      setPreviewing(false)
    })
    return () => video.pause()
  }, [previewing])

  useEffect(() => () => {
    clearPreviewTimer()
    onPreviewEnd(node.path)
  }, [])

  // fetch + AbortController：卸载 / 离开瀑布流时取消缩略图请求
  useEffect(() => {
    if (!isImage || imgError) return

    const ac = new AbortController()
    let objectUrl: string | null = null
    let started = false
    let io: IntersectionObserver | null = null

    const start = () => {
      if (started || ac.signal.aborted) return
      started = true
      void (async () => {
        try {
          const blob = await fetchAssetBlob(node.path, {
            w: MASONRY_THUMB_WIDTH,
            fmt: 'webp',
            signal: ac.signal,
          })
          if (ac.signal.aborted) return
          objectUrl = URL.createObjectURL(blob)
          setBlobSrc(objectUrl)
        } catch (e) {
          if (ac.signal.aborted || isAbortError(e)) return
          setImgError(true)
          onLoadErrorRef.current(node.path)
        }
      })()
    }

    if (eager) {
      start()
    } else {
      const el = mediaRef.current
      if (!el) {
        // ref 尚未挂上时退化为 eager，避免永不加载
        start()
      } else {
        io = new IntersectionObserver(
          (entries) => {
            if (entries.some((en) => en.isIntersecting)) {
              io?.disconnect()
              io = null
              start()
            }
          },
          { rootMargin: '200px 0px' },
        )
        io.observe(el)
      }
    }

    return () => {
      ac.abort()
      io?.disconnect()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [isImage, imgError, eager, node.path])

  const handleClick = (e: MouseEvent) => {
    touchPreviewGestureRef.current = false
    if (cancelClickRef.current) {
      cancelClickRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
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
      class={`masonry-tile${selected ? ' active' : ''}${isChecked ? ' selected' : ''}${kbFocus ? ' kb-focus' : ''}${isFolder ? ' is-folder' : ''}${isVideo ? ' is-video' : ''}${imgError ? ' is-error' : ''}`}
      data-path={node.path}
      role="button"
      tabIndex={-1}
      onClick={handleClick}
      onContextMenu={(e) => {
        if (isVideo && !selectionMode && touchPreviewGestureRef.current) {
          e.preventDefault()
          e.stopPropagation()
          return
        }
        e.stopPropagation()
        onContextMenu(node, e as MouseEvent)
      }}
      onPointerEnter={(e) => {
        if (isVideo && e.pointerType === 'mouse') startPreview()
      }}
      onPointerLeave={(e) => {
        if (isVideo && e.pointerType === 'mouse') stopPreview()
      }}
      onPointerDown={(e) => {
        if (!isVideo || selectionMode || e.pointerType !== 'touch') return
        cancelClickRef.current = false
        touchPreviewGestureRef.current = true
        pointerStartRef.current = { x: e.clientX, y: e.clientY }
        clearPreviewTimer()
        previewTimerRef.current = setTimeout(() => {
          previewTimerRef.current = null
          startPreview()
        }, 500)
      }}
      onPointerMove={(e) => {
        if (!isVideo || selectionMode || e.pointerType !== 'touch') return
        const dx = Math.abs(e.clientX - pointerStartRef.current.x)
        const dy = Math.abs(e.clientY - pointerStartRef.current.y)
        if (dx > 10 || dy > 10) {
          cancelClickRef.current = true
          touchPreviewGestureRef.current = false
          stopPreview()
        }
      }}
      onPointerUp={(e) => {
        if (isVideo && !selectionMode && e.pointerType === 'touch') {
          stopPreview()
          setTimeout(() => { touchPreviewGestureRef.current = false }, 0)
        }
      }}
      onPointerCancel={(e) => {
        if (isVideo && !selectionMode && e.pointerType === 'touch') {
          cancelClickRef.current = false
          touchPreviewGestureRef.current = false
          stopPreview()
        }
      }}
      {...selectionLongPressHandlers}
      title={node.name}
    >
      <div
        class={`card-checkbox-wrap${isChecked ? ' checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSelect(node.path, e as MouseEvent) }}
      >
        <input type="checkbox" checked={isChecked} onChange={() => {}} />
      </div>

      {isImage && imgError ? (
        <div
          class="masonry-tile-media masonry-tile-error"
          style={{ aspectRatio: String(MASONRY_PLACEHOLDER_RATIO) }}
        >
          <Icon name="file-image" size={36} class="masonry-tile-glyph" aria-hidden="true" />
          <span class="masonry-tile-error-label">无法加载</span>
        </div>
      ) : isImage ? (
        <div
          ref={mediaRef}
          class="masonry-tile-media"
          style={{ aspectRatio: String(mediaRatio) }}
        >
          {!loaded && <div class="masonry-placeholder" aria-hidden="true" />}
          {blobSrc && (
            <img
              src={blobSrc}
              alt={node.name}
              class={loaded ? 'is-loaded' : ''}
              decoding="async"
              onLoad={(e) => {
                const img = e.currentTarget
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  onAspectRatioRef.current(node.path, img.naturalWidth / img.naturalHeight)
                } else {
                  onLoadErrorRef.current(node.path)
                }
                setLoaded(true)
              }}
              onError={() => {
                setImgError(true)
                onLoadErrorRef.current(node.path)
              }}
            />
          )}
        </div>
      ) : isVideo ? (
        <div
          ref={mediaRef}
          class={`masonry-tile-media masonry-tile-video${videoError ? ' masonry-tile-error' : ''}`}
          style={{ aspectRatio: String(mediaRatio) }}
        >
          {!videoCover && !videoError && <div class="masonry-placeholder" aria-hidden="true" />}
          {videoCover && (
            <img src={videoCover} alt={node.name} class="is-loaded" decoding="async" />
          )}
          {videoError && (
            <Icon name="file-video" size={36} class="masonry-tile-glyph" aria-hidden="true" />
          )}
          {previewing && (
            <video
              ref={previewRef}
              class="masonry-tile-video-preview"
              src={assetUrl(node.path)}
              muted
              loop
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) => {
                const video = e.currentTarget
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  onAspectRatioRef.current(node.path, video.videoWidth / video.videoHeight)
                }
              }}
            />
          )}
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

function nodesKey(nodes: FileNode[]): string {
  return nodes.map((n) => n.path).join('\0')
}

/** 瀑布流：加载中就绪优先；全部就绪后恢复目录排序并按真实比例齐平。 */
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
  const [videoCovers, setVideoCovers] = useState<Record<string, string>>({})
  const [videoFailed, setVideoFailed] = useState<Record<string, true>>({})
  const videoSessionRef = useRef<MasonryVideoSession | null>(null)
  const packTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pack, setPack] = useState<PackSnapshot>({ ratios: {}, failed: {} })
  const pathKey = nodesKey(nodes)

  useEffect(() => {
    setVideoCovers({})
    setVideoFailed({})
    const session = new MasonryVideoSession({
      maxConcurrent: 2,
      onCover(path, objectUrl, ratio) {
        setVideoCovers((prev) => ({ ...prev, [path]: objectUrl }))
        setVideoFailed((prev) => {
          if (!(path in prev)) return prev
          const next = { ...prev }
          delete next[path]
          return next
        })
        setFailed((prev) => {
          if (!(path in prev)) return prev
          const next = { ...prev }
          delete next[path]
          return next
        })
        setRatios((prev) => (prev[path] === ratio ? prev : { ...prev, [path]: ratio }))
      },
      onCoverError(path) {
        setVideoFailed((prev) => (prev[path] ? prev : { ...prev, [path]: true }))
        setFailed((prev) => (prev[path] ? prev : { ...prev, [path]: true }))
      },
    })
    videoSessionRef.current = session
    return () => {
      videoSessionRef.current = null
      session.dispose()
    }
  }, [pathKey])

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

  // 目录 path 集合变化时修剪缓存（避免 nodes 引用抖动误清）
  useEffect(() => {
    const keep = new Set(pathKey ? pathKey.split('\0') : [])
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
      const nextRatios = prune(prev.ratios)
      const nextFailed = prune(prev.failed)
      if (nextRatios === prev.ratios && nextFailed === prev.failed) return prev
      return { ratios: nextRatios, failed: nextFailed }
    })
  }, [pathKey])

  // 防抖重排：比例/失败态批量落地后再改列分配，减少「先拉高再挪列」
  useEffect(() => {
    if (packTimerRef.current) clearTimeout(packTimerRef.current)
    packTimerRef.current = setTimeout(() => {
      setPack({ ratios, failed })
      packTimerRef.current = null
    }, 120)
    return () => {
      if (packTimerRef.current) clearTimeout(packTimerRef.current)
    }
  }, [ratios, failed])

  useEffect(() => {
    const root = wrapRef.current
    const session = videoSessionRef.current
    if (!root || !session) return
    const tiles = root.querySelectorAll<HTMLElement>('.masonry-tile.is-video[data-path]')
    if (typeof IntersectionObserver === 'undefined') {
      for (const tile of tiles) {
        const path = tile.dataset.path
        if (path) session.requestCover(path, assetUrl(path))
      }
      return
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const path = (entry.target as HTMLElement).dataset.path
        if (!path) continue
        if (entry.isIntersecting) session.requestCover(path, assetUrl(path))
        else if (!session.getCover(path)) session.cancel(path)
      }
    }, { root, rootMargin: '200px 0px' })
    for (const tile of tiles) io.observe(tile)
    return () => {
      io.disconnect()
      for (const tile of tiles) {
        const path = tile.dataset.path
        if (path && !session.getCover(path)) session.cancel(path)
      }
    }
  }, [pathKey, colCount, pack])

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

  const handlePreviewStart = (path: string): boolean => {
    return videoSessionRef.current?.tryAcquirePreview(path) ?? false
  }

  const handlePreviewEnd = (path: string) => {
    videoSessionRef.current?.releasePreview(path)
  }

  const settled = new Set([
    ...Object.keys(pack.ratios),
    ...Object.keys(pack.failed),
  ])
  const ordered = orderMasonryForPack(nodes, settled)
  const columns = packMasonryColumns(ordered, colCount, (n) =>
    estimateMasonryTileHeight(n, pack.ratios),
  )

  // 首屏约 3 行 eager，减轻「沉底未加载永远不请求」
  const eagerCount = Math.max(colCount * 3, 6)
  const eagerPaths = new Set(
    nodes
      .filter((n) => n.type === 'file' && getFileType(n.name) === 'image')
      .slice(0, eagerCount)
      .map((n) => n.path),
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
                videoCover={videoCovers[node.path] ?? null}
                videoError={!!videoFailed[node.path]}
                eager={eagerPaths.has(node.path)}
                onAspectRatio={handleAspectRatio}
                onLoadError={handleLoadError}
                onSelect={onSelect}
                onPreviewStart={handlePreviewStart}
                onPreviewEnd={handlePreviewEnd}
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
