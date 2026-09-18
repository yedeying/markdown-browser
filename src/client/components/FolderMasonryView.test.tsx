import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import FolderMasonryView from './FolderMasonryView.js'
import type { SelectionProps } from './FolderView.js'
import type { VideoCoverLoader } from '../utils/masonryVideoSession.js'

const instantCover: VideoCoverLoader = async () => ({
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  width: 16,
  height: 9,
})

async function waitForVideoTile(root: HTMLElement, timeoutMs = 1000): Promise<HTMLElement> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const tile = root.querySelector('.masonry-tile.is-video') as HTMLElement | null
    if (tile) return tile
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15))
    })
  }
  throw new Error('video tile did not appear')
}

class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe(target: Element) {
    Object.defineProperty(target, 'clientWidth', {
      configurable: true,
      get: () => 900,
    })
    this.callback([], this as unknown as ResizeObserver)
  }
  disconnect() {}
  unobserve() {}
}

class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = []
  readonly callback: IntersectionObserverCallback
  readonly observed = new Set<Element>()
  disconnected = false

  constructor(
    callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {
    this.callback = callback
    IntersectionObserverStub.instances.push(this)
  }
  observe(target: Element) { this.observed.add(target) }
  unobserve(target: Element) { this.observed.delete(target) }
  disconnect() {
    this.disconnected = true
    this.observed.clear()
  }
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

test('video stays as bottom skeleton until cover settles then shows play button', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
      coverLoader: instantCover,
    }), container)
  })

  expect(container.querySelector('.masonry-tile.is-video')).toBeNull()
  expect(container.querySelector('[data-testid="masonry-skeleton-tile"]')).not.toBeNull()

  const tile = await waitForVideoTile(container)
  expect(tile.querySelector('[data-testid="masonry-tile-play"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="masonry-skeleton-tile"]')).toBeNull()
})

test('masonry image tiles use /api/asset src, not blob urls', async () => {
  const OrigImage = globalThis.Image
  class FakeImage {
    onload: ((ev?: Event) => void) | null = null
    onerror: ((ev?: Event) => void) | null = null
    naturalWidth = 16
    naturalHeight = 9
    set src(_v: string) {
      queueMicrotask(() => this.onload?.(new Event('load')))
    }
  }
  ;(globalThis as unknown as { Image: typeof Image }).Image =
    FakeImage as unknown as typeof Image

  const imgNode: FileNode = { name: 'b.jpg', type: 'file', path: 'photos/b.jpg' }
  try {
    await act(async () => {
      render(h(FolderMasonryView, {
        nodes: [imgNode],
        currentPath: null,
        onSelect() {},
        selectionProps,
        coverLoader: instantCover,
      }), container)
    })
    await act(async () => {
      for (let i = 0; i < 40; i++) {
        if (container.querySelector('.masonry-tile img')) break
        await new Promise((resolve) => setTimeout(resolve, 15))
      }
    })
    const img = container.querySelector('.masonry-tile img') as HTMLImageElement | null
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('/api/asset/photos/b.jpg')
    expect(img!.getAttribute('src')?.startsWith('blob:')).toBe(false)
  } finally {
    ;(globalThis as unknown as { Image: typeof Image }).Image = OrigImage
  }
})

test('pending skeletons stay below settled tiles (no holes in the middle)', async () => {
  const imgReady: FileNode = { name: 'b.jpg', type: 'file', path: 'photos/b.jpg' }
  const imgPending: FileNode = { name: 'a.jpg', type: 'file', path: 'photos/a.jpg' }
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [imgPending, imgReady, videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
      coverLoader: async () => {
        await new Promise((r) => setTimeout(r, 300))
        return instantCover('', new AbortController().signal)
      },
    }), container)
  })

  // 手动标记一张图已就绪
  await act(async () => {
    const preload = container.querySelector('[data-testid="masonry-preload"]')
    expect(preload).not.toBeNull()
  })

  // 未就绪时：主列不应出现视频；骨架在底部区域（与 pending 对应）
  expect(container.querySelector('.masonry-tile.is-video')).toBeNull()
  const skeletons = container.querySelectorAll('[data-testid="masonry-skeleton-tile"]')
  expect(skeletons.length).toBeGreaterThanOrEqual(2)
})

test('video tile in selection mode still invokes long press', async () => {
  const longPressed: FileNode[] = []
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps: {
        ...selectionProps,
        selectionMode: true,
        onLongPress(node) { longPressed.push(node) },
      },
      coverLoader: instantCover,
    }), container)
  })

  const tile = await waitForVideoTile(container)
  tile.dispatchEvent(new dom.TouchEvent('touchstart', {
    bubbles: true,
    cancelable: true,
    touches: [{ clientX: 10, clientY: 10 }] as unknown as Touch[],
  }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 520))
  })

  expect(longPressed).toEqual([videoNode])
})

test('cover observer re-observes remounted video tiles after column layout', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
      coverLoader: instantCover,
    }), container)
  })
  const tile = await waitForVideoTile(container)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40))
  })

  const observer = IntersectionObserverStub.instances.find((o) => o.observed.has(tile))
    ?? IntersectionObserverStub.instances[0]
  expect(observer).toBeTruthy()
  expect(observer.disconnected).toBe(false)

  // 触发一次交叉回调，确认 observer 仍可用（封面已由父级 preload 拉取）
  await act(async () => {
    observer.callback([{
      target: tile,
      isIntersecting: true,
    } as IntersectionObserverEntry], observer as unknown as IntersectionObserver)
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  const live = container.querySelector('.masonry-tile.is-video') as HTMLElement
  expect(live).not.toBeNull()
  expect(observer.disconnected).toBe(false)
})

