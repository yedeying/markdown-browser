import { afterEach, beforeEach, expect, test } from 'bun:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Window } from 'happy-dom'
import {
  ALL_SUPPORTED_EXTS,
  BINARY_EXTS,
  getFileType,
  isEditable,
} from '../../utils/fileType.js'
import { PluginRegistry } from '../registry.js'
import { pdfPlugin } from './pdf.js'
import PdfViewer from '../../components/PdfViewer.js'

let dom: Window
let container: HTMLElement

beforeEach(() => {
  dom = new Window({ url: 'http://localhost:8888/' })
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

test('pdf extension classification and builtin.pdf plugin matching', () => {
  expect(getFileType('docs/spec.pdf')).toBe('pdf')
  expect(getFileType('DOCS/REPORT.PDF')).toBe('pdf')
  expect(isEditable('docs/spec.pdf')).toBe(false)
  expect(ALL_SUPPORTED_EXTS.has('.pdf')).toBe(true)
  expect(BINARY_EXTS.has('.pdf')).toBe(true)

  const reg = new PluginRegistry()
  reg.register(pdfPlugin)
  const hit = reg.resolveFile('docs/spec.pdf', null)
  expect(hit?.plugin.id).toBe('builtin.pdf')
  expect(hit?.plugin.requiresContent).toBe(false)
  expect(reg.resolveFile('docs/readme.md', '# hi')).toBeNull()
})

test('PdfViewer renders toolbar and iframe pointing to /api/asset', () => {
  act(() => render(h(PdfViewer, { filePath: 'docs/spec.pdf' }), container))

  const frame = container.querySelector('[data-testid="pdf-viewer-frame"]') as HTMLIFrameElement
  expect(frame).not.toBeNull()
  expect(frame.getAttribute('src')).toBe('/api/asset/docs/spec.pdf')

  const openExt = container.querySelector('[data-testid="pdf-viewer-open-external"]') as HTMLAnchorElement
  expect(openExt).not.toBeNull()
  expect(openExt.getAttribute('href')).toBe('/api/asset/docs/spec.pdf')
  expect(container.querySelector('[data-testid="pdf-viewer-download"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="pdf-viewer-copy-path"]')).not.toBeNull()
})

test('PdfViewer compact mode hides toolbar for column preview', () => {
  act(() => render(h(PdfViewer, { filePath: 'docs/spec.pdf', compact: true }), container))

  expect(container.querySelector('[data-testid="pdf-viewer"]')?.classList.contains('is-compact')).toBe(true)
  expect(container.querySelector('[data-testid="pdf-viewer-frame"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="pdf-viewer-download"]')).toBeNull()
})
