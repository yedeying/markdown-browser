import { useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import { createPortal } from 'preact/compat'

export interface ContextMenuItem {
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  separator?: boolean  // 在此项之前插入分隔线
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const ContextMenu: FunctionalComponent<Props> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null)

  // 边界检测：确保菜单不超出 viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) el.style.left = `${vw - rect.width - 8}px`
    if (rect.bottom > vh) el.style.top = `${vh - rect.height - 8}px`
  }, [x, y])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const menu = (
    <>
      {/* 全屏透明遮罩，点击关闭 */}
      <div class="ctx-overlay" onClick={onClose} />
      <div
        ref={menuRef}
        class="ctx-menu"
        style={{ left: `${x}px`, top: `${y}px` }}
      >
        {items.map((item, i) => (
          <>
            {item.separator && <div key={`sep-${i}`} class="ctx-separator" />}
            <div
              key={i}
              class={`ctx-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
              onClick={() => {
                if (item.disabled) return
                item.onClick()
                onClose()
              }}
            >
              {item.icon && <span class="ctx-icon">{item.icon}</span>}
              <span>{item.label}</span>
            </div>
          </>
        ))}
      </div>
    </>
  )

  return createPortal(menu, document.body)
}

export default ContextMenu
