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

/** 根据点击横坐标在容器中的三分区域决定动作：左 1/3 上一张、中 1/3 显隐工具栏、右 1/3 下一张 */
export function resolveTapZone(clientX: number, left: number, width: number): 'prev' | 'toggle-chrome' | 'next' {
  if (width <= 0) return 'toggle-chrome'
  const ratio = (clientX - left) / width
  if (ratio < 1 / 3) return 'prev'
  if (ratio > 2 / 3) return 'next'
  return 'toggle-chrome'
}

const EDGE_GUARD_PX = 24
const SWIPE_THRESHOLD_PX = 40
const TAP_MOVE_LIMIT_PX = 10

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
  const [chromeHidden, setChromeHidden] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const lastTouchAtRef = useRef(0)

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
  const kindRef = useRef(kind)
  kindRef.current = kind

  const currentKey = current ? (current.src ?? current.path) : ''

  useEffect(() => {
    const transform = resetTransform()
    setScale(transform.scale)
    setRotateDeg(transform.rotateDeg)
  }, [currentKey])

  // 打开全屏预览时锁定底层页面滚动与回弹，防止移动端透传滚动或下拉刷新
  useEffect(() => {
    const bodyStyle = document.body.style
    const prevOverflow = bodyStyle.overflow
    const prevOverscroll = bodyStyle.overscrollBehavior
    bodyStyle.overflow = 'hidden'
    bodyStyle.overscrollBehavior = 'none'
    return () => {
      bodyStyle.overflow = prevOverflow
      bodyStyle.overscrollBehavior = prevOverscroll
    }
  }, [])

  const go = (delta: number) => {
    const n = lenRef.current
    if (n <= 1) return
    setIndex((i) => (i + delta + n) % n)
  }

  const handleZoneTap = (clientX: number) => {
    if (kindRef.current !== 'image') return
    const el = overlayRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = rect.width || window.innerWidth || 0
    const zone = resolveTapZone(clientX, rect.left, width)
    if (zone === 'prev' && lenRef.current > 1) {
      go(-1)
    } else if (zone === 'next' && lenRef.current > 1) {
      go(1)
    } else {
      setChromeHidden((v) => !v)
    }
  }

  // 使用原生非 passive 触摸监听：彻底屏蔽移动端边缘返回、页面回弹、下拉刷新与滑图手势冲突
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return

    let startX: number | null = null
    let startY: number | null = null
    let lastX = 0
    let lastY = 0
    let moved = false
    let multiTouch = false
    let ignored = false

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false
      return Boolean(target.closest('.media-lightbox-toolbar, button, a, video'))
    }

    const resetTouch = () => {
      startX = null
      startY = null
      moved = false
      multiTouch = false
      ignored = false
    }

    const onTouchStart = (e: TouchEvent) => {
      if (isInteractiveTarget(e.target)) {
        ignored = true
        return
      }
      ignored = false
      if (e.touches.length > 1) {
        multiTouch = true
        return
      }
      const t = e.touches[0]
      if (!t) return
      startX = t.clientX
      startY = t.clientY
      lastX = t.clientX
      lastY = t.clientY
      moved = false
      multiTouch = false

      // 拦截屏幕左右边缘起手，避免 iOS Safari / 移动端浏览器触发边缘后退/前进手势
      const vw = window.innerWidth || 0
      if (kindRef.current === 'image' && e.cancelable && (t.clientX <= EDGE_GUARD_PX || (vw > 0 && t.clientX >= vw - EDGE_GUARD_PX))) {
        e.preventDefault()
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (ignored) return
      if (e.touches.length > 1) {
        multiTouch = true
        return
      }
      const t = e.touches[0]
      if (!t || startX == null || startY == null) return
      lastX = t.clientX
      lastY = t.clientY
      const dx = lastX - startX
      const dy = lastY - startY
      if (Math.hypot(dx, dy) > TAP_MOVE_LIMIT_PX) {
        moved = true
      }
      // 图片全屏态阻止浏览器默认滚动/翻页/下拉刷新，消除滑图冲突
      if (kindRef.current === 'image' && e.cancelable) {
        e.preventDefault()
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (ignored) {
        resetTouch()
        return
      }
      lastTouchAtRef.current = Date.now()
      const sx = startX
      const sy = startY
      const wasMoved = moved
      const wasMulti = multiTouch
      const endTouch = e.changedTouches[0]
      const ex = endTouch ? endTouch.clientX : lastX
      const ey = endTouch ? endTouch.clientY : lastY
      resetTouch()

      if (wasMulti || sx == null || sy == null) return

      const dx = ex - sx
      const dy = ey - sy
      if (wasMoved) {
        if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
          go(dx > 0 ? -1 : 1)
        }
        return
      }

      // 轻触：图片态走左/中/右三分操作
      if (kindRef.current === 'image') {
        if (e.cancelable) e.preventDefault()
        handleZoneTap(ex)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('touchcancel', resetTouch)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', resetTouch)
    }
  }, [])

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

  const handleSurfaceClick = (e: MouseEvent) => {
    // 触摸刚结束的 500ms 内忽略浏览器补发的合成 click，避免双触发
    if (Date.now() - lastTouchAtRef.current < 500) return
    if (kind === 'image') {
      handleZoneTap(e.clientX)
    } else if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      ref={overlayRef}
      class={`media-lightbox-overlay${chromeHidden ? ' is-chrome-hidden' : ''}`}
      data-testid="media-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      onClick={handleSurfaceClick}
      onContextMenu={(e) => {
        if (kind === 'image') e.preventDefault()
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
        data-testid="media-lightbox-stage"
        onClick={(e) => {
          if (kind === 'video') e.stopPropagation()
        }}
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
            draggable={false}
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
