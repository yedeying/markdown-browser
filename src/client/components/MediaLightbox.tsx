import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { assetUrl, displayAssetUrl } from '../utils/fsApi.js'
import { downloadSingleFile, downloadUrlDirect } from '../utils/download.js'
import {
  fitScale,
  resetTransform,
  rotateLeft,
  rotateRight,
  zoomIn,
  zoomOut,
} from '../utils/imageTransform.js'
import MediaToolbar from './MediaToolbar.js'
import Icon from './ui/Icon.js'
import { showToast } from './ui/Toast.js'

export interface MediaLightboxItem {
  name: string
  path: string
  kind?: 'image' | 'video'
  /** 直接展示 URL（用于 Markdown 内联图或外部图；缺省时由 path 走 displayAssetUrl/assetUrl） */
  src?: string
  /** 工作区相对路径（存在时下载走 /api/download；缺省时直接下载 src） */
  assetPath?: string
}

export interface MediaLightboxProps {
  playlist?: FileNode[]
  startPath?: string
  items?: MediaLightboxItem[]
  startIndex?: number
  onClose: () => void
  /** 关闭时是否允许 Esc（深链接单文件场景可关掉，由外层处理导航） */
  closeOnEscape?: boolean
}

function indexOfPath(entries: MediaLightboxItem[], path?: string): number {
  if (!path) return 0
  const i = entries.findIndex((n) => n.path === path)
  return i >= 0 ? i : 0
}

function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0
  return Math.max(0, Math.min(i, len - 1))
}

const MediaLightbox: FunctionalComponent<MediaLightboxProps> = ({
  playlist,
  startPath,
  items,
  startIndex,
  onClose,
  closeOnEscape = true,
}) => {
  const entries = useMemo<MediaLightboxItem[]>(() => {
    if (items) return items
    return (playlist ?? []).map((n) => ({
      name: n.name,
      path: n.path,
      kind: getFileType(n.name) === 'video' ? 'video' : 'image',
      assetPath: n.path,
    }))
  }, [items, playlist])

  const initialIndex = () =>
    typeof startIndex === 'number'
      ? clampIndex(startIndex, entries.length)
      : indexOfPath(entries, startPath)

  const [index, setIndex] = useState(initialIndex)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    setIndex(initialIndex())
    // 仅在打开目标变化时重置；playlist/items 引用每次父渲染都会变，不能放进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPath, startIndex])

  const len = entries.length
  const current = len > 0 ? entries[Math.min(index, len - 1)] : null
  const kind: 'image' | 'video' = current?.kind ?? (current && getFileType(current.name) === 'video' ? 'video' : 'image')
  const [scale, setScale] = useState(1)
  const [rotateDeg, setRotateDeg] = useState(0)
  const lenRef = useRef(len)
  lenRef.current = len

  const currentKey = current ? (current.src ?? current.path) : ''

  useEffect(() => {
    const transform = resetTransform()
    setScale(transform.scale)
    setRotateDeg(transform.rotateDeg)
  }, [currentKey])

  const go = (delta: number) => {
    const n = lenRef.current
    if (n <= 1) return
    setIndex((i) => (i + delta + n) % n)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowLeft' || e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        e.stopImmediatePropagation()
        go(-1)
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault()
        e.stopImmediatePropagation()
        go(1)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [closeOnEscape, onClose])

  if (!current) return null

  const displaySrc = current.src ?? (kind === 'video' ? assetUrl(current.path) : displayAssetUrl(current.path))

  const handleDownload = () => {
    if (current.assetPath) {
      downloadSingleFile(current.assetPath)
    } else {
      downloadUrlDirect(displaySrc, current.name)
    }
  }

  const copyPath = () => {
    navigator.clipboard.writeText(current.path).then(() => {
      showToast('路径已复制', 'success')
    }).catch(() => {
      showToast('复制失败', 'error')
    })
  }

  const handleWheel = (event: WheelEvent) => {
    if (kind !== 'image') return
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    setScale((value) => event.deltaY < 0 ? zoomIn(value) : zoomOut(value))
  }

  return (
    <div
      class="media-lightbox-overlay"
      data-testid="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.changedTouches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current
        touchStartX.current = null
        if (start == null) return
        const end = e.changedTouches[0]?.clientX
        if (end == null) return
        const dx = end - start
        if (Math.abs(dx) < 50) return
        go(dx > 0 ? -1 : 1)
      }}
    >
      <div class="media-lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <MediaToolbar
          name={current.name}
          path={current.path}
          kind={kind}
          index={index}
          count={len}
          onDownload={handleDownload}
          onCopyPath={copyPath}
          onZoomIn={() => setScale(zoomIn)}
          onZoomOut={() => setScale(zoomOut)}
          onZoomFit={() => setScale(fitScale())}
          onRotateLeft={() => setRotateDeg(rotateLeft)}
          onRotateRight={() => setRotateDeg(rotateRight)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onClose={onClose}
          testIdPrefix="media-lightbox"
        />
      </div>

      {len > 1 && (
        <>
          <button
            type="button"
            class="media-lightbox-nav media-lightbox-prev btn"
            aria-label="上一张"
            onClick={(e) => { e.stopPropagation(); go(-1) }}
          >
            <Icon name="chevron-left" size={28} aria-hidden="true" />
          </button>
          <button
            type="button"
            class="media-lightbox-nav media-lightbox-next btn"
            aria-label="下一张"
            onClick={(e) => { e.stopPropagation(); go(1) }}
          >
            <Icon name="chevron-right" size={28} aria-hidden="true" />
          </button>
        </>
      )}

      <div
        class="media-lightbox-stage"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        {kind === 'video' ? (
          <video
            key={currentKey}
            class="media-lightbox-media"
            src={displaySrc}
            controls
            autoplay
          />
        ) : (
          <img
            key={currentKey}
            class={`media-lightbox-media${rotateDeg % 180 !== 0 ? ' is-quarter-turn' : ''}`}
            src={displaySrc}
            alt={current.name}
            style={{
              transform: `rotate(${rotateDeg}deg) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          />
        )}
      </div>
    </div>
  )
}

export default MediaLightbox
