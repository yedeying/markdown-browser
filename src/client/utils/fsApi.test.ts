import { test, expect, beforeEach } from 'bun:test'
import { assetUrl, displayAssetUrl, masonryAssetUrl, withHidden } from './fsApi.ts'

// showHidden 只加在列举类 API 上；读取单个路径不需要它。

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
})

test('withHidden leaves the url untouched when hidden files are off', () => {
  expect(withHidden('/api/files?path=&depth=1', false)).toBe('/api/files?path=&depth=1')
})

test('withHidden appends the flag with the right separator', () => {
  expect(withHidden('/api/files?path=&depth=1', true)).toBe('/api/files?path=&depth=1&showHidden=1')
  expect(withHidden('/api/search', true)).toBe('/api/search?showHidden=1')
})

test('withHidden falls back to the stored vmd_show_hidden preference', () => {
  expect(withHidden('/api/search?q=x')).toBe('/api/search?q=x')
  localStorage.setItem('vmd_show_hidden', '1')
  expect(withHidden('/api/search?q=x')).toBe('/api/search?q=x&showHidden=1')
  localStorage.setItem('vmd_show_hidden', '0')
  expect(withHidden('/api/search?q=x')).toBe('/api/search?q=x')
})

test('displayAssetUrl forces webp for heic/heif', () => {
  expect(displayAssetUrl('a.heic')).toBe('/api/asset/a.heic?fmt=webp')
  expect(displayAssetUrl('a.HEIF', { w: 800 })).toBe('/api/asset/a.HEIF?fmt=webp')
  expect(displayAssetUrl('a.png')).toBe('/api/asset/a.png')
})

test('masonryAssetUrl uses a plain asset URL for original quality and w/fmt for thumbs', () => {
  expect(masonryAssetUrl('pics/a.png', 'original', 320)).toBe('/api/asset/pics/a.png')
  expect(masonryAssetUrl('pics/a.png', 'thumb', 320)).toBe('/api/asset/pics/a.png?w=320&fmt=webp')
  expect(masonryAssetUrl('pics/a.heic', 'original', 320)).toBe('/api/asset/pics/a.heic?fmt=webp')
  expect(masonryAssetUrl('pics/a.heic', 'thumb', 240)).toBe('/api/asset/pics/a.heic?fmt=webp')
})

test('assetUrl appends w/fmt query params and never carries showHidden', () => {
  expect(assetUrl('pics/a.png')).toBe('/api/asset/pics/a.png')
  expect(assetUrl('pics/a.png', { w: 400 })).toBe('/api/asset/pics/a.png?w=400')
  localStorage.setItem('vmd_show_hidden', '1')
  expect(assetUrl('pics/a.png', { w: 400, fmt: 'webp' })).toBe(
    '/api/asset/pics/a.png?w=400&fmt=webp',
  )
})

test('fetchAssetBlob aborts in-flight request when signal aborts', async () => {
  const { fetchAssetBlob } = await import('./fsApi.ts')
  let sawAbort = false
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) return
      if (signal.aborted) {
        sawAbort = true
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal.addEventListener('abort', () => {
        sawAbort = true
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })) as typeof fetch

  try {
    const ac = new AbortController()
    const p = fetchAssetBlob('pics/a.png', { w: 400, fmt: 'webp', signal: ac.signal })
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(sawAbort).toBe(true)
  } finally {
    globalThis.fetch = originalFetch
  }
})
