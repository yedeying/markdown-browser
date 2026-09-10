import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import MediaToolbar from './MediaToolbar.js'
import type { MediaToolbarProps } from './MediaToolbar.js'

let dom: Window
let container: HTMLElement

beforeEach(() => {
  dom = new Window()
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
})

function baseProps(overrides: Partial<MediaToolbarProps> = {}): MediaToolbarProps {
  return {
    name: 'photo.jpg',
    path: 'pics/photo.jpg',
    kind: 'image',
    onDownload() {},
    onCopyPath() {},
    ...overrides,
  }
}

function mount(overrides: Partial<MediaToolbarProps> = {}) {
  act(() => {
    render(h(MediaToolbar, baseProps(overrides)), container)
  })
}

test('renders download and copy path buttons', () => {
  mount()
  expect(container.querySelector('[data-testid="media-toolbar-download"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-copy-path"]')).not.toBeNull()
})

test('image with zoom callbacks shows zoom buttons', () => {
  mount({
    kind: 'image',
    onZoomIn() {},
    onZoomOut() {},
    onZoomFit() {},
  })
  expect(container.querySelector('[data-testid="media-toolbar-zoom-in"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-zoom-out"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-zoom-fit"]')).not.toBeNull()
})

test('video hides zoom buttons even when zoom callbacks are provided', () => {
  mount({
    kind: 'video',
    name: 'clip.mp4',
    path: 'videos/clip.mp4',
    onZoomIn() {},
    onZoomOut() {},
    onZoomFit() {},
  })
  expect(container.querySelector('[data-testid="media-toolbar-zoom-in"]')).toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-zoom-out"]')).toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-zoom-fit"]')).toBeNull()
})

test('prev/next appear when count is greater than 1 and callbacks are provided', () => {
  mount({
    index: 0,
    count: 3,
    onPrev() {},
    onNext() {},
  })
  expect(container.querySelector('[data-testid="media-toolbar-prev"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-next"]')).not.toBeNull()
})

test('image with rotate callbacks shows rotate buttons; video hides them', () => {
  mount({
    kind: 'image',
    onRotateLeft() {},
    onRotateRight() {},
  })
  expect(container.querySelector('[data-testid="media-toolbar-rotate-left"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-rotate-right"]')).not.toBeNull()

  mount({
    kind: 'video',
    name: 'clip.mp4',
    path: 'videos/clip.mp4',
    onRotateLeft() {},
    onRotateRight() {},
  })
  expect(container.querySelector('[data-testid="media-toolbar-rotate-left"]')).toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-rotate-right"]')).toBeNull()
})

test('close appears only when onClose is provided', () => {
  mount()
  expect(container.querySelector('[data-testid="media-toolbar-close"]')).toBeNull()
  mount({ onClose() {} })
  expect(container.querySelector('[data-testid="media-toolbar-close"]')).not.toBeNull()
})

test('prev/next stay hidden when count is 1 or callbacks are missing', () => {
  mount({ count: 1, onPrev() {}, onNext() {} })
  expect(container.querySelector('[data-testid="media-toolbar-prev"]')).toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-next"]')).toBeNull()

  mount({ count: 3 })
  expect(container.querySelector('[data-testid="media-toolbar-prev"]')).toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-next"]')).toBeNull()
})

test('testIdPrefix prefixes button test ids', () => {
  mount({
    testIdPrefix: 'media-lightbox',
    onClose() {},
    count: 3,
    onPrev() {},
    onNext() {},
  })
  expect(container.querySelector('[data-testid="media-lightbox-download"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-copy-path"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-close"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-lightbox-prev"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="media-toolbar-download"]')).toBeNull()
})

test('action buttons invoke their callbacks', () => {
  const calls: string[] = []
  mount({
    kind: 'image',
    count: 3,
    index: 1,
    onDownload() { calls.push('download') },
    onCopyPath() { calls.push('copy') },
    onZoomIn() { calls.push('zoom-in') },
    onZoomOut() { calls.push('zoom-out') },
    onZoomFit() { calls.push('zoom-fit') },
    onRotateLeft() { calls.push('rotate-left') },
    onRotateRight() { calls.push('rotate-right') },
    onPrev() { calls.push('prev') },
    onNext() { calls.push('next') },
    onClose() { calls.push('close') },
  })

  const click = (id: string) => {
    const el = container.querySelector(`[data-testid="${id}"]`) as HTMLElement
    el.dispatchEvent(new dom.MouseEvent('click', { bubbles: true }))
  }

  act(() => {
    click('media-toolbar-download')
    click('media-toolbar-copy-path')
    click('media-toolbar-zoom-in')
    click('media-toolbar-zoom-out')
    click('media-toolbar-zoom-fit')
    click('media-toolbar-rotate-left')
    click('media-toolbar-rotate-right')
    click('media-toolbar-prev')
    click('media-toolbar-next')
    click('media-toolbar-close')
  })

  expect(calls).toEqual([
    'download',
    'copy',
    'zoom-in',
    'zoom-out',
    'zoom-fit',
    'rotate-left',
    'rotate-right',
    'prev',
    'next',
    'close',
  ])
})
