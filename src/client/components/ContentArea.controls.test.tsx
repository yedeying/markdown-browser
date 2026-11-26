import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import { getPref, setPref } from '../utils/prefs.js'

mock.module('mermaid', () => ({
  default: {
    initialize: () => {},
    run: async () => {},
  },
}))
mock.module('katex/dist/katex.min.css', () => ({}))
mock.module('katex/dist/contrib/auto-render', () => ({
  default: () => {},
}))

const { default: ContentArea } = await import('./ContentArea.js')

let dom: Window
let container: HTMLElement

beforeEach(() => {
  dom = new Window({ url: 'http://localhost:8888/' })
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { navigator: Navigator }).navigator = dom.navigator as unknown as Navigator
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = dom.localStorage as unknown as Storage
  ;(globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement = dom.HTMLElement as unknown as typeof HTMLElement
  ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
    dom.requestAnimationFrame.bind(dom) as unknown as typeof requestAnimationFrame
  ;(globalThis as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
    dom.cancelAnimationFrame.bind(dom) as unknown as typeof cancelAnimationFrame
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).navigator
  delete (globalThis as Partial<typeof globalThis>).localStorage
  delete (globalThis as Partial<typeof globalThis>).HTMLElement
})

test('sidebarCollapsed preference persists via localStorage', () => {
  expect(getPref('sidebarCollapsed')).toBe(false)
  setPref('sidebarCollapsed', true)
  expect(getPref('sidebarCollapsed')).toBe(true)
  setPref('sidebarCollapsed', false)
  expect(getPref('sidebarCollapsed')).toBe(false)
})

test('desktop sidebar toggle button reflects collapsed state and invokes callback', () => {
  let toggled = 0
  act(() => render(h(ContentArea, {
    filePath: 'photos/a.jpg',
    content: null,
    contentReady: true,
    loading: false,
    error: null,
    theme: 'light',
    sidebarCollapsed: false,
    onToggleDesktopSidebar: () => { toggled++ },
  }), container))

  const btn = container.querySelector('[data-testid="toggle-sidebar"]') as HTMLButtonElement
  expect(btn).not.toBeNull()
  expect(btn.getAttribute('aria-expanded')).toBe('true')

  act(() => btn.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
  expect(toggled).toBe(1)

  act(() => render(h(ContentArea, {
    filePath: 'photos/a.jpg',
    content: null,
    contentReady: true,
    loading: false,
    error: null,
    theme: 'light',
    sidebarCollapsed: true,
    onToggleDesktopSidebar: () => { toggled++ },
  }), container))
  expect((container.querySelector('[data-testid="toggle-sidebar"]') as HTMLButtonElement).getAttribute('aria-expanded')).toBe('false')
})

test('back-to-top button binds after file loads, appears on scroll > 300, and scrolls back to top', () => {
  // First render in loading state (contentBodyRef is null on initial mount!)
  act(() => render(h(ContentArea, {
    filePath: 'docs/long.jsonl',
    content: null,
    contentReady: false,
    loading: true,
    error: null,
    theme: 'light',
  }), container))

  expect(container.querySelector('[data-testid="back-to-top"]')).toBeNull()

  // Now file finishes loading -> .content-body mounts and scroll listener must bind!
  const longJsonl = Array.from({ length: 40 }, (_, i) => JSON.stringify({ id: i + 1, text: 'Long line' })).join('\n')
  act(() => render(h(ContentArea, {
    filePath: 'docs/long.jsonl',
    content: longJsonl,
    contentReady: true,
    loading: false,
    error: null,
    theme: 'light',
  }), container))

  const body = container.querySelector('.content-body') as HTMLElement
  expect(body).not.toBeNull()
  expect(container.querySelector('[data-testid="back-to-top"]')).toBeNull()

  let scrolledToTop = false
  body.scrollTo = ((opts?: ScrollToOptions | number) => {
    const top = typeof opts === 'number' ? opts : (opts?.top ?? 0)
    body.scrollTop = top
    if (top === 0) scrolledToTop = true
  }) as typeof body.scrollTo

  // Simulate scrolling past 300px
  body.scrollTop = 640
  act(() => body.dispatchEvent(new dom.Event('scroll')))

  const backTopBtn = container.querySelector('[data-testid="back-to-top"]') as HTMLButtonElement
  expect(backTopBtn).not.toBeNull()

  // Clicking back-to-top scrolls container smoothly back to 0
  act(() => backTopBtn.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
  expect(scrolledToTop).toBe(true)
  expect(body.scrollTop).toBe(0)
})
