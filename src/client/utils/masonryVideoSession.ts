export type VideoSessionCallbacks = {
  onCover: (path: string, objectUrl: string, ratio: number) => void
  onCoverError: (path: string) => void
}

export type VideoCoverFrame = {
  blob: Blob
  width?: number
  height?: number
  bitmapWidth?: number
  bitmapHeight?: number
}

export type VideoCoverLoader = (
  url: string,
  signal: AbortSignal,
) => Promise<VideoCoverFrame>

export type MasonryVideoSessionOpts = {
  /** 同时抓封面的上限（默认 4） */
  maxConcurrent?: number
  /** 同时原地预览上限（默认 1） */
  maxPreviews?: number
  loader?: VideoCoverLoader
  onCover?: VideoSessionCallbacks['onCover']
  onCoverError?: VideoSessionCallbacks['onCoverError']
  /** 预览被另一路抢占时回调旧 path，便于 UI 停掉 */
  onPreviewEvicted?: (path: string) => void
}

type CoverJob = {
  path: string
  srcUrl: string
  controller: AbortController
  unlinkExternal?: () => void
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError')
  )
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

function frameRatio(frame: VideoCoverFrame): number {
  const width = frame.width ?? frame.bitmapWidth ?? 0
  const height = frame.height ?? frame.bitmapHeight ?? 0
  if (width > 0 && height > 0) return width / height
  return 16 / 9
}

/**
 * 封面取样时间点：避开片头黑场 / 淡入。
 * 优先 0.25s～片长 10%/25%/中点，去重并夹在可播区间内。
 */
export function coverSeekTimes(duration: number): number[] {
  const eps = 0.05
  if (!Number.isFinite(duration) || duration <= eps) {
    return [0.1, 0.25, 0.5]
  }
  const end = Math.max(eps, duration - eps)
  const raw = [
    Math.min(0.25, duration * 0.05),
    Math.min(1, duration * 0.1),
    Math.min(3, duration * 0.25),
    duration * 0.5,
  ]
  const out: number[] = []
  for (const t of raw) {
    const clamped = Math.min(end, Math.max(eps, t))
    if (!out.some((x) => Math.abs(x - clamped) < 0.04)) out.push(clamped)
  }
  return out
}

/** 抽样判断帧是否几乎全黑（片头黑场 / 尚未画出像素） */
export function frameLooksBlank(
  source: CanvasImageSource,
  width: number,
  height: number,
): boolean {
  if (width <= 0 || height <= 0) return true
  const probe = document.createElement('canvas')
  probe.width = 16
  probe.height = 16
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(source, 0, 0, width, height, 0, 0, 16, 16)
  const { data } = ctx.getImageData(0, 0, 16, 16)
  let lit = 0
  for (let i = 0; i < data.length; i += 4) {
    const y = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
    if (y > 18) lit++
  }
  // 256 像素里亮点过少 → 视为黑场
  return lit < 10
}

function waitEvent(
  target: EventTarget,
  type: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`video cover wait for ${type} timed out`))
    }, timeoutMs)
    const onAbort = () => {
      cleanup()
      reject(abortError())
    }
    const onOk = () => {
      cleanup()
      resolve()
    }
    const onErr = () => {
      cleanup()
      reject(new Error('video failed to load'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      target.removeEventListener(type, onOk)
      target.removeEventListener('error', onErr)
      signal.removeEventListener('abort', onAbort)
    }
    target.addEventListener(type, onOk, { once: true })
    target.addEventListener('error', onErr, { once: true })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function waitPaintedFrame(video: HTMLVideoElement, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => {
      cleanup()
      reject(abortError())
    }
    const done = () => {
      cleanup()
      resolve()
    }
    let raf1 = 0
    let raf2 = 0
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    const rvfc = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number
      }
    ).requestVideoFrameCallback
    if (typeof rvfc === 'function') {
      rvfc.call(video, () => done())
      return
    }
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => done())
    })
  })
}

async function seekVideo(
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (signal.aborted) throw abortError()
  if (Math.abs(video.currentTime - time) < 0.02 && video.readyState >= 2) {
    await waitPaintedFrame(video, signal)
    return
  }
  const seeked = waitEvent(video, 'seeked', signal, timeoutMs)
  try {
    video.currentTime = time
  } catch {
    // 部分引擎在未缓冲时抛错，退回等待 loadeddata
  }
  await seeked
  await waitPaintedFrame(video, signal)
}

function canvasToCoverBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  const formats = ['image/webp', 'image/jpeg', 'image/png'] as const
  return new Promise((resolve, reject) => {
    const tryAt = (i: number) => {
      if (signal.aborted) {
        reject(abortError())
        return
      }
      if (i >= formats.length) {
        reject(new Error('cover toBlob failed'))
        return
      }
      canvas.toBlob(
        (b) => {
          if (signal.aborted) reject(abortError())
          else if (b) resolve(b)
          else tryAt(i + 1)
        },
        formats[i],
        formats[i] === 'image/jpeg' ? 0.85 : undefined,
      )
    }
    tryAt(0)
  })
}

function addSearchParams(url: string, params: Record<string, string>): string {
  const abs = /^[a-z]+:\/\//i.test(url)
  const u = new URL(url, abs ? undefined : 'http://vmd.local')
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  if (abs) return u.href
  return `${u.pathname}${u.search}`
}

async function blobDimensions(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(blob)
      const width = bmp.width
      const height = bmp.height
      bmp.close?.()
      if (width > 0 && height > 0) return { width, height }
    }
  } catch {
    // fall through
  }
  return null
}

/**
 * 视频封面：优先服务端 ?poster=1（qlmanage/ffmpeg，可解 HEVC/MOV），
 * 失败再回退浏览器截帧；黑场不作为成功结果。
 */
export async function loadVideoCover(
  srcUrl: string,
  signal: AbortSignal,
  timeoutMs = 20_000,
): Promise<VideoCoverFrame> {
  if (signal.aborted) throw abortError()

  const baseUrl = srcUrl.includes('#') ? srcUrl.slice(0, srcUrl.indexOf('#')) : srcUrl
  try {
    const posterUrl = addSearchParams(baseUrl, { poster: '1', w: '400' })
    const res = await fetch(posterUrl, { signal })
    if (res.ok) {
      const blob = await res.blob()
      if (blob.size > 32) {
        const dims = await blobDimensions(blob)
        if (dims) return { blob, width: dims.width, height: dims.height }
        // 无 dimensions API 时仍接受服务端海报
        return { blob, width: 400, height: 300 }
      }
    }
  } catch (e) {
    if (isAbortError(e)) throw e
  }

  if (typeof document === 'undefined') {
    throw new Error('video cover capture requires a DOM document')
  }

  const video = document.createElement('video')
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.preload = 'auto'
  video.style.cssText =
    'position:fixed;left:-99999px;top:0;width:160px;height:90px;opacity:0;pointer-events:none'
  document.body.appendChild(video)
  video.src = baseUrl

  const deadline = Date.now() + timeoutMs
  const remaining = () => Math.max(50, deadline - Date.now())

  try {
    video.load()
    await waitEvent(video, 'loadedmetadata', signal, remaining())
    if (signal.aborted) throw abortError()

    if (!video.videoWidth || !video.videoHeight) {
      await waitEvent(video, 'loadeddata', signal, remaining())
    }
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('video has no dimensions')

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')

    const times = coverSeekTimes(video.duration)
    for (const t of times) {
      if (signal.aborted) throw abortError()
      if (Date.now() >= deadline) break
      try {
        await seekVideo(video, t, signal, remaining())
      } catch (e) {
        if (isAbortError(e)) throw e
        continue
      }
      ctx.drawImage(video, 0, 0, width, height)
      if (frameLooksBlank(canvas, width, height)) continue
      const blob = await canvasToCoverBlob(canvas, signal)
      return { width, height, blob }
    }
    throw new Error('video cover is blank')
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
  }
}

export class MasonryVideoSession {
  private readonly maxCovers: number
  private readonly maxPreviews: number
  private readonly loader: VideoCoverLoader
  private readonly onCover?: VideoSessionCallbacks['onCover']
  private readonly onCoverError?: VideoSessionCallbacks['onCoverError']
  private readonly onPreviewEvicted?: (path: string) => void
  private readonly covers = new Map<string, string>()
  private readonly failedPaths = new Set<string>()
  private readonly inFlight = new Map<string, CoverJob>()
  private readonly queued = new Map<string, CoverJob>()
  private readonly previewPaths = new Set<string>()
  private coversPaused = false
  private disposed = false

  constructor(opts?: MasonryVideoSessionOpts) {
    this.maxCovers = Math.max(1, opts?.maxConcurrent ?? 4)
    this.maxPreviews = Math.max(1, opts?.maxPreviews ?? 1)
    this.loader = opts?.loader ?? loadVideoCover
    this.onCover = opts?.onCover
    this.onCoverError = opts?.onCoverError
    this.onPreviewEvicted = opts?.onPreviewEvicted
  }

