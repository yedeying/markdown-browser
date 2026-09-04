import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter } from './dir.ts'
import { treeCache } from '../tree-cache.ts'
import { CHUNK_SIZE } from '../upload-sessions.ts'

let base: string
let app: ReturnType<typeof createDirRouter>['app']
let watcher: ReturnType<typeof createDirRouter>['watcher']

beforeEach(() => {
  treeCache.clear()
  base = mkdtempSync(join(tmpdir(), 'vmd-upload-'))
  mkdirSync(join(base, 'docs'))
  const router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
  watcher = router.watcher
})

afterEach(() => {
  watcher.close()
  treeCache.clear()
  rmSync(base, { recursive: true, force: true })
})

test('small upload writes binary bytes and rejects reserved paths', async () => {
  const payload = new Uint8Array([0, 1, 2, 255, 10])
  const res = await app.request('/api/fs/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Vmd-Upload-Path': encodeURIComponent('docs/photo.bin'),
    },
    body: payload,
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, path: 'docs/photo.bin' })
  expect(Buffer.from(readFileSync(join(base, 'docs/photo.bin')))).toEqual(Buffer.from(payload))

  const reserved = await app.request('/api/fs/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Vmd-Upload-Path': encodeURIComponent('.vmd-config.json'),
    },
    body: payload,
  })
  expect(reserved.status).toBe(403)
})

test('small upload returns EXISTS without overwrite', async () => {
  writeFileSync(join(base, 'docs', 'a.txt'), 'old')
  const res = await app.request('/api/fs/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Vmd-Upload-Path': encodeURIComponent('docs/a.txt'),
    },
    body: new TextEncoder().encode('new'),
  })
  expect(res.status).toBe(409)
  expect((await res.json() as { code: string }).code).toBe('EXISTS')
  expect(readFileSync(join(base, 'docs', 'a.txt'), 'utf8')).toBe('old')

  const over = await app.request('/api/fs/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Vmd-Upload-Path': encodeURIComponent('docs/a.txt'),
      'X-Vmd-Upload-Overwrite': '1',
    },
    body: new TextEncoder().encode('new'),
  })
  expect(over.status).toBe(200)
  expect(readFileSync(join(base, 'docs', 'a.txt'), 'utf8')).toBe('new')
})

test('chunked upload init → chunks → complete; resume reports received', async () => {
  const size = CHUNK_SIZE + 100
  const bytes = new Uint8Array(size)
  bytes.fill(7)
  bytes[0] = 1
  bytes[size - 1] = 9

  const init = await app.request('/api/fs/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'docs/big.bin', size }),
  })
  expect(init.status).toBe(200)
  const initBody = await init.json() as { ok: boolean; uploadId: string; chunkSize: number; received: number[] }
  expect(initBody.ok).toBe(true)
  expect(initBody.received).toEqual([])

  const chunk0 = bytes.slice(0, CHUNK_SIZE)
  const put0 = await app.request(`/api/fs/upload/chunk?uploadId=${initBody.uploadId}&index=0`, {
    method: 'PUT',
    body: chunk0,
  })
  expect(put0.status).toBe(200)

  // resume
  const init2 = await app.request('/api/fs/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'docs/big.bin', size }),
  })
  const init2Body = await init2.json() as { uploadId: string; received: number[] }
  expect(init2Body.uploadId).toBe(initBody.uploadId)
  expect(init2Body.received).toEqual([0])

  const chunk1 = bytes.slice(CHUNK_SIZE)
  const put1 = await app.request(`/api/fs/upload/chunk?uploadId=${initBody.uploadId}&index=1`, {
    method: 'PUT',
    body: chunk1,
  })
  expect(put1.status).toBe(200)

  const done = await app.request('/api/fs/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId: initBody.uploadId }),
  })
  expect(done.status).toBe(200)
  expect(Buffer.from(readFileSync(join(base, 'docs/big.bin')))).toEqual(Buffer.from(bytes))
  expect(existsSync(join(base, '.vmd-upload', initBody.uploadId))).toBe(false)
})

test('staging dir is not listed in /api/files', async () => {
  mkdirSync(join(base, '.vmd-upload', 'x'), { recursive: true })
  writeFileSync(join(base, '.vmd-upload', 'x', 'meta.json'), '{}')
  const res = await app.request('/api/files?path=&depth=1&showHidden=1')
  const names = ((await res.json()) as { name: string }[]).map(n => n.name)
  expect(names).not.toContain('.vmd-upload')
})

test('nested upload then list parent shows new folder immediately', async () => {
  await app.request('/api/files?path=&depth=1')
  const payload = new TextEncoder().encode('nested')
  const res = await app.request('/api/fs/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Vmd-Upload-Path': encodeURIComponent('album/shot.jpg'),
    },
    body: payload,
  })
  expect(res.status).toBe(200)

  const root = await app.request('/api/files?path=&depth=1')
  const rootNames = ((await root.json()) as { name: string }[]).map(n => n.name)
  expect(rootNames).toContain('album')

  const album = await app.request('/api/files?path=album&depth=1')
  const albumNames = ((await album.json()) as { name: string }[]).map(n => n.name)
  expect(albumNames).toContain('shot.jpg')
})
