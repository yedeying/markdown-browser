import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { useLongPress } from '../hooks/useLongPress.js'
import type { SelectionProps } from './FolderView.js'
import { assetUrl, masonryAssetUrl } from '../utils/fsApi.js'
import { getNodeIconName } from '../utils/nodeIcon.js'
import Icon from './ui/Icon.js'
import { useMarqueeSelect } from '../hooks/useMarqueeSelect.js'
import { MasonryVideoSession } from '../utils/masonryVideoSession.js'
import type { VideoCoverLoader } from '../utils/masonryVideoSession.js'
import { createAsyncPool } from '../utils/asyncPool.js'
import {
  appendRevealOrder,
  columnWidthForMode,
  estimateMasonryTileHeight,
  MASONRY_COL_GAP,
  MASONRY_PLACEHOLDER_RATIO,
  MASONRY_SKELETON_RATIOS,
  masonrySkeletonCount,
  masonryThumbWidth,
  orderMasonryForPack,
  packMasonryColumns,
  pendingMasonryNodes,
  resolveMasonryColumnCount,
} from '../utils/masonryLayout.js'
import type { MasonryColModePref, MasonryColSizePref, MasonryImageQualityPref } from '../utils/prefs.js'
import { usePref } from '../hooks/usePref.js'

/** 后台解码并发：不依赖视口交叉（preload 区被 overflow 裁剪，IO 永远不触发） */
const masonryImagePreloadPool = createAsyncPool(20)

/** 点播放时中止进行中的缩略图解码，把带宽让给视频 */
const liveDecodeImgs = new Set<HTMLImageElement>()

function beginPreviewBandwidthPriority(): void {
  for (const img of liveDecodeImgs) {
    img.onload = null
    img.onerror = null
    img.src = ''
  }
  liveDecodeImgs.clear()
  masonryImagePreloadPool.pause()
}

function endPreviewBandwidthPriority(): void {
  masonryImagePreloadPool.resume()
}

interface Props {
  nodes: FileNode[]
  currentPath: string | null
  focusPath?: string | null
  onSelect: (node: FileNode) => void
  selectionProps: SelectionProps
  onBgContextMenu?: (e: MouseEvent) => void
  onMarqueeSelect?: (paths: string[], additive: boolean) => void
  colMode?: MasonryColModePref
  colSize?: MasonryColSizePref
  colCount?: number
  /** 测试注入：跳过真实 video decode */
  coverLoader?: VideoCoverLoader
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
  thumbWidth: number
  imageQuality: MasonryImageQualityPref
  onAspectRatio: (path: string, ratio: number) => void
  onLoadError: (path: string) => void
  onSelect: (node: FileNode) => void
  onPreviewStart: (path: string) => boolean
  onPreviewEnd: (path: string) => void
  /** 当前唯一在播预览 path；被抢占时其它 tile 据此停掉 */
  activePreviewPath: string | null
  selectionProps: SelectionProps
}

