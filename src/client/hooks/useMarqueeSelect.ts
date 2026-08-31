import { useEffect, useRef, useState } from 'preact/hooks'
import type { RefObject } from 'preact'

export interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

function normRect(x0: number, y0: number, x1: number, y1: number) {
  const left = Math.min(x0, x1)
  const top = Math.min(y0, y1)
  const right = Math.max(x0, x1)
  const bottom = Math.max(y0, y1)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function intersects(a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

/**
 * 在容器空白处按下拖选：框选带 data-path 的子项。
 * 点在已有 data-path 项上不启动（留给点击/Ctrl）。
 * 空白处单击（未拖动）触发 onBlankClick（因 pointerdown preventDefault 可能吞掉 click）。
 */
export function useMarqueeSelect(
  containerRef: RefObject<HTMLElement | null>,
  opts: {
    itemSelector?: string
    enabled?: boolean
    onSelect: (paths: string[], additive: boolean) => void
    onBlankClick?: () => void
  },
) {
  const itemSelector = opts.itemSelector ?? '[data-path]'
  const enabled = opts.enabled !== false
  const onSelectRef = useRef(opts.onSelect)
  onSelectRef.current = opts.onSelect
  const onBlankClickRef = useRef(opts.onBlankClick)
  onBlankClickRef.current = opts.onBlankClick

  const [rect, setRect] = useState<MarqueeRect | null>(null)
  const dragRef = useRef<{
    x0: number
    y0: number
    additive: boolean
    moved: boolean
  } | null>(null)

  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const t = e.target as Element | null
      if (!t) return
      // 点在条目/复选框/交互控件上不启拖选
      // 表头排序列（[data-sort]）也必须放行：pointerdown preventDefault 会吞掉后续 click，
      // 导致点「大小/类型」无法切换 sort（e2e 2e / CI 红）。
      if (
        t.closest(itemSelector)
        || t.closest('button, a, input, .card-checkbox-wrap, .row-checkbox, .folder-list-th, [data-sort]')
      ) return
      if (t.closest('.ctx-menu, .ctx-overlay, .modal, .bottom-sheet')) return

      // 阻止浏览器默认文本/元素选中
      e.preventDefault()
      window.getSelection()?.removeAllRanges()

      dragRef.current = {
        x0: e.clientX,
        y0: e.clientY,
        additive: e.ctrlKey || e.metaKey || e.shiftKey,
        moved: false,
      }
      try { el.setPointerCapture(e.pointerId) } catch { /* ignore */ }
    }

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      const dx = e.clientX - d.x0
      const dy = e.clientY - d.y0
      if (!d.moved && dx * dx + dy * dy < 9) return
      d.moved = true
      const r = normRect(d.x0, d.y0, e.clientX, e.clientY)
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height })
    }

    const onSelectStart = (e: Event) => {
      if (dragRef.current) e.preventDefault()
    }

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      setRect(null)
      try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
      if (!d) return
      // 空白单击：未形成框选 → 取消选择（click 可能被 preventDefault 吞掉）
      if (!d.moved) {
        onBlankClickRef.current?.()
        return
      }

      const box = normRect(d.x0, d.y0, e.clientX, e.clientY)
      if (box.width < 4 && box.height < 4) {
        onBlankClickRef.current?.()
        return
      }

      const paths: string[] = []
      for (const node of el.querySelectorAll(itemSelector)) {
        const path = (node as HTMLElement).dataset.path
        if (!path) continue
        if (intersects(node.getBoundingClientRect(), box)) paths.push(path)
      }
      if (paths.length > 0) onSelectRef.current(paths, d.additive)
      else onBlankClickRef.current?.()
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('selectstart', onSelectStart)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('selectstart', onSelectStart)
    }
  }, [containerRef, enabled, itemSelector])

  return rect
}
