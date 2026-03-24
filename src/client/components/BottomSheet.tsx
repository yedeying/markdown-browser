import { useEffect } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import type { FunctionalComponent } from 'preact'

export interface BottomSheetItem {
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

interface Props {
  open: boolean
  title?: string
  items: BottomSheetItem[]
  onClose: () => void
}

const BottomSheet: FunctionalComponent<Props> = ({ open, title, items, onClose }) => {
  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // 阻止背景滚动
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return createPortal(
    <>
      {/* 半透明遮罩 */}
      <div class="bottom-sheet-overlay" onClick={onClose} />

      {/* 底部抽屉 */}
      <div class="bottom-sheet" data-open={String(open)} role="dialog" aria-modal="true">
        {/* 拖拽把手 */}
        <div class="bottom-sheet-handle" />

        {/* 标题 */}
        {title && (
          <div class="bottom-sheet-title">{title}</div>
        )}

        {/* 操作项 */}
        {items.map((item, i) => (
          <button
            key={i}
            class={`bottom-sheet-item${item.danger ? ' danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) item.onClick()
            }}
          >
            {item.icon && <span class="bottom-sheet-icon">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        ))}

        {/* 取消按钮 */}
        <button class="bottom-sheet-item bottom-sheet-cancel" onClick={onClose}>
          取消
        </button>
      </div>
    </>,
    document.body
  )
}

export default BottomSheet
