import { test, expect, beforeEach, afterEach } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import { setPref, type PrefKey } from '../utils/prefs.js'
import { usePref } from './usePref.js'

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
  get length(): number {
    return this.store.size
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
}

/**
 * 必须用完整 DOM（含 documentElement.style）。
 * 残缺 stub 会污染进程内的 globalThis.document；若之后再加载
 * @codemirror/view（例如 editorLang 测试），会在模块顶层炸：
 *   TypeError: undefined is not an object (evaluating 'doc.documentElement.style')
 * CI 上文件执行顺序更容易踩中，本地常因缓存/顺序不同而误过。
 */
let dom: Window
let container: HTMLElement
let latestValue: unknown

function PrefProbe({ prefKey }: { prefKey: PrefKey }) {
  const [value] = usePref(prefKey)
  latestValue = value
  return null
}

beforeEach(() => {
  dom = new Window()
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
  container = dom.document.createElement('div')
  dom.document.body.appendChild(container)
  latestValue = undefined
})

afterEach(() => {
  act(() => {
    render(null, container)
  })
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).localStorage
})

test('usePref resynchronizes to the new key current value when prefKey changes', async () => {
  setPref('theme', 'light')
  setPref('accent', 'blue')

  await act(async () => {
    render(h(PrefProbe, { prefKey: 'theme' }), container)
  })
  expect(latestValue).toBe('light')

  await act(async () => {
    render(h(PrefProbe, { prefKey: 'accent' }), container)
  })
  expect(latestValue).toBe('blue')
})