/** 后台解码：不占位、不展示，就绪后由主瀑布流接入（已加载优先且无闪跳） */
const MasonryPreload: FunctionalComponent<{
  node: FileNode
  eager: boolean
  thumbWidth: number
  bgGen: number
  imageQuality: MasonryImageQualityPref
  onAspectRatio: (path: string, ratio: number) => void
  onLoadError: (path: string) => void
  onRequestVideoCover: (path: string) => void
}> = ({
  node,
  eager,
  thumbWidth,
  bgGen,
  imageQuality,
  onAspectRatio,
  onLoadError,
  onRequestVideoCover,
}) => {
  const ft = getFileType(node.name)
  const isImage = ft === 'image'
  const isVideo = ft === 'video'
  const onAspectRatioRef = useRef(onAspectRatio)
  onAspectRatioRef.current = onAspectRatio
  const onLoadErrorRef = useRef(onLoadError)
  onLoadErrorRef.current = onLoadError

  useEffect(() => {
    if (!isVideo) return
    onRequestVideoCover(node.path)
  }, [isVideo, node.path, onRequestVideoCover])

  useEffect(() => {
    if (!isImage) return
    const src = masonryAssetUrl(node.path, imageQuality, thumbWidth)
    let cancelled = false
    const img = new Image()

    void (async () => {
      await masonryImagePreloadPool.acquire(eager)
      if (cancelled) {
        masonryImagePreloadPool.release()
        return
      }
      liveDecodeImgs.add(img)
      try {
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('decode failed'))
          img.src = src
        })
        if (cancelled) return
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          onAspectRatioRef.current(node.path, img.naturalWidth / img.naturalHeight)
        } else onLoadErrorRef.current(node.path)
      } catch {
        // 预览抢带宽会把 src 清空；cleanup 也会。这两种都不是加载失败
        if (cancelled || !img.src) return
        onLoadErrorRef.current(node.path)
      } finally {
        liveDecodeImgs.delete(img)
        masonryImagePreloadPool.release()
      }
    })()

    return () => {
      cancelled = true
      img.onload = null
      img.onerror = null
      img.src = ''
      liveDecodeImgs.delete(img)
    }
  }, [isImage, node.path, thumbWidth, eager, bgGen, imageQuality])

  // 仅占位挂载；实际加载走并发池，不依赖 IntersectionObserver
  return <div class="masonry-preload-sentinel" data-path={node.path} />
}

