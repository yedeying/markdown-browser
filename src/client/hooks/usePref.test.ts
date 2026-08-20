import { test, expect, beforeEach, afterEach } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
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

function makeElement() {
  const el = {
    parentNode: null as typeof el | null,
    childNodes: [] as typeof el[],
    style: {} as Record<string, string>,
    setAttribute() {},
    removeAttribute() {},
    appendChild(child: typeof el) {
      child.parentNode = el
      el.childNodes.push(child)
      return child
    },
    removeChild(child: typeof el) {
      el.childNodes = el.childNodes.filter((node) => node !== child)
      child.parentNode = null
    },
    insertBefore(child: typeof el) {
      return el.appendChild(child)
    },
    addEventListener() {},
    removeEventListener() {},
    get firstChild() {
      return el.childNodes[0] ?? null
    },
  }
  return el
}

function installDomStub() {
  const documentStub = {
    createElement() {
      return makeElement()
    },
    createTextNode(text: string) {
      return { nodeValue: text, parentNode: null }
    },
    body: makeElement(),
  }
  ;(globalThis as { document: typeof documentStub }).document = documentStub
  ;(globalThis as { Node: { DOCUMENT_NODE: number; ELEMENT_NODE: number; TEXT_NODE: number } }).Node = {
    DOCUMENT_NODE: 9,
    ELEMENT_NODE: 1,
    TEXT_NODE: 3,
  }
}

let container: ReturnType<typeof makeElement>
let latestValue: unknown

function PrefProbe({ prefKey }: { prefKey: PrefKey }) {
  const [value] = usePref(prefKey)
  latestValue = value
  return null
}

beforeEach(() => {
  installDomStub()
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
  container = makeElement()
  document.body.appendChild(container)
  latestValue = undefined
})

afterEach(() => {
  act(() => {
    render(null, container)
  })
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
