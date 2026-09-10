import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import VideoViewer from './VideoViewer.js'

mock.module('katex/dist/contrib/auto-render', () => ({ default: () => {} }))

let dom: Window
let container: HTMLElement

beforeEach(() => {
  dom = new Window()
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { navigator: Navigator }).navigator = dom.navigator as unknown as Navigator
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).navigator
})

function click(testId: string) {
  const button = container.querySelector(`[data-testid="${testId}"]`) as HTMLElement
  act(() => button.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
}

test('video toolbar shows download and copy but no zoom or rotate', () => {
  act(() => render(h(VideoViewer, { filePath: 'clips/a.mp4' }), container))
  expect(container.querySelector('[data-testid="video-viewer-download"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="video-viewer-copy-path"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="video-viewer-zoom-in"]')).toBeNull()
  expect(container.querySelector('[data-testid="video-viewer-rotate-left"]')).toBeNull()
})

test('playlist controls navigate to adjacent media paths', () => {
  const playlist: FileNode[] = [
    { name: 'a.jpg', path: 'photos/a.jpg', type: 'file' },
    { name: 'b.mp4', path: 'photos/b.mp4', type: 'file' },
    { name: 'c.mp4', path: 'photos/c.mp4', type: 'file' },
  ]
  const navigated: string[] = []
  act(() => render(h(VideoViewer, {
    filePath: 'photos/b.mp4',
    playlist,
    onNavigate: (path) => navigated.push(path),
  }), container))

  expect(container.querySelector('[data-testid="video-viewer-count"]')?.textContent).toContain('2 / 3')
  click('video-viewer-prev')
  click('video-viewer-next')
  expect(navigated).toEqual(['photos/a.jpg', 'photos/c.mp4'])
})

test('ContentArea builds video playlist and selects the navigated tree node', async () => {
  const { default: ContentArea } = await import('./ContentArea.js')
  const tree: FileNode[] = [
    {
      name: 'clips',
      path: 'clips',
      type: 'folder',
      children: [
        { name: 'a.mp4', path: 'clips/a.mp4', type: 'file' },
        { name: 'b.mp4', path: 'clips/b.mp4', type: 'file' },
      ],
    },
  ]
  const selected: string[] = []
  act(() => render(h(ContentArea, {
    filePath: 'clips/a.mp4',
    content: null,
    loading: false,
    error: null,
    theme: 'light',
    tree,
    selectedNode: tree[0].children![0],
    showHidden: false,
    onSelectNode: (node) => selected.push(node.path),
  }), container))

  expect(container.querySelector('[data-testid="video-viewer-count"]')?.textContent).toContain('1 / 2')
  click('video-viewer-next')
  expect(selected).toEqual(['clips/b.mp4'])
})
