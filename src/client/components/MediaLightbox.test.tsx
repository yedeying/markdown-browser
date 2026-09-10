import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import type { FileNode } from '../../types.js'
import MediaLightbox from './MediaLightbox.js'

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
