import { test, expect, afterEach } from 'bun:test'
import {
  coverSeekTimes,
  frameLooksBlank,
  loadVideoCover,
  MasonryVideoSession,
} from './masonryVideoSession.ts'

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function stubObjectUrls() {
  const revoked: string[] = []
  let n = 0
  const origCreate = URL.createObjectURL.bind(URL)
  const origRevoke = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = () => {
    const url = `blob:masonry-test/${++n}`
    return url
  }
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url)
  }
  return {
    revoked,
    restore() {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    },
  }
}

let stub: ReturnType<typeof stubObjectUrls> | undefined

afterEach(() => {
  stub?.restore()
  stub = undefined
})

test('MasonryVideoSession aborts queued work and never runs it', async () => {
  let ran = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (_url, signal) => {
      ran++
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 50)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([0])]) }
    },
  })
  // occupy slot
  session.requestCover('a', '/a')
  session.requestCover('b', '/b')
  session.cancel('b')
  await delay(80)
  expect(ran).toBe(1) // only a
  session.dispose()
})

test('dispose revokes owned covers and cancels in-flight work', async () => {
  stub = stubObjectUrls()
  let ran = 0
  let aborted = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (_url, signal) => {
      ran++
      if (ran === 1) {
        return { width: 16, height: 9, blob: new Blob([new Uint8Array([1])]) }
      }
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted++
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([2])]) }
    },
  })
  session.requestCover('a', '/a')
  await delay(20)
  const cover = session.getCover('a')
  expect(cover).toBeDefined()
  session.requestCover('b', '/b')
  session.requestCover('c', '/c')
  session.dispose()
  await delay(20)
  expect(session.getCover('a')).toBeUndefined()
  expect(stub.revoked).toContain(cover)
  expect(aborted).toBe(1)
  expect(ran).toBe(2) // a completed, b started, c never ran
})

test('requestCover reports cover url and ratio then is a no-op', async () => {
  stub = stubObjectUrls()
  const covers: Array<{ path: string; url: string; ratio: number }> = []
  let ran = 0
  const session = new MasonryVideoSession({
    loader: async () => {
      ran++
      return { width: 32, height: 16, blob: new Blob([new Uint8Array([3])]) }
    },
    onCover: (path, objectUrl, ratio) => {
      covers.push({ path, url: objectUrl, ratio })
    },
  })
  session.requestCover('clip.mp4', '/clip')
  session.requestCover('clip.mp4', '/clip')
  await delay(20)
  expect(ran).toBe(1)
  expect(covers).toEqual([{ path: 'clip.mp4', url: 'blob:masonry-test/1', ratio: 2 }])
  expect(session.getCover('clip.mp4')).toBe('blob:masonry-test/1')
  session.requestCover('clip.mp4', '/clip')
  await delay(10)
  expect(ran).toBe(1)
  session.dispose()
})

test('loader failure calls onCoverError and abort does not', async () => {
  const errors: string[] = []
  const session = new MasonryVideoSession({
    maxConcurrent: 2,
    loader: async (url, signal) => {
      if (url === '/bad') throw new Error('decode failed')
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([4])]) }
    },
    onCoverError: (path) => {
      errors.push(path)
    },
  })
  session.requestCover('bad.mp4', '/bad')
  session.requestCover('hold.mp4', '/hold')
  await delay(20)
  expect(errors).toEqual(['bad.mp4'])
  session.cancel('hold.mp4')
  await delay(10)
  expect(errors).toEqual(['bad.mp4'])
  session.dispose()
})

test('a permanently failed cover is not requested again', async () => {
  const errors: string[] = []
  let ran = 0
  const session = new MasonryVideoSession({
    loader: async () => {
      ran++
      throw new Error('decode failed')
    },
    onCoverError: (path) => errors.push(path),
  })

  session.requestCover('bad.mp4', '/bad')
  await delay(10)
  session.requestCover('bad.mp4', '/bad')
  await delay(10)

  expect(ran).toBe(1)
  expect(errors).toEqual(['bad.mp4'])
  session.dispose()
})

test('coverSeekTimes skips the true zero black intro', () => {
  expect(coverSeekTimes(10)[0]!).toBeGreaterThanOrEqual(0.05)
  expect(coverSeekTimes(10).some((t) => t >= 1)).toBe(true)
  expect(coverSeekTimes(0.2).every((t) => t > 0)).toBe(true)
})

test('frameLooksBlank detects near-black probes', () => {
  const black = new Uint8ClampedArray(16 * 16 * 4)
  const white = new Uint8ClampedArray(16 * 16 * 4)
  for (let i = 0; i < white.length; i += 4) {
    white[i] = 255
    white[i + 1] = 255
    white[i + 2] = 255
    white[i + 3] = 255
  }

  const makeCanvas = (data: Uint8ClampedArray) => {
    const canvas = {
      width: 16,
      height: 16,
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data, width: 16, height: 16 }),
      }),
    }
    return canvas as unknown as HTMLCanvasElement
  }

  const prevDoc = globalThis.document
  ;(globalThis as unknown as { document: Pick<Document, 'createElement'> }).document = {
    createElement: () => makeCanvas(black),
  }
  try {
    expect(frameLooksBlank(makeCanvas(black), 32, 32)).toBe(true)
    ;(globalThis as unknown as { document: Pick<Document, 'createElement'> }).document = {
      createElement: () => makeCanvas(white),
    }
    expect(frameLooksBlank(makeCanvas(white), 32, 32)).toBe(false)
  } finally {
    if (prevDoc) globalThis.document = prevDoc
    else delete (globalThis as Partial<typeof globalThis>).document
  }
})

