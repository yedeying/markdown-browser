import { useEffect, useRef } from 'preact/hooks'
import type { FunctionalComponent } from 'preact'
import { createPortal } from 'preact/compat'
import Icon, { type IconName } from './ui/Icon.js'

export interface ContextMenuItem {
  label: string
  icon?: IconName
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
  /** 菜单已打开时再次右键：在新位置打开定制菜单（禁止浏览器默认菜单） */
  onContextMenuAt?: (e: MouseEvent) => void
}

const ContextMenu: FunctionalComponent<Props> = ({ x, y, items, onClose, onContextMenuAt }) => {
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

  const handleOverlayContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (onContextMenuAt) onContextMenuAt(e)
    else onClose()
  }

  const menu = (
    <>
      {/* 全屏透明遮罩：左键关闭；右键交给外层改到新位置的定制菜单 */}
      <div
        class="ctx-overlay"
        onMouseDown={(e) => {
          // 右键不要触发后续 click 关闭，留给 contextmenu
          if (e.button === 2) e.preventDefault()
        }}
        onClick={(e) => {
          if (e.button !== 0) return
          onClose()
        }}
        onContextMenu={handleOverlayContextMenu}
      />
      <div
        ref={menuRef}
        class="ctx-menu"
        style={{ left: `${x}px`, top: `${y}px` }}
        onContextMenu={handleOverlayContextMenu}
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
              {item.icon && <Icon name={item.icon} size={14} class="ctx-icon" aria-hidden="true" />}
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
