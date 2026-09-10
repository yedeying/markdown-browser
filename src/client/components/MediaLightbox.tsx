import { useEffect, useRef, useState } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import type { FileNode } from '../../types.js'
import { getFileType } from '../utils/fileType.js'
import { assetUrl, displayAssetUrl } from '../utils/fsApi.js'
import { downloadSingleFile } from '../utils/download.js'
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

export interface MediaLightboxProps {
  playlist: FileNode[]
  startPath: string
  onClose: () => void
  /** 关闭时是否允许 Esc（深链接单文件场景可关掉，由外层处理导航） */
  closeOnEscape?: boolean
}

function indexOfPath(playlist: FileNode[], path: string): number {
  const i = playlist.findIndex((n) => n.path === path)
  return i >= 0 ? i : 0
}

const MediaLightbox: FunctionalComponent<MediaLightboxProps> = ({
  playlist,
  startPath,
  onClose,
  closeOnEscape = true,
}) => {
  const [index, setIndex] = useState(() => indexOfPath(playlist, startPath))
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    setIndex(indexOfPath(playlist, startPath))
    // 仅在打开目标变化时重置；playlist 引用每次父渲染都会变，不能放进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPath])

  const len = playlist.length
  const current = len > 0 ? playlist[Math.min(index, len - 1)] : null
  const ft = current ? getFileType(current.name) : null
  const [scale, setScale] = useState(1)
  const [rotateDeg, setRotateDeg] = useState(0)
  const lenRef = useRef(len)
  lenRef.current = len

  useEffect(() => {
    const transform = resetTransform()
    setScale(transform.scale)
    setRotateDeg(transform.rotateDeg)
  }, [current?.path])

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

  const copyPath = () => {
    navigator.clipboard.writeText(current.path).then(() => {
      showToast('路径已复制', 'success')
    }).catch(() => {
      showToast('复制失败', 'error')
    })
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
          kind={ft === 'video' ? 'video' : 'image'}
          index={index}
          count={len}
          onDownload={() => downloadSingleFile(current.path)}
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

      <div class="media-lightbox-stage" onClick={(e) => e.stopPropagation()}>
        {ft === 'video' ? (
          <video
            key={current.path}
            class="media-lightbox-media"
            src={assetUrl(current.path)}
            controls
            autoplay
          />
        ) : (
          <img
            key={current.path}
            class="media-lightbox-media"
            src={displayAssetUrl(current.path)}
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