  requestCover(path: string, srcUrl: string, signal?: AbortSignal): void {
    if (this.disposed) return
    if (
      this.covers.has(path) ||
      this.failedPaths.has(path) ||
      this.inFlight.has(path) ||
      this.queued.has(path)
    ) return
    if (signal?.aborted) return

    const controller = new AbortController()
    const job: CoverJob = { path, srcUrl, controller }
    if (signal) {
      const onAbort = () => this.cancel(path)
      signal.addEventListener('abort', onAbort)
      job.unlinkExternal = () => {
        signal.removeEventListener('abort', onAbort)
        job.unlinkExternal = undefined
      }
    }
    this.queued.set(path, job)
    this.pump()
  }

  /** 把指定封面任务提到队列最前（点击播放时优先） */
  prioritizeCover(path: string): void {
    const job = this.queued.get(path)
    if (!job) return
    this.queued.delete(path)
    const rest = [...this.queued.entries()]
    this.queued.clear()
    this.queued.set(path, job)
    for (const [k, v] of rest) this.queued.set(k, v)
  }

  cancel(path: string): void {
    const queued = this.queued.get(path)
    if (queued) {
      this.queued.delete(path)
      queued.unlinkExternal?.()
      queued.controller.abort()
      return
    }
    const flying = this.inFlight.get(path)
    if (!flying) return
    this.inFlight.delete(path)
    flying.unlinkExternal?.()
    flying.controller.abort()
    this.pump()
  }

  dispose(): void {
    this.disposed = true
    this.coversPaused = false
    for (const job of this.queued.values()) {
      job.unlinkExternal?.()
      job.controller.abort()
    }
    this.queued.clear()
    for (const job of this.inFlight.values()) {
      job.unlinkExternal?.()
      job.controller.abort()
    }
    this.inFlight.clear()
    this.previewPaths.clear()
    for (const url of this.covers.values()) URL.revokeObjectURL(url)
    this.covers.clear()
  }

  getCover(path: string): string | undefined {
    return this.covers.get(path)
  }

  /**
   * 获取预览槽：默认仅 1 路；满员时抢占最旧的一路。
   * 预览期间暂停封面抓取，把带宽让给正在播放的视频。
   */
  tryAcquirePreview(path: string): boolean {
    if (this.disposed) return false
    if (this.previewPaths.has(path)) {
      this.coversPaused = true
      this.suspendInFlightCovers()
      this.prioritizeCover(path)
      return true
    }

    while (this.previewPaths.size >= this.maxPreviews) {
      const victim = this.previewPaths.values().next().value as string | undefined
      if (victim === undefined) break
      this.previewPaths.delete(victim)
      this.onPreviewEvicted?.(victim)
    }

    this.previewPaths.add(path)
    this.coversPaused = true
    this.suspendInFlightCovers()
    this.prioritizeCover(path)
    return true
  }

  releasePreview(path: string): void {
    if (!this.previewPaths.delete(path)) return
    if (this.previewPaths.size === 0) {
      this.coversPaused = false
      this.pump()
    }
  }

  /** 中止进行中的封面任务并重新入队，腾出带宽给预览 */
  private suspendInFlightCovers(): void {
    for (const [path, job] of [...this.inFlight]) {
      this.inFlight.delete(path)
      job.unlinkExternal?.()
      job.controller.abort()
      if (this.covers.has(path) || this.failedPaths.has(path)) continue
      if (this.queued.has(path)) continue
      this.queued.set(path, {
        path,
        srcUrl: job.srcUrl,
        controller: new AbortController(),
      })
    }
  }

  private pump(): void {
    if (this.disposed || this.coversPaused) return
    for (const [path, job] of this.queued) {
      if (this.inFlight.size >= this.maxCovers) return
      this.queued.delete(path)
      void this.run(job)
    }
  }

  private async run(job: CoverJob): Promise<void> {
    this.inFlight.set(job.path, job)
    try {
      if (job.controller.signal.aborted) return
      const frame = await this.loader(job.srcUrl, job.controller.signal)
      if (this.disposed || job.controller.signal.aborted) return
      const objectUrl = URL.createObjectURL(frame.blob)
      if (this.disposed || job.controller.signal.aborted) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      this.covers.set(job.path, objectUrl)
      this.onCover?.(job.path, objectUrl, frameRatio(frame))
    } catch (e) {
      if (this.disposed || job.controller.signal.aborted || isAbortError(e)) return
      this.failedPaths.add(job.path)
      this.onCoverError?.(job.path)
    } finally {
      job.unlinkExternal?.()
      if (this.inFlight.get(job.path) === job) {
        this.inFlight.delete(job.path)
      }
      this.pump()
    }
  }
}
