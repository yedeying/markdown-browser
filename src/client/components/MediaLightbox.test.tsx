import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import MediaLightbox, { resolveTapZone } from './MediaLightbox.js'

let dom: Window
let container: HTMLElement

const playlist: FileNode[] = [
  { name: 'a.jpg', path: 'photos/a.jpg', type: 'file' },
  { name: 'b.png', path: 'photos/b.png', type: 'file' },
  { name: 'clip.mp4', path: 'photos/clip.mp4', type: 'file' },
]

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

test('shared toolbar controls image transform and resets it for each path', () => {
  act(() => render(h(MediaLightbox, {
    playlist,
    startPath: 'photos/a.jpg',
    onClose: () => {},
  }), container))

  expect(container.querySelector('[data-testid="media-lightbox-download"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-close"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-copy-path"]')).not.toBeNull()
  const scroll = container.querySelector('.media-toolbar-actions-scroll')
  const close = container.querySelector('[data-testid="media-lightbox-close"]')
  expect(scroll?.contains(close)).toBe(false)
  expect(close?.parentElement?.classList.contains('media-toolbar-pinned')).toBe(true)

  const image = container.querySelector('img') as HTMLImageElement
  click('media-lightbox-zoom-in')
  click('media-lightbox-rotate-right')
  expect(image.style.transform).toBe('rotate(90deg) scale(1.25)')

  click('media-lightbox-next')
  expect((container.querySelector('img') as HTMLImageElement).style.transform)
    .toBe('rotate(0deg) scale(1)')
})

test('video keeps navigation toolbar actions but hides image transform actions', () => {
  act(() => render(h(MediaLightbox, {
    playlist,
    startPath: 'photos/clip.mp4',
    onClose: () => {},
  }), container))

  expect(container.querySelector('video')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-prev"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-next"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-zoom-in"]')).toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-rotate-right"]')).toBeNull()
})

test('items mode renders direct image URLs and toggles is-quarter-turn on 90deg rotation', () => {
  act(() => render(h(MediaLightbox, {
    items: [
      { name: 'Diagram', path: 'docs/diagram.png', src: '/api/asset/docs/diagram.png', assetPath: 'docs/diagram.png', kind: 'image' },
      { name: 'External', path: 'https://example.com/pic.jpg', src: 'https://example.com/pic.jpg', kind: 'image' },
    ],
    startIndex: 0,
    onClose: () => {},
  }), container))

  const img = container.querySelector('img') as HTMLImageElement
  expect(img.getAttribute('src')).toBe('/api/asset/docs/diagram.png')
  expect(img.classList.contains('is-quarter-turn')).toBe(false)

  click('media-lightbox-rotate-right')
  expect(img.classList.contains('is-quarter-turn')).toBe(true)

  click('media-lightbox-rotate-right')
  expect(img.classList.contains('is-quarter-turn')).toBe(false)

  click('media-lightbox-next')
  const nextImg = container.querySelector('img') as HTMLImageElement
  expect(nextImg.getAttribute('src')).toBe('https://example.com/pic.jpg')
})

test('three-zone click (left/middle/right) navigates prev/next and toggles chrome', () => {
  expect(resolveTapZone(50, 0, 300)).toBe('prev')
  expect(resolveTapZone(150, 0, 300)).toBe('toggle-chrome')
  expect(resolveTapZone(250, 0, 300)).toBe('next')

  act(() => render(h(MediaLightbox, {
    items: [
      { name: 'one.png', path: 'one.png', src: '/api/asset/one.png', kind: 'image' },
      { name: 'two.png', path: 'two.png', src: '/api/asset/two.png', kind: 'image' },
      { name: 'three.png', path: 'three.png', src: '/api/asset/three.png', kind: 'image' },
    ],
    startIndex: 0,
    onClose: () => {},
  }), container))

  const overlay = container.querySelector('[data-testid="media-lightbox"]') as HTMLElement
  overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600, x: 0, y: 0, toJSON: () => {} }) as DOMRect

  // Right third -> next image (2 / 3)
  act(() => overlay.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, clientX: 800 })))
  expect(container.querySelector('[data-testid="media-lightbox-count"]')?.textContent?.trim()).toBe('2 / 3')

  // Middle third -> hides chrome
  expect(overlay.classList.contains('is-chrome-hidden')).toBe(false)
  act(() => overlay.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, clientX: 450 })))
  expect(overlay.classList.contains('is-chrome-hidden')).toBe(true)

  // Middle third again -> shows chrome
  act(() => overlay.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, clientX: 450 })))
  expect(overlay.classList.contains('is-chrome-hidden')).toBe(false)

  // Left third -> prev image (1 / 3)
  act(() => overlay.dispatchEvent(new dom.MouseEvent('click', { bubbles: true, clientX: 100 })))
  expect(container.querySelector('[data-testid="media-lightbox-count"]')?.textContent?.trim()).toBe('1 / 3')
})

test('locks body scroll on mount and prevents mobile touchmove default during swipe', () => {
  ;(globalThis as unknown as { Element: typeof Element }).Element = dom.Element as unknown as typeof Element
  dom.document.body.style.overflow = 'auto'

  act(() => render(h(MediaLightbox, {
    items: [
      { name: 'one.png', path: 'one.png', src: '/api/asset/one.png', kind: 'image' },
      { name: 'two.png', path: 'two.png', src: '/api/asset/two.png', kind: 'image' },
    ],
    startIndex: 0,
    onClose: () => {},
  }), container))

  expect(dom.document.body.style.overflow).toBe('hidden')

  const overlay = container.querySelector('[data-testid="media-lightbox"]') as HTMLElement
  const touchStart = new dom.TouchEvent('touchstart', {
    bubbles: true,
    cancelable: true,
    touches: [{ clientX: 250, clientY: 200 }] as unknown as Touch[],
    changedTouches: [{ clientX: 250, clientY: 200 }] as unknown as Touch[],
  })
  const touchMove = new dom.TouchEvent('touchmove', {
    bubbles: true,
    cancelable: true,
    touches: [{ clientX: 150, clientY: 205 }] as unknown as Touch[],
    changedTouches: [{ clientX: 150, clientY: 205 }] as unknown as Touch[],
  })
  const touchEnd = new dom.TouchEvent('touchend', {
    bubbles: true,
    cancelable: true,
    touches: [] as unknown as Touch[],
    changedTouches: [{ clientX: 150, clientY: 205 }] as unknown as Touch[],
  })

  act(() => {
    overlay.dispatchEvent(touchStart)
    overlay.dispatchEvent(touchMove)
    overlay.dispatchEvent(touchEnd)
  })

  expect(touchMove.defaultPrevented).toBe(true)
  expect(container.querySelector('[data-testid="media-lightbox-count"]')?.textContent?.trim()).toBe('2 / 2')

  act(() => render(null, container))
  expect(dom.document.body.style.overflow).toBe('auto')
})
