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
  maxConcurrent?: number
  loader?: VideoCoverLoader
  onCover?: VideoSessionCallbacks['onCover']
  onCoverError?: VideoSessionCallbacks['onCoverError']
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

/** Browser cover capture: first decoded frame → webp blob. Injectable in tests. */
export async function loadVideoCover(
  srcUrl: string,
  signal: AbortSignal,
): Promise<VideoCoverFrame> {
  if (typeof document === 'undefined') {
    throw new Error('video cover capture requires a DOM document')
  }
  if (signal.aborted) throw abortError()

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = srcUrl

  const waitForFrame = () =>
    new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoaded)
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        signal.removeEventListener('abort', onAbort)
      }
      const fail = (err: unknown) => {
        cleanup()
        reject(err)
      }
      const ok = () => {
        cleanup()
        resolve()
      }
      const onAbort = () => fail(abortError())
      const onError = () => fail(new Error('video failed to load'))
      const onSeeked = () => ok()
      const onLoaded = () => {
        try {
          if (video.seekable.length > 0) {
            const t = Math.min(0.001, video.seekable.end(0))
            if (Math.abs(video.currentTime - t) > 1e-4) {
              video.currentTime = t
              return
            }
          }
        } catch {
          // use the current decoded frame
        }
        ok()
      }
      signal.addEventListener('abort', onAbort)
      video.addEventListener('loadeddata', onLoaded)
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      video.load()
    })

  try {
    await waitForFrame()
    if (signal.aborted) throw abortError()
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) throw new Error('video has no dimensions')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.drawImage(video, 0, 0)
    if (signal.aborted) throw abortError()
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (signal.aborted) reject(abortError())
        else if (b) resolve(b)
        else reject(new Error('cover toBlob failed'))
      }, 'image/webp')
    })
    return { width, height, blob }
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
}

export class MasonryVideoSession {
  private readonly maxConcurrent: number
  private readonly loader: VideoCoverLoader
  private readonly onCover?: VideoSessionCallbacks['onCover']
  private readonly onCoverError?: VideoSessionCallbacks['onCoverError']
  private readonly covers = new Map<string, string>()
  private readonly inFlight = new Map<string, CoverJob>()
  private readonly queued = new Map<string, CoverJob>()
  private disposed = false

  constructor(opts?: MasonryVideoSessionOpts) {
    this.maxConcurrent = Math.max(1, opts?.maxConcurrent ?? 2)
    this.loader = opts?.loader ?? loadVideoCover
    this.onCover = opts?.onCover
    this.onCoverError = opts?.onCoverError
  }

  requestCover(path: string, srcUrl: string, signal?: AbortSignal): void {
    if (this.disposed) return
    if (this.covers.has(path) || this.inFlight.has(path) || this.queued.has(path)) return
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
    for (const url of this.covers.values()) URL.revokeObjectURL(url)
    this.covers.clear()
  }

  getCover(path: string): string | undefined {
    return this.covers.get(path)
  }

  private pump(): void {
    if (this.disposed) return
    for (const [path, job] of this.queued) {
      if (this.inFlight.size >= this.maxConcurrent) return
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
