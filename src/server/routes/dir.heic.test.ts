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
  writeFileSync(join(base, 'broken.heic'), Buffer.from('not-a-real-heic-file'))
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

test('GET /api/asset PNG with w/fmt transcodes locally but passthroughs in Docker', async () => {
  const local = await app.request('/api/asset/plain.png?w=1200&fmt=webp')
  expect(local.status).toBe(200)
  expect(local.headers.get('Content-Type')).toBe('image/webp')
  expect(local.headers.get('X-Vmd-Image-Transform')).toBeTruthy()

  const prev = process.env.DOCKER_CONTAINER
  process.env.DOCKER_CONTAINER = 'true'
  try {
    const docker = await app.request('/api/asset/plain.png?w=1200&fmt=webp')
    expect(docker.status).toBe(200)
    expect(docker.headers.get('Content-Type')).toBe('image/png')
    expect(docker.headers.get('X-Vmd-Image-Transform')).toBeNull()
    expect(Buffer.from(await docker.arrayBuffer()).equals(pngBuf)).toBe(true)
  } finally {
    if (prev === undefined) delete process.env.DOCKER_CONTAINER
    else process.env.DOCKER_CONTAINER = prev
  }
})

test('GET /api/asset undecodable HEIC is not 200 image/heic', async () => {
  const res = await app.request('/api/asset/broken.heic', {
    headers: { Accept: 'image/webp,image/*' },
  })
  expect(res.status).toBe(415)
  expect(res.headers.get('Content-Type') || '').not.toBe('image/heic')
  const body = Buffer.from(await res.arrayBuffer())
  expect(body.equals(Buffer.from('not-a-real-heic-file'))).toBe(false)
})

test('GET /api/download HEIC returns original bytes', async () => {
  const res = await app.request('/api/download/photo.heic')
  expect(res.status).toBe(200)
  expect(res.headers.get('Content-Disposition') || '').toContain('attachment')
  expect(Buffer.from(await res.arrayBuffer()).equals(pngBuf)).toBe(true)
})
