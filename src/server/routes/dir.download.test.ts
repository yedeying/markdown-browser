import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { unzipSync } from 'fflate'
import { createDirRouter } from './dir.ts'
import { treeCache } from '../tree-cache.ts'
import { contentDispositionAttachment, commonParentDir, zipEntryName } from '../download-zip.ts'

let base: string
let app: ReturnType<typeof createDirRouter>['app']
let watcher: ReturnType<typeof createDirRouter>['watcher']

beforeEach(() => {
  treeCache.clear()
  base = mkdtempSync(join(tmpdir(), 'vmd-dl-'))
  mkdirSync(join(base, 'docs', 'sub'), { recursive: true })
  writeFileSync(join(base, 'docs', 'a.txt'), 'hello-a')
  writeFileSync(join(base, 'docs', 'sub', 'b.txt'), 'hello-b')
  writeFileSync(join(base, 'root.bin'), Uint8Array.from([1, 2, 3]))
  const router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
  watcher = router.watcher
})

afterEach(() => {
  watcher.close()
  treeCache.clear()
  rmSync(base, { recursive: true, force: true })
})

test('contentDispositionAttachment includes filename*', () => {
  const h = contentDispositionAttachment('测 试.txt')
  expect(h).toContain('attachment;')
  expect(h).toContain("filename*=UTF-8''")
})

test('commonParentDir / zipEntryName', () => {
  expect(commonParentDir(['docs/a.txt', 'docs/sub/b.txt'])).toBe('docs')
  expect(zipEntryName('docs/a.txt', 'docs')).toBe('a.txt')
  expect(zipEntryName('docs/sub/b.txt', 'docs')).toBe('sub/b.txt')
})

test('GET /api/download returns attachment for a file', async () => {
  const res = await app.request('/api/download/docs/a.txt')
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Disposition') || '').toContain('attachment')
  expect(res.headers.get('Content-Disposition') || '').toContain('a.txt')
  expect(await res.text()).toBe('hello-a')
})

test('GET /api/download rejects directory and reserved', async () => {
  expect((await app.request('/api/download/docs')).status).toBe(404)
  writeFileSync(join(base, '.vmd-config.json'), '{}')
  expect((await app.request('/api/download/.vmd-config.json')).status).toBe(404)
})

test('POST /api/download/zip packs file + folder recursively', async () => {
  const res = await app.request('/api/download/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['docs/a.txt', 'docs/sub'] }),
  })
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('application/zip')
  expect(res.headers.get('Content-Disposition') || '').toContain('download.zip')
  const buf = new Uint8Array(await res.arrayBuffer())
  const files = unzipSync(buf)
  const names = Object.keys(files).sort()
  expect(names).toContain('a.txt')
  expect(names).toContain('sub/b.txt')
  expect(new TextDecoder().decode(files['a.txt'])).toBe('hello-a')
  expect(new TextDecoder().decode(files['sub/b.txt'])).toBe('hello-b')
})

test('POST /api/download/zip empty paths → 400', async () => {
  const res = await app.request('/api/download/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [] }),
  })
  expect(res.status).toBe(400)
})

test('POST /api/download/zip single folder names archive after folder', async () => {
  const res = await app.request('/api/download/zip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['docs'] }),
  })
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Disposition') || '').toContain('docs.zip')
})
