import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  injectRuntimeScript,
  renderDirIndexHtml,
  stripVmdRuntimeScripts,
} from './runtime-html.ts'
import { createDirRouter } from './routes/dir.ts'
import { treeCache } from './tree-cache.ts'

test('stripVmdRuntimeScripts removes prior injections', () => {
  const html = `<html><head><script>window.__VMD_MODE__="dir";window.__VMD_DIR_NAME__="old";</script>\n</head><body></body></html>`
  const stripped = stripVmdRuntimeScripts(html)
  expect(stripped).not.toContain('__VMD_MODE__')
  expect(stripped).toContain('</head>')
})

test('injectRuntimeScript replaces stale disk injection', () => {
  const html = `<html><head><script>window.__VMD_MODE__="dir";window.__VMD_DIR_NAME__="A";</script>\n</head><body>x</body></html>`
  const out = injectRuntimeScript(html, 'window.__VMD_MODE__="dir";window.__VMD_DIR_NAME__="B";')
  expect(out).toContain('__VMD_DIR_NAME__="B"')
  expect(out).not.toContain('__VMD_DIR_NAME__="A"')
  expect(out.match(/__VMD_MODE__/g)?.length).toBe(1)
})

test('two dir routers from shared dist inject their own dir names', async () => {
  treeCache.clear()
  const root = mkdtempSync(join(tmpdir(), 'vmd-title-'))
  const dist = join(root, 'dist')
  mkdirSync(dist)
  // Simulate polluted dist from an earlier process
  writeFileSync(
    join(dist, 'index.html'),
    `<!doctype html><html><head><script>window.__VMD_MODE__="dir";window.__VMD_DIR_NAME__="polluted";</script></head><body></body></html>`,
    'utf-8',
  )
  const a = join(root, 'alpha-docs')
  const b = join(root, 'beta-notes')
  mkdirSync(a)
  mkdirSync(b)

  const ra = createDirRouter(a, dist, null)
  const rb = createDirRouter(b, dist, null)
  try {
    const resA = await ra.app.request('/')
    const resB = await rb.app.request('/')
    const htmlA = await resA.text()
    const htmlB = await resB.text()
    expect(htmlA).toContain('__VMD_DIR_NAME__="alpha-docs"')
    expect(htmlB).toContain('__VMD_DIR_NAME__="beta-notes"')
    expect(htmlA).not.toContain('polluted')
    expect(htmlB).not.toContain('polluted')
    // disk template must stay unchanged (no cross-write)
    const disk = await Bun.file(join(dist, 'index.html')).text()
    expect(disk).toContain('polluted')
  } finally {
    ra.watcher.close()
    rb.watcher.close()
    treeCache.clear()
    rmSync(root, { recursive: true, force: true })
  }
})

test('renderDirIndexHtml helper', () => {
  const root = mkdtempSync(join(tmpdir(), 'vmd-ri-'))
  writeFileSync(join(root, 'index.html'), '<html><head></head><body></body></html>')
  try {
    const html = renderDirIndexHtml(root, { mode: 'dir', dirName: 'MyLib' })
    expect(html).toContain('__VMD_MODE__="dir"')
    expect(html).toContain('__VMD_DIR_NAME__="MyLib"')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
