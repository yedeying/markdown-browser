import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { createDirRouter } from './dir.ts'

let base: string
let app: ReturnType<typeof createDirRouter>['app']
let watcher: ReturnType<typeof createDirRouter>['watcher']
let pngBuf: Buffer

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'vmd-heic-'))
  pngBuf = await sharp({
    create: { width: 32, height: 24, channels: 3, background: '#336699' },
  }).png().toBuffer()
  writeFileSync(join(base, 'photo.heic'), pngBuf)
  writeFileSync(join(base, 'plain.png'), pngBuf)
  const router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
  watcher = router.watcher
})

afterAll(() => {
  watcher.close()
  rmSync(base, { recursive: true, force: true })
})

test('GET /api/asset HEIC without w/fmt still transcodes (not image/heic)', async () => {
  const res = await app.request('/api/asset/photo.heic', {
    headers: { Accept: 'image/webp,image/*' },
  })
  expect(res.status).toBe(200)
  const ct = res.headers.get('Content-Type') || ''
  expect(ct).not.toBe('image/heic')
  expect(['image/webp', 'image/jpeg', 'image/avif']).toContain(ct)
  expect(res.headers.get('X-Vmd-Image-Transform')).toBeTruthy()
})

test('GET /api/asset PNG without w/fmt still passthroughs', async () => {
  const res = await app.request('/api/asset/plain.png')
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Type')).toBe('image/png')
  expect(res.headers.get('X-Vmd-Image-Transform')).toBeNull()
  expect(Buffer.from(await res.arrayBuffer()).equals(pngBuf)).toBe(true)
})

test('GET /api/download HEIC returns original bytes', async () => {
  const res = await app.request('/api/download/photo.heic')
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Disposition') || '').toContain('attachment')
  expect(Buffer.from(await res.arrayBuffer()).equals(pngBuf)).toBe(true)
})
