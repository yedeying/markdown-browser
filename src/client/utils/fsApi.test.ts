import { test, expect, beforeEach } from 'bun:test'
import { withHidden } from './fsApi.ts'

// 服务端默认不返回点文件，读取类 API 必须显式带上 showHidden=1。
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
  expect(withHidden('/api/file/notes/a.md', false)).toBe('/api/file/notes/a.md')
})

test('withHidden appends the flag with the right separator', () => {
  expect(withHidden('/api/files?path=&depth=1', true)).toBe('/api/files?path=&depth=1&showHidden=1')
  expect(withHidden('/api/file/notes/a.md', true)).toBe('/api/file/notes/a.md?showHidden=1')
})

test('withHidden falls back to the stored vmd_show_hidden preference', () => {
  expect(withHidden('/api/search?q=x')).toBe('/api/search?q=x')
  localStorage.setItem('vmd_show_hidden', '1')
  expect(withHidden('/api/search?q=x')).toBe('/api/search?q=x&showHidden=1')
  localStorage.setItem('vmd_show_hidden', '0')
  expect(withHidden('/api/search?q=x')).toBe('/api/search?q=x')
})
