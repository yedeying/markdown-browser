import { useEffect, useState } from 'preact/hooks'

/**
 * pending 为 true 时延迟 delayMs 才变为 true；pending 变 false 时立即变回 false。
 * 用于骨架屏：快速加载不闪一下骨架。
 */
export function useDelayedFlag(pending: boolean, delayMs = 500): boolean {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!pending) {
      setShow(false)
      return
    }
    const id = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(id)
  }, [pending, delayMs])

  return show
}
