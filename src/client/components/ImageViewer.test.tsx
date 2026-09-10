import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import ImageViewer from './ImageViewer.js'

mock.module('katex/dist/contrib/auto-render', () => ({ default: () => {} }))

let dom: Window
let container: HTMLElement

beforeEach(() => {
  dom = new Window()
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { navigator: Navigator }).navigator = dom.navigator as unknown as Navigator
  ;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
    (callback) => setTimeout(() => callback(Date.now()), 0) as unknown as number
  ;(globalThis as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
    (id) => clearTimeout(id)
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).navigator
  delete (globalThis as Partial<typeof globalThis>).requestAnimationFrame
  delete (globalThis as Partial<typeof globalThis>).cancelAnimationFrame
})

function click(testId: string) {
  const button = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement
  act(() => button.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
}

test('toolbar controls image transform and changing files resets it', () => {
  act(() => render(h(ImageViewer, { filePath: 'photos/a.jpg' }), container))
  const image = container.querySelector('img') as HTMLImageElement
  expect(image.style.transform).toBe('rotate(0deg) scale(1)')

  click('image-viewer-zoom-in')
  click('image-viewer-rotate-right')
  expect(image.style.transform).toBe('rotate(90deg) scale(1.25)')

  act(() => render(h(ImageViewer, { filePath: 'photos/b.jpg' }), container))
  expect((container.querySelector('img') as HTMLImageElement).style.transform)
    .toBe('rotate(0deg) scale(1)')
})

test('quarter-turn rotation fits against the swapped stage axes', () => {
  act(() => render(h(ImageViewer, { filePath: 'photos/a.jpg' }), container))
  const image = container.querySelector('img') as HTMLImageElement

  click('image-viewer-rotate-right')
  expect(image.classList.contains('is-quarter-turn')).toBe(true)

  const css = readFileSync(join(import.meta.dir, '../styles/layout.css'), 'utf8')
  expect(css).toMatch(/\.image-viewer-stage img\.is-quarter-turn\s*\{[^}]*max-width:\s*100cqh/s)
  expect(css).toMatch(/\.image-viewer-stage img\.is-quarter-turn\s*\{[^}]*max-height:\s*100cqw/s)
})

test('only ctrl or command wheel zooms the image and prevents browser zoom', () => {
  act(() => render(h(ImageViewer, { filePath: 'photos/a.jpg' }), container))
  const stage = container.querySelector('[data-testid="image-viewer-stage"]') as HTMLElement
  const image = container.querySelector('img') as HTMLImageElement

  const plainWheel = new dom.WheelEvent('wheel', { bubbles: true, deltaY: -1 })
  act(() => stage.dispatchEvent(plainWheel))
  expect(image.style.transform).toBe('rotate(0deg) scale(1)')
  expect(plainWheel.defaultPrevented).toBe(false)

  const ctrlWheel = new dom.WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: -1,
  })
  Object.defineProperty(ctrlWheel, 'ctrlKey', { value: true })
  act(() => stage.dispatchEvent(ctrlWheel))
  expect(image.style.transform).toBe('rotate(0deg) scale(1.25)')
  expect(ctrlWheel.defaultPrevented).toBe(true)
})

test('playlist controls navigate to adjacent media paths', () => {
  const playlist: FileNode[] = [
    { name: 'a.jpg', path: 'photos/a.jpg', type: 'file' },
    { name: 'b.mp4', path: 'photos/b.mp4', type: 'file' },
    { name: 'c.png', path: 'photos/c.png', type: 'file' },
  ]
  const navigated: string[] = []
  act(() => render(h(ImageViewer, {
    filePath: 'photos/b.mp4',
    playlist,
    onNavigate: (path) => navigated.push(path),
  }), container))

  expect(container.querySelector('[data-testid="image-viewer-count"]')?.textContent).toContain('2 / 3')
  click('image-viewer-prev')
  click('image-viewer-next')
  expect(navigated).toEqual(['photos/a.jpg', 'photos/c.png'])
})

test('playlist navigation wraps from the first item to the last', () => {
  const playlist: FileNode[] = [
    { name: 'a.jpg', path: 'photos/a.jpg', type: 'file' },
    { name: 'b.mp4', path: 'photos/b.mp4', type: 'file' },
    { name: 'c.png', path: 'photos/c.png', type: 'file' },
  ]
  const navigated: string[] = []
  act(() => render(h(ImageViewer, {
    filePath: 'photos/a.jpg',
    playlist,
    onNavigate: (path) => navigated.push(path),
  }), container))

  click('image-viewer-prev')
  expect(navigated).toEqual(['photos/c.png'])
})

test('ContentArea builds the visible sibling playlist and selects the navigated tree node', async () => {
  const { default: ContentArea } = await import('./ContentArea.js')
  const tree: FileNode[] = [
    {
      name: 'photos',
      path: 'photos',
      type: 'folder',
      children: [
        { name: 'a.jpg', path: 'photos/a.jpg', type: 'file' },
        { name: '.hidden.png', path: 'photos/.hidden.png', type: 'file' },
        { name: 'b.png', path: 'photos/b.png', type: 'file' },
      ],
    },
  ]
  const selected: string[] = []
  const navigated: string[] = []
  act(() => render(h(ContentArea, {
    filePath: 'photos/a.jpg',
    content: null,
    loading: false,
    error: null,
    theme: 'light',
    tree,
    selectedNode: tree[0].children![0],
    showHidden: false,
    onSelectNode: (node) => selected.push(node.path),
    onNavigate: (path) => navigated.push(path),
  }), container))

  expect(container.querySelector('[data-testid="image-viewer-count"]')?.textContent).toContain('1 / 2')
  click('image-viewer-next')
  expect(selected).toEqual(['photos/b.png'])
  expect(navigated).toEqual([])
})
