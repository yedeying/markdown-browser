import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import FolderMasonryView from './FolderMasonryView.js'
import type { SelectionProps } from './FolderView.js'

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = []
  readonly callback: IntersectionObserverCallback
  disconnected = false

  constructor(
    callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {
    this.callback = callback
    IntersectionObserverStub.instances.push(this)
  }
  observe() {}
  disconnect() { this.disconnected = true }
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = []
}

const videoNode: FileNode = {
  name: 'clip.mp4',
  path: 'videos/clip.mp4',
  type: 'file',
}

const selectionProps: SelectionProps = {
  selectedPaths: new Set(),
  selectionMode: false,
  onToggleSelect() {},
  onEnterSelectionMode() {},
  onClearSelection() {},
  onContextMenu() {},
  onLongPress() {},
}

let dom: Window
let container: HTMLElement

beforeEach(() => {
  IntersectionObserverStub.instances = []
  dom = new Window()
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { localStorage: Storage }).localStorage =
    dom.localStorage as unknown as Storage
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
  ;(globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).localStorage
  delete (globalThis as Partial<typeof globalThis>).ResizeObserver
  delete (globalThis as Partial<typeof globalThis>).IntersectionObserver
})

test('video tile shows a finite loading placeholder before its cover settles', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
    }), container)
  })

  expect(container.querySelector('.masonry-tile.is-video .masonry-placeholder')).not.toBeNull()
})

test('image tile outside selection mode still invokes long press', async () => {
  const imageNode: FileNode = {
    name: 'photo.jpg',
    path: 'photos/photo.jpg',
    type: 'file',
  }
  const longPressed: FileNode[] = []
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [imageNode],
      currentPath: null,
      onSelect() {},
      selectionProps: {
        ...selectionProps,
        onLongPress(node) { longPressed.push(node) },
      },
    }), container)
  })

  const tile = container.querySelector('.masonry-tile') as HTMLElement
  tile.dispatchEvent(new dom.TouchEvent('touchstart', {
    bubbles: true,
    cancelable: true,
    touches: [{ clientX: 10, clientY: 10 }] as unknown as Touch[],
  }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520))
  })

  expect(longPressed).toEqual([imageNode])
})

test('cover observer survives ratio-driven masonry repacks', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
    }), container)
  })
  expect(IntersectionObserverStub.instances).toHaveLength(1)
  const observer = IntersectionObserverStub.instances[0]

  const video = container.querySelector('.masonry-tile.is-video') as HTMLElement
  await act(async () => {
    observer.callback([{
      target: video,
      isIntersecting: true,
    } as IntersectionObserverEntry], observer as unknown as IntersectionObserver)
    await new Promise((resolve) => setTimeout(resolve, 150))
  })

  expect(IntersectionObserverStub.instances).toHaveLength(1)
  expect(observer.disconnected).toBe(false)
})

test('mouse hover mounts a muted looping preview and leaving removes it', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
    }), container)
  })

  const tile = container.querySelector('.masonry-tile.is-video') as HTMLElement
  await act(async () => {
    tile.dispatchEvent(new dom.PointerEvent('pointerenter', {
      bubbles: true,
      pointerType: 'mouse',
    }))
  })

  const preview = tile.querySelector('video')
  expect(preview?.getAttribute('src')).toBe('/api/asset/videos/clip.mp4')
  expect(preview?.muted).toBe(true)
  expect(preview?.loop).toBe(true)
  expect(preview?.hasAttribute('playsinline')).toBe(true)

  await act(async () => {
    tile.dispatchEvent(new dom.PointerEvent('pointerleave', {
      bubbles: true,
      pointerType: 'mouse',
    }))
  })
  expect(tile.querySelector('video')).toBeNull()
})

test('limits simultaneous previews to two tiles', async () => {
  const nodes = ['one.mp4', 'two.mp4', 'three.mp4'].map((name): FileNode => ({
    name,
    path: `videos/${name}`,
    type: 'file',
  }))
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes,
      currentPath: null,
      onSelect() {},
      selectionProps,
    }), container)
  })

  const tiles = [...container.querySelectorAll('.masonry-tile.is-video')]
  await act(async () => {
    for (const tile of tiles) {
      tile.dispatchEvent(new dom.PointerEvent('pointerenter', {
        bubbles: true,
        pointerType: 'mouse',
      }))
    }
  })

  expect(container.querySelectorAll('.masonry-tile-video-preview')).toHaveLength(2)
})

test('touch long-press suppresses context menu and lift still opens the video', async () => {
  const selected: FileNode[] = []
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect(node) { selected.push(node) },
      selectionProps,
    }), container)
  })

  const tile = container.querySelector('.masonry-tile.is-video') as HTMLElement
  tile.dispatchEvent(new dom.PointerEvent('pointerdown', {
    bubbles: true,
    pointerType: 'touch',
    clientX: 10,
    clientY: 10,
  }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520))
  })
  const contextMenu = new dom.MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  tile.dispatchEvent(contextMenu)
  tile.dispatchEvent(new dom.PointerEvent('pointerup', {
    bubbles: true,
    pointerType: 'touch',
    clientX: 10,
    clientY: 10,
  }))
  tile.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, cancelable: true }))

  expect(contextMenu.defaultPrevented).toBe(true)
  expect(selected).toEqual([videoNode])
})

test('touch movement beyond ten pixels cancels opening the video', async () => {
  const selected: FileNode[] = []
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect(node) { selected.push(node) },
      selectionProps,
    }), container)
  })

  const tile = container.querySelector('.masonry-tile.is-video') as HTMLElement
  tile.dispatchEvent(new dom.PointerEvent('pointerdown', {
    bubbles: true,
    pointerType: 'touch',
    clientX: 10,
    clientY: 10,
  }))
  tile.dispatchEvent(new dom.PointerEvent('pointermove', {
    bubbles: true,
    pointerType: 'touch',
    clientX: 21,
    clientY: 10,
  }))
  tile.dispatchEvent(new dom.PointerEvent('pointerup', {
    bubbles: true,
    pointerType: 'touch',
    clientX: 21,
    clientY: 10,
  }))
  tile.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, cancelable: true }))

  expect(selected).toEqual([])
})