const MasonryTile: FunctionalComponent<TileProps> = ({
  node,
  selected,
  kbFocus,
  aspectRatio,
  videoCover,
  videoError,
  eager,
  thumbWidth,
  imageQuality,
  onAspectRatio,
  onLoadError,
  onSelect,
  onPreviewStart,
  onPreviewEnd,
  activePreviewPath,
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
  const [previewing, setPreviewing] = useState(false)
  /** 点击 ▶ 拉起的预览：移出 tile 不自动停；再点 ■ 停止 */
  const [stickyPreview, setStickyPreview] = useState(false)
  const mediaRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 点停止后鼠标仍在 tile 上时，禁止 hover 立刻重新拉起 */
  const suppressHoverRef = useRef(false)
  const pointerStartRef = useRef({ x: 0, y: 0 })
  const cancelClickRef = useRef(false)
  const touchPreviewGestureRef = useRef(false)
  const onLoadErrorRef = useRef(onLoadError)
  onLoadErrorRef.current = onLoadError
  const onAspectRatioRef = useRef(onAspectRatio)
  onAspectRatioRef.current = onAspectRatio
  const onPreviewEndRef = useRef(onPreviewEnd)
  onPreviewEndRef.current = onPreviewEnd

  const ft = node.type === 'file' ? getFileType(node.name) : null
  const isImage = ft === 'image'
  const isVideo = ft === 'video'
  const isFolder = node.type === 'folder'
  const isChecked = selectedPaths.has(node.path)

  const makeLongPress = useLongPress<FileNode>({ onLongPress })
  const lpHandlers = makeLongPress(node)
  // Video preview owns touch long-press outside selection mode.
  const selectionLongPressHandlers = selectionMode || !isVideo ? lpHandlers : {}

  const clearPreviewTimer = () => {
    if (previewTimerRef.current != null) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }

  const stopPreview = () => {
    clearPreviewTimer()
    previewRef.current?.pause()
    onPreviewEndRef.current(node.path)
    setStickyPreview(false)
    setPreviewing(false)
  }

  const startPreview = () => {
    if (onPreviewStart(node.path)) setPreviewing(true)
  }

  const handlePlayClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (selectionMode) return
    if (previewing) {
      // 停止后若指针仍在卡片上，避免 pointer 态立刻又 hover 拉起
      suppressHoverRef.current = true
      stopPreview()
      return
    }
    suppressHoverRef.current = false
    setStickyPreview(true)
    startPreview()
  }

  useEffect(() => {
    if (!previewing) return
    const video = previewRef.current
    if (!video) return
    const onEnded = () => stopPreview()
    video.addEventListener('ended', onEnded)
    const playResult = video.play()
    void playResult?.catch(() => {
      onPreviewEndRef.current(node.path)
      setStickyPreview(false)
      setPreviewing(false)
    })
    return () => {
      video.removeEventListener('ended', onEnded)
      video.pause()
    }
  }, [previewing])

  // 另一路抢占预览槽时，本 tile 只清 UI（session 已释放本 path）
  useEffect(() => {
    if (!previewing) return
    if (activePreviewPath === node.path) return
    clearPreviewTimer()
    previewRef.current?.pause()
    setStickyPreview(false)
    setPreviewing(false)
  }, [activePreviewPath, node.path, previewing])

  useEffect(() => () => {
    clearPreviewTimer()
    onPreviewEndRef.current(node.path)
  }, [])

  const thumbSrc = isImage ? masonryAssetUrl(node.path, imageQuality, thumbWidth) : null

  useEffect(() => {
    if (!isImage) return
    setImgError(false)
    setLoaded(aspectRatio != null && aspectRatio > 0)
  }, [isImage, node.path, thumbSrc, aspectRatio])

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
        if (isVideo && e.pointerType === 'mouse' && !suppressHoverRef.current) startPreview()
      }}
      onPointerLeave={(e) => {
        if (!isVideo || e.pointerType !== 'mouse') return
        suppressHoverRef.current = false
        if (!stickyPreview) stopPreview()
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
          {thumbSrc && (
            <img
              src={thumbSrc}
              alt={node.name}
              class={loaded ? 'is-loaded' : ''}
              decoding="async"
              loading={eager ? 'eager' : 'lazy'}
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
              playsInline
              preload="auto"
              onEnded={() => stopPreview()}
              onLoadedMetadata={(e) => {
                const video = e.currentTarget
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  onAspectRatioRef.current(node.path, video.videoWidth / video.videoHeight)
                }
              }}
            />
          )}
          <button
            type="button"
            class={`masonry-tile-play${previewing ? ' is-playing' : ''}`}
            data-testid="masonry-tile-play"
            aria-label={previewing ? '停止预览' : '原地预览'}
            title={previewing ? '停止预览' : '原地预览'}
            onClick={handlePlayClick}
          >
            {previewing ? '■' : '▶'}
          </button>
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

/** 瀑布流：图/视频均须就绪才入主列（优先级一致）；骨架只排在底部，避免中间空洞；新项按就绪序追加以免闪跳。 */
const FolderMasonryView: FunctionalComponent<Props> = ({
  nodes,
  currentPath,
  focusPath = null,
  onSelect,
  selectionProps,
  onBgContextMenu,
  onMarqueeSelect,
  colMode = 'size',
  colSize = 'narrow',
  colCount = 2,
  coverLoader,
}) => {
  const [imageQuality] = usePref('masonryImageQuality')
  const [loadConcurrency] = usePref('masonryLoadConcurrency')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [ratios, setRatios] = useState<Record<string, number>>({})
  const [failed, setFailed] = useState<Record<string, true>>({})
  const [videoCovers, setVideoCovers] = useState<Record<string, string>>({})
  const [videoFailed, setVideoFailed] = useState<Record<string, true>>({})
  /** 主区首次就绪顺序：新项只追加，避免插回目录中部造成闪跳 */
  const [revealOrder, setRevealOrder] = useState<string[]>([])
  const [activePreviewPath, setActivePreviewPath] = useState<string | null>(null)
  /** 预览抢带宽后 bump，让中止的缩略图在恢复时重试 */
  const [bgGen, setBgGen] = useState(0)
  const videoSessionRef = useRef<MasonryVideoSession | null>(null)
  const packTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pack, setPack] = useState<PackSnapshot>({ ratios: {}, failed: {} })
  const pathKey = nodesKey(nodes)

  useEffect(() => {
    masonryImagePreloadPool.setMax(loadConcurrency)
  }, [loadConcurrency])

  // 切换缩略图/原图时清空缓存并重拉（首挂载跳过，避免冲掉刚加载的封面比）
  const imageQualityBootRef = useRef(true)
  useEffect(() => {
    if (imageQualityBootRef.current) {
      imageQualityBootRef.current = false
      return
    }
    setBgGen((g) => g + 1)
    setRatios({})
    setFailed({})
    setRevealOrder([])
  }, [imageQuality])

  const columnWidth = columnWidthForMode(colMode, colSize)
  const colGapRel = MASONRY_COL_GAP / columnWidth
  const thumbWidth = masonryThumbWidth(columnWidth)
  const colCountResolved = resolveMasonryColumnCount({
    mode: colMode,
    size: colSize,
    fixedCount: colCount,
    containerWidth,
    gap: MASONRY_COL_GAP,
  })

  useEffect(() => {
    setVideoCovers({})
    setVideoFailed({})
    setActivePreviewPath(null)
    endPreviewBandwidthPriority()
    const session = new MasonryVideoSession({
      maxConcurrent: 4,
      maxPreviews: 1,
      loader: coverLoader,
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
      endPreviewBandwidthPriority()
    }
  }, [pathKey, coverLoader])

  // Preact: 子 effect 可能早于父 effect，Preload 里 requestCover 会打在 null session 上。
  // session 建好后由父级补拉所有未就绪视频封面。
  const pendingVideoKey = nodes
    .filter((n) => n.type === 'file' && getFileType(n.name) === 'video')
    .filter((n) => !(n.path in videoCovers) && !(n.path in videoFailed))
    .map((n) => n.path)
    .join('\0')
  useEffect(() => {
    const session = videoSessionRef.current
    if (!session || !pendingVideoKey) return
    for (const path of pendingVideoKey.split('\0')) {
      if (path) session.requestCover(path, assetUrl(path))
    }
  }, [pathKey, pendingVideoKey, coverLoader])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const update = () => {
      setContainerWidth(el.clientWidth)
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
    setRevealOrder((prev) => {
      const next = prev.filter((p) => keep.has(p))
      return next.length === prev.length ? prev : next
    })
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

  // Reconcile observed video tiles when columns remount (colCount/pack). Do not
  // cancel in-flight covers on remount — only when a tile leaves the viewport.
  useEffect(() => {
    const root = wrapRef.current
    const session = videoSessionRef.current
    if (!root || !session) return

    const videoTiles = () =>
      [...root.querySelectorAll<HTMLElement>('.masonry-tile.is-video[data-path]')]

    if (typeof IntersectionObserver === 'undefined') {
      const sync = () => {
        for (const tile of videoTiles()) {
          const path = tile.dataset.path
          if (path) session.requestCover(path, assetUrl(path))
        }
      }
      sync()
      const mo = new MutationObserver(sync)
      mo.observe(root, { childList: true, subtree: true })
      return () => mo.disconnect()
    }

    const observed = new Set<HTMLElement>()
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const path = el.dataset.path
        if (!path) continue
        if (entry.isIntersecting) {
          session.requestCover(path, assetUrl(path))
          continue
        }
        // 列重排会卸下旧 DOM：detached 节点常报 not intersecting，不得 cancel 仍属于本目录的封面任务
        if (!el.isConnected) continue
        if (!session.getCover(path)) session.cancel(path)
      }
    }, { root, rootMargin: '200px 0px' })

    const reconcile = () => {
      const tiles = videoTiles()
      const next = new Set(tiles)
      for (const tile of observed) {
        if (next.has(tile)) continue
        io.unobserve(tile)
        observed.delete(tile)
      }
      for (const tile of tiles) {
        if (observed.has(tile)) continue
        io.observe(tile)
        observed.add(tile)
      }
    }

    reconcile()
    const mo = new MutationObserver(reconcile)
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      io.disconnect()
    }
  }, [pathKey])

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
    const ok = videoSessionRef.current?.tryAcquirePreview(path) ?? false
    if (!ok) return false
    beginPreviewBandwidthPriority()
    setBgGen((g) => g + 1)
    setActivePreviewPath(path)
    // 主动以高优先级预热视频字节，避免被其它连接挤到后面
    const url = assetUrl(path)
    void fetch(url, {
      headers: { Range: 'bytes=0-1' },
      priority: 'high',
    } as RequestInit).catch(() => {})
    return true
  }

  const handlePreviewEnd = (path: string) => {
    videoSessionRef.current?.releasePreview(path)
    let shouldResume = false
    setActivePreviewPath((prev) => {
      if (prev !== path) return prev
      shouldResume = true
      return null
    })
    if (shouldResume) {
      endPreviewBandwidthPriority()
      setBgGen((g) => g + 1)
    }
  }

  const handleRequestVideoCover = useCallback((path: string) => {
    videoSessionRef.current?.requestCover(path, assetUrl(path))
  }, [])

  const liveSettled = new Set([
    ...Object.keys(ratios),
    ...Object.keys(failed),
    ...Object.keys(videoCovers),
    ...Object.keys(videoFailed),
  ])
  const pendingNodes = pendingMasonryNodes(nodes, liveSettled)
  const readyPaths = orderMasonryForPack(nodes, liveSettled).map((n) => n.path)
  const readyPathKey = readyPaths.join('\0')
  useEffect(() => {
    setRevealOrder((prev) => appendRevealOrder(prev, readyPathKey ? readyPathKey.split('\0') : []))
  }, [pathKey, readyPathKey])
  const readyNodes = orderMasonryForPack(nodes, liveSettled, revealOrder)
  const columns = packMasonryColumns(
    readyNodes,
    colCountResolved,
    (n) => estimateMasonryTileHeight(n, pack.ratios),
    colGapRel,
  )
  // 骨架只接在底部，不插入已加载项中间
  const skeletonCount = masonrySkeletonCount(pendingNodes.length)
  const skeletonItems = Array.from({ length: skeletonCount }, (_, i) => ({
    key: `sk:${pendingNodes[i]?.path ?? i}`,
    path: pendingNodes[i]?.path ?? `sk:${i}`,
    ratio: MASONRY_SKELETON_RATIOS[i % MASONRY_SKELETON_RATIOS.length]!,
  }))
  const skeletonColumns = packMasonryColumns(
    skeletonItems,
    colCountResolved,
    (s) => 1 / s.ratio,
    colGapRel,
  )

  // 首屏约 3 行 eager（按目录序，含尚未进入主区的 pending）
  const eagerCount = Math.max(colCountResolved * 3, 6)
  const eagerPaths = new Set(
    nodes
      .filter((n) => n.type === 'file' && (getFileType(n.name) === 'image' || getFileType(n.name) === 'video'))
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
        data-cols={colCountResolved}
        style={{ '--masonry-gap': `${MASONRY_COL_GAP}px` } as Record<string, string>}
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
                eager={
                  eagerPaths.has(node.path)
                  || ratios[node.path] != null
                  || !!videoCovers[node.path]
                  || !!failed[node.path]
                }
                thumbWidth={thumbWidth}
                imageQuality={imageQuality}
                onAspectRatio={handleAspectRatio}
                onLoadError={handleLoadError}
                onSelect={onSelect}
                onPreviewStart={handlePreviewStart}
                onPreviewEnd={handlePreviewEnd}
                activePreviewPath={activePreviewPath}
                selectionProps={selectionProps}
              />
            ))}
            {(skeletonColumns[i] ?? []).map((sk) => (
              <div
                key={sk.key}
                class="masonry-tile is-skeleton"
                aria-hidden="true"
                data-testid="masonry-skeleton-tile"
                data-path={sk.path}
              >
                <div
                  class="masonry-tile-media"
                  style={{ aspectRatio: String(sk.ratio) }}
                >
                  <div class="masonry-placeholder" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {pendingNodes.length > 0 && (
        <div class="masonry-preload" aria-hidden="true" data-testid="masonry-preload">
          {pendingNodes.map((node) => (
            <MasonryPreload
              key={`preload:${node.path}`}
              node={node}
              eager={eagerPaths.has(node.path)}
              thumbWidth={thumbWidth}
              bgGen={bgGen}
              imageQuality={imageQuality}
              onAspectRatio={handleAspectRatio}
              onLoadError={handleLoadError}
              onRequestVideoCover={handleRequestVideoCover}
            />
          ))}
        </div>
      )}
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
