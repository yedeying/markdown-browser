import type { FunctionalComponent } from 'preact'
import Icon from './ui/Icon.js'
import type { IconName } from './ui/Icon.js'

export type MediaToolbarProps = {
  name: string
  path: string
  kind: 'image' | 'video'
  index?: number
  count?: number
  onDownload: () => void
  onCopyPath: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  onZoomFit?: () => void
  onRotateLeft?: () => void
  onRotateRight?: () => void
  onPrev?: () => void
  onNext?: () => void
  onClose?: () => void
  testIdPrefix?: string
}

type ToolButtonProps = {
  testId: string
  label: string
  title?: string
  icon: IconName
  onClick: () => void
}

const ToolButton: FunctionalComponent<ToolButtonProps> = ({
  testId,
  label,
  title,
  icon,
  onClick,
}) => (
  <button
    type="button"
    class="btn media-toolbar-btn"
    data-testid={testId}
    aria-label={label}
    title={title ?? label}
    onClick={onClick}
  >
    <Icon name={icon} size={18} aria-hidden="true" />
  </button>
)

const MediaToolbar: FunctionalComponent<MediaToolbarProps> = ({
  name,
  path,
  kind,
  index,
  count,
  onDownload,
  onCopyPath,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  onRotateLeft,
  onRotateRight,
  onPrev,
  onNext,
  onClose,
  testIdPrefix = 'media-toolbar',
}) => {
  const id = (suffix: string) => `${testIdPrefix}-${suffix}`
  const showImageTools = kind === 'image'
  const hasPlaylist = (count ?? 0) > 1

  return (
    <div class="media-toolbar">
      <div class="media-toolbar-title" title={name}>
        <span class="media-toolbar-name">{name}</span>
        {hasPlaylist && (
          <span class="media-toolbar-count" data-testid={id('count')}>
            {(index ?? 0) + 1} / {count}
          </span>
        )}
      </div>
      <div class="media-toolbar-actions">
        <div class="media-toolbar-actions-scroll">
          {showImageTools && onZoomOut && (
            <ToolButton testId={id('zoom-out')} label="缩小" icon="zoom-out" onClick={onZoomOut} />
          )}
          {showImageTools && onZoomFit && (
            <ToolButton testId={id('zoom-fit')} label="适应窗口" icon="maximize" onClick={onZoomFit} />
          )}
          {showImageTools && onZoomIn && (
            <ToolButton testId={id('zoom-in')} label="放大" icon="zoom-in" onClick={onZoomIn} />
          )}
          {showImageTools && onRotateLeft && (
            <ToolButton testId={id('rotate-left')} label="向左旋转" icon="rotate-ccw" onClick={onRotateLeft} />
          )}
          {showImageTools && onRotateRight && (
            <ToolButton testId={id('rotate-right')} label="向右旋转" icon="rotate-cw" onClick={onRotateRight} />
          )}
          <ToolButton testId={id('download')} label="下载" icon="download" onClick={onDownload} />
          <ToolButton
            testId={id('copy-path')}
            label="复制路径"
            title={path}
            icon="copy"
            onClick={onCopyPath}
          />
          {hasPlaylist && onPrev && (
            <ToolButton testId={id('prev')} label="上一张" title="上一张 ←" icon="chevron-left" onClick={onPrev} />
          )}
          {hasPlaylist && onNext && (
            <ToolButton testId={id('next')} label="下一张" title="下一张 →" icon="chevron-right" onClick={onNext} />
          )}
        </div>
        {onClose && (
          <div class="media-toolbar-pinned">
            <ToolButton testId={id('close')} label="关闭" title="关闭 Esc" icon="x" onClick={onClose} />
          </div>
        )}
      </div>
    </div>
  )
}

export default MediaToolbar
