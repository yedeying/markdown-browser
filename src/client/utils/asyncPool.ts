/**
 * 有限并发槽：超过上限的调用排队，释放后按序唤醒。
 * 用于瀑布流后台 preload，避免对隐藏哨兵做 IntersectionObserver。
 * 支持 pause：预览视频时让出路带宽。
 */
export function createAsyncPool(maxConcurrent: number) {
  let max = Math.max(1, maxConcurrent)
  let active = 0
  let paused = false
  const waiters: Array<() => void> = []

  function wakeWaiters(): void {
    if (paused) return
    while (active < max && waiters.length > 0) {
      active++
      waiters.shift()!()
    }
  }

  async function acquire(priority = false): Promise<void> {
    if (!paused && active < max) {
      active++
      return
    }
    await new Promise<void>((resolve) => {
      if (priority) waiters.unshift(resolve)
      else waiters.push(resolve)
    })
  }

  function release(): void {
    if (!paused && waiters.length > 0) {
      waiters.shift()!()
      return
    }
    active = Math.max(0, active - 1)
  }

  function pause(): void {
    paused = true
  }

  function resume(): void {
    if (!paused) return
    paused = false
    wakeWaiters()
  }

  function setMax(next: number): void {
    max = Math.max(1, Math.round(next))
    wakeWaiters()
  }

  async function run<T>(fn: () => Promise<T>, priority = false): Promise<T> {
    await acquire(priority)
    try {
      return await fn()
    } finally {
      release()
    }
  }

  return {
    acquire,
    release,
    pause,
    resume,
    setMax,
    run,
    get active() { return active },
    get waiting() { return waiters.length },
    get paused() { return paused },
    get max() { return max },
  }
}