test('loadVideoCover rejects when video loading stalls', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(null, { status: 415 })) as typeof fetch

  const originalDocument = globalThis.document
  const video = new EventTarget() as HTMLVideoElement
  Object.assign(video, {
    muted: false,
    defaultMuted: false,
    playsInline: false,
    preload: '',
    src: '',
    duration: NaN,
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 0,
    readyState: 0,
    style: { cssText: '' },
    pause() {},
    load() {},
    removeAttribute() {},
    setAttribute() {},
    remove() {},
  })
  ;(globalThis as unknown as {
    document: Pick<Document, 'createElement' | 'body'>
  }).document = {
    createElement: (tag: string) => {
      if (tag === 'video') return video
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => null,
      }
      return canvas as unknown as HTMLElement
    },
    body: { appendChild() { return video } } as unknown as HTMLElement,
  }

  try {
    await expect(loadVideoCover('/stalled', new AbortController().signal, 10))
      .rejects.toThrow(/timed out|blank|dimensions|canvas/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalDocument) globalThis.document = originalDocument
    else delete (globalThis as Partial<typeof globalThis>).document
  }
})

test('cancel then requestCover runs the loader again in the same turn', async () => {
  const started: string[] = []
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (url, signal) => {
      started.push(url)
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([6])]) }
    },
  })
  session.requestCover('clip.mp4', '/v1')
  expect(started).toEqual(['/v1'])
  session.cancel('clip.mp4')
  session.requestCover('clip.mp4', '/v2')
  expect(started).toEqual(['/v1', '/v2'])
  session.dispose()
})

test('settled external AbortSignal does not cancel a later request', async () => {
  stub = stubObjectUrls()
  let secondStarted = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (url, signal) => {
      if (url === '/v1') {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }
      secondStarted++
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([7])]) }
    },
  })
  const ac = new AbortController()
  session.requestCover('clip.mp4', '/v1', ac.signal)
  session.cancel('clip.mp4')
  session.requestCover('clip.mp4', '/v2')
  ac.abort()
  await delay(20)
  expect(secondStarted).toBe(1)
  expect(session.getCover('clip.mp4')).toBeDefined()
  session.dispose()
})

test('external AbortSignal cancels queued work', async () => {
  let ran = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (_url, signal) => {
      ran++
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 50)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([5])]) }
    },
  })
  const ac = new AbortController()
  session.requestCover('a', '/a')
  session.requestCover('b', '/b', ac.signal)
  ac.abort()
  await delay(80)
  expect(ran).toBe(1)
  session.dispose()
})

test('preview slots are independent from cover capture budget', async () => {
  let releaseCover!: () => void
  const session = new MasonryVideoSession({
    maxConcurrent: 2,
    maxPreviews: 1,
    loader: async () => {
      await new Promise<void>((resolve) => { releaseCover = resolve })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([8])]) }
    },
  })

  session.requestCover('cover-a.mp4', '/a')
  session.requestCover('cover-b.mp4', '/b')
  // 封面槽已满，预览仍可点；第二路抢占第一路
  expect(session.tryAcquirePreview('preview-a.mp4')).toBe(true)
  expect(session.tryAcquirePreview('preview-b.mp4')).toBe(true)

  releaseCover()
  await delay(20)
  session.dispose()
})

test('preview pauses cover capture until released', async () => {
  let ran = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    maxPreviews: 1,
    loader: async () => {
      ran++
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([9])]) }
    },
  })

  expect(session.tryAcquirePreview('preview.mp4')).toBe(true)
  session.requestCover('cover.mp4', '/cover')
  await delay(20)
  expect(ran).toBe(0)
  session.releasePreview('preview.mp4')
  await delay(20)
  expect(ran).toBe(1)
  session.dispose()
})

test('tryAcquirePreview steals the previous preview and notifies eviction', async () => {
  const evicted: string[] = []
  const session = new MasonryVideoSession({
    maxPreviews: 1,
    onPreviewEvicted: (path) => evicted.push(path),
  })

  expect(session.tryAcquirePreview('a.mp4')).toBe(true)
  expect(session.tryAcquirePreview('b.mp4')).toBe(true)
  expect(evicted).toEqual(['a.mp4'])
  session.releasePreview('b.mp4')
  session.dispose()
})

test('prioritizeCover moves a queued job to the front', async () => {
  const started: string[] = []
  let releaseFirst!: () => void
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (url) => {
      started.push(url)
      if (url === '/a') {
        await new Promise<void>((resolve) => { releaseFirst = resolve })
      }
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([10])]) }
    },
  })

  session.requestCover('a.mp4', '/a')
  session.requestCover('b.mp4', '/b')
  session.requestCover('c.mp4', '/c')
  session.prioritizeCover('c.mp4')
  releaseFirst()
  await delay(40)
  expect(started[0]).toBe('/a')
  expect(started[1]).toBe('/c')
  session.dispose()
})

test('acquiring preview suspends in-flight covers and requeues them', async () => {
  let aborted = 0
  let ran = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async (_url, signal) => {
      ran++
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted++
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([11])]) }
    },
  })

  session.requestCover('cover.mp4', '/cover')
  await delay(5)
  expect(ran).toBe(1)
  expect(session.tryAcquirePreview('play.mp4')).toBe(true)
  await delay(10)
  expect(aborted).toBe(1)
  session.releasePreview('play.mp4')
  await delay(10)
  expect(ran).toBe(2)
  session.dispose()
})
