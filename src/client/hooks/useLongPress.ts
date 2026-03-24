import { useCallback, useRef } from 'preact/hooks'

const LONG_PRESS_DELAY = 500   // ms
const CANCEL_THRESHOLD = 10     // px — 超过此移动距离则取消

interface LongPressCallbacks<T> {
  onLongPress: (target: T) => void
  /** 可选：长按触发后阻止后续 click 事件冒泡 */
  suppressClick?: boolean
}

interface LongPressResult {
  onTouchStart: (e: TouchEvent) => void
  onTouchMove: (e: TouchEvent) => void
  onTouchEnd: (e: TouchEvent) => void
  onTouchCancel: (e: TouchEvent) => void
}

/**
 * useLongPress — 移动端长按 hook
 *
 * Usage:
 * ```tsx
 * const lp = useLongPress({ onLongPress: node => handleLongPress(node) })
 * <div {...lp(node)}>...</div>
 * ```
 */
export function useLongPress<T>({ onLongPress, suppressClick = true }: LongPressCallbacks<T>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const firedRef = useRef(false)

  const clear = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  return useCallback(
    (target: T): LongPressResult => ({
      onTouchStart(e: TouchEvent) {
        firedRef.current = false
        const touch = e.touches[0]
        startXRef.current = touch.clientX
        startYRef.current = touch.clientY
        clear()
        timerRef.current = setTimeout(() => {
          firedRef.current = true
          // 阻止长按触发系统上下文菜单 / 文字选中
          e.preventDefault()
          onLongPress(target)
        }, LONG_PRESS_DELAY)
      },
      onTouchMove(e: TouchEvent) {
        const touch = e.touches[0]
        const dx = Math.abs(touch.clientX - startXRef.current)
        const dy = Math.abs(touch.clientY - startYRef.current)
        if (dx > CANCEL_THRESHOLD || dy > CANCEL_THRESHOLD) {
          clear()
        }
      },
      onTouchEnd(e: TouchEvent) {
        clear()
        if (firedRef.current && suppressClick) {
          e.preventDefault()
        }
      },
      onTouchCancel() {
        clear()
      },
    }),
    [onLongPress, suppressClick]
  )
}
