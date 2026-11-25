import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'

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

const { default: MarkdownPreview } = await import('./MarkdownPreview.js')

let dom: Window
let container: HTMLElement

beforeEach(() => {
  dom = new Window({ url: 'http://localhost:8888/' })
  ;(globalThis as unknown as { window: Window }).window = dom
  ;(globalThis as unknown as { document: Document }).document = dom.document as unknown as Document
  ;(globalThis as unknown as { navigator: Navigator }).navigator = dom.navigator as unknown as Navigator
  ;(globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement = dom.HTMLElement as unknown as typeof HTMLElement
  container = dom.document.createElement('div') as unknown as HTMLElement
  dom.document.body.appendChild(container)
})

afterEach(() => {
  act(() => render(null, container))
  dom.close()
  delete (globalThis as Partial<typeof globalThis>).document
  delete (globalThis as Partial<typeof globalThis>).window
  delete (globalThis as Partial<typeof globalThis>).navigator
  delete (globalThis as Partial<typeof globalThis>).HTMLElement
})

test('clicking a markdown image opens full-screen MediaLightbox with ImageViewer toolbar', () => {
  const md = [
    '# Gallery',
    '',
    '![Local Diagram](./images/arch.png)',
    '',
    '[![Badge](https://example.com/badge.svg)](https://example.com)',
    '',
    '![Remote Photo](https://example.com/photo.jpg)',
  ].join('\n')

  act(() => render(h(MarkdownPreview, { markdown: md, filePath: 'docs/guide.md' }), container))

  const preview = container.querySelector('[data-testid="markdown-preview"]') as HTMLElement
  const imgs = Array.from(preview.querySelectorAll('img'))
  expect(imgs.length).toBe(3)

  // Clicking linked badge image should NOT open lightbox
  act(() => imgs[1].dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
  expect(container.querySelector('[data-testid="media-lightbox"]')).toBeNull()

  // Clicking local image opens lightbox with all ImageViewer toolbar buttons
  act(() => imgs[0].dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
  const lightbox = container.querySelector('[data-testid="media-lightbox"]')
  expect(lightbox).not.toBeNull()

  for (const suffix of [
    'zoom-out',
    'zoom-fit',
    'zoom-in',
    'rotate-left',
    'rotate-right',
    'download',
    'copy-path',
    'prev',
    'next',
    'close',
  ]) {
    expect(container.querySelector(`[data-testid="media-lightbox-${suffix}"]`)).not.toBeNull()
  }

  // Count skips linked badge image (2 previewable images total)
  expect(container.querySelector('[data-testid="media-lightbox-count"]')?.textContent?.trim()).toBe('1 / 2')
  const lightboxImg = lightbox!.querySelector('img') as HTMLImageElement
  expect(lightboxImg.getAttribute('src')).toBe('/api/asset/docs/images/arch.png')

  // Next switches to remote image
  const nextBtn = container.querySelector('[data-testid="media-lightbox-next"]') as HTMLElement
  act(() => nextBtn.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
  expect(container.querySelector('[data-testid="media-lightbox-count"]')?.textContent?.trim()).toBe('2 / 2')
  expect((lightbox!.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('https://example.com/photo.jpg')

  // Close dismisses lightbox
  const closeBtn = container.querySelector('[data-testid="media-lightbox-close"]') as HTMLElement
  act(() => closeBtn.dispatchEvent(new dom.MouseEvent('click', { bubbles: true })))
  expect(container.querySelector('[data-testid="media-lightbox"]')).toBeNull()
})
