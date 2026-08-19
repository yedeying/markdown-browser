import { test, expect, beforeEach } from 'bun:test'
import { getScroll, setScroll } from './scrollMemory.ts'

// bun:test 默认没有浏览器环境的 sessionStorage，这里提供一个最小的内存实现。
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
  ;(globalThis as unknown as { sessionStorage: MemoryStorage }).sessionStorage = new MemoryStorage()
})

test('roundtrip scroll', () => {
  setScroll('notes/a.md', 120)
  expect(getScroll('notes/a.md')).toBe(120)
})

test('getScroll returns null for unknown path', () => {
  expect(getScroll('notes/missing.md')).toBeNull()
})

test('getScroll returns null for non-numeric stored value', () => {
  sessionStorage.setItem('vmd_scroll:notes/bad.md', 'not-a-number')
  expect(getScroll('notes/bad.md')).toBeNull()
})

test('setScroll overwrites previous value for same path', () => {
  setScroll('notes/a.md', 50)
  setScroll('notes/a.md', 200)
  expect(getScroll('notes/a.md')).toBe(200)
})