test('cover observer survives ratio-driven masonry repacks', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
      coverLoader: instantCover,
    }), container)
  })
  const video = await waitForVideoTile(container)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40))
  })
  const observer = IntersectionObserverStub.instances.find((o) => o.observed.has(video))
    ?? IntersectionObserverStub.instances[0]
  expect(observer).toBeTruthy()

  await act(async () => {
    observer.callback([{
      target: video,
      isIntersecting: true,
    } as IntersectionObserverEntry], observer as unknown as IntersectionObserver)
    await new Promise((resolve) => setTimeout(resolve, 150))
  })

  expect(observer.disconnected).toBe(false)
  expect(container.querySelector('.masonry-tile.is-video')).not.toBeNull()
})

test('mouse hover mounts a muted preview and leaving removes it', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
      coverLoader: instantCover,
    }), container)
  })

  const tile = await waitForVideoTile(container)
  await act(async () => {
    tile.dispatchEvent(new dom.PointerEvent('pointerenter', {
      bubbles: true,
      pointerType: 'mouse',
    }))
  })

  const preview = tile.querySelector('video')
  expect(preview?.getAttribute('src')).toBe('/api/asset/videos/clip.mp4')
  expect(preview?.muted).toBe(true)
  expect(preview?.loop).toBe(false)
  expect(preview?.hasAttribute('playsinline')).toBe(true)

  await act(async () => {
    tile.dispatchEvent(new dom.PointerEvent('pointerleave', {
      bubbles: true,
      pointerType: 'mouse',
    }))
  })
  expect(tile.querySelector('video')).toBeNull()
})

test('clicking the play button starts in-place preview without selecting the tile', async () => {
  const selected: FileNode[] = []
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect(node) { selected.push(node) },
      selectionProps,
      coverLoader: instantCover,
    }), container)
  })

  await waitForVideoTile(container)
  const play = container.querySelector('[data-testid="masonry-tile-play"]') as HTMLButtonElement
  expect(play).not.toBeNull()
  await act(async () => {
    play.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, cancelable: true }))
  })

  const tile = container.querySelector('.masonry-tile.is-video') as HTMLElement
  expect(tile.querySelector('video')?.getAttribute('src')).toBe('/api/asset/videos/clip.mp4')
  expect(tile.querySelector('video')?.loop).toBe(false)
  expect(selected).toEqual([])
  expect(play.textContent).toBe('■')

  await act(async () => {
    play.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  expect(tile.querySelector('video')).toBeNull()
  expect(play.textContent).toBe('▶')
  expect(selected).toEqual([])
})

test('stop button works even when hover already started preview', async () => {
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect() {},
      selectionProps,
      coverLoader: instantCover,
    }), container)
  })

  const tile = await waitForVideoTile(container)
  const play = container.querySelector('[data-testid="masonry-tile-play"]') as HTMLButtonElement
  await act(async () => {
    tile.dispatchEvent(new dom.PointerEvent('pointerenter', {
      bubbles: true,
      pointerType: 'mouse',
    }))
  })
  expect(tile.querySelector('video')).not.toBeNull()
  expect(play.textContent).toBe('■')

  await act(async () => {
    play.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  expect(tile.querySelector('video')).toBeNull()
  expect(play.textContent).toBe('▶')
})

test('limits simultaneous previews to one tile and steals on new start', async () => {
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
      coverLoader: instantCover,
    }), container)
  })

  await waitForVideoTile(container)
  await act(async () => {
    for (let i = 0; i < 40; i++) {
      if (container.querySelectorAll('.masonry-tile.is-video').length >= 3) break
      await new Promise((resolve) => setTimeout(resolve, 15))
    }
  })
  const tiles = [...container.querySelectorAll('.masonry-tile.is-video')]
  expect(tiles.length).toBe(3)
  await act(async () => {
    tiles[0]!.dispatchEvent(new dom.PointerEvent('pointerenter', {
      bubbles: true,
      pointerType: 'mouse',
    }))
  })
  expect(container.querySelectorAll('.masonry-tile-video-preview')).toHaveLength(1)

  await act(async () => {
    tiles[1]!.dispatchEvent(new dom.PointerEvent('pointerenter', {
      bubbles: true,
      pointerType: 'mouse',
    }))
  })
  expect(container.querySelectorAll('.masonry-tile-video-preview')).toHaveLength(1)
  expect(tiles[1]!.querySelector('.masonry-tile-video-preview')).toBeTruthy()
  expect(tiles[0]!.querySelector('.masonry-tile-video-preview')).toBeNull()
})

test('touch long-press suppresses context menu and lift still opens the video', async () => {
  const selected: FileNode[] = []
  await act(async () => {
    render(h(FolderMasonryView, {
      nodes: [videoNode],
      currentPath: null,
      onSelect(node) { selected.push(node) },
      selectionProps,
      coverLoader: instantCover,
    }), container)
  })

  const tile = await waitForVideoTile(container)
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
      coverLoader: instantCover,
    }), container)
  })

  const tile = await waitForVideoTile(container)
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
