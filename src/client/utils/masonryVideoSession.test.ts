import { test, expect, afterEach } from 'bun:test'
import { MasonryVideoSession } from './masonryVideoSession.ts'

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

test('cover capture and previews share one concurrency budget', async () => {
  let releaseCover!: () => void
  const session = new MasonryVideoSession({
    maxConcurrent: 2,
    loader: async () => {
      await new Promise<void>((resolve) => { releaseCover = resolve })
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([8])]) }
    },
  })

  session.requestCover('cover.mp4', '/cover')
  expect(session.tryAcquirePreview('preview-a.mp4')).toBe(true)
  expect(session.tryAcquirePreview('preview-b.mp4')).toBe(false)

  releaseCover()
  await delay(20)
  expect(session.tryAcquirePreview('preview-b.mp4')).toBe(true)
  session.dispose()
})

test('a preview slot keeps queued cover capture within the shared budget', async () => {
  let ran = 0
  const session = new MasonryVideoSession({
    maxConcurrent: 1,
    loader: async () => {
      ran++
      return { width: 16, height: 9, blob: new Blob([new Uint8Array([9])]) }
    },
  })

  expect(session.tryAcquirePreview('preview.mp4')).toBe(true)
  session.requestCover('cover.mp4', '/cover')
  expect(ran).toBe(0)
  session.releasePreview('preview.mp4')
  await delay(20)
  expect(ran).toBe(1)
  session.dispose()
})
