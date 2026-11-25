import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter } from './dir.ts'
import { treeCache } from '../tree-cache.ts'

let root: string
let dist: string
let router: ReturnType<typeof createDirRouter>

beforeEach(() => {
  treeCache.clear()
  root = mkdtempSync(join(tmpdir(), 'vmd-watch-route-'))
  dist = mkdtempSync(join(tmpdir(), 'vmd-watch-dist-'))
  writeFileSync(join(dist, 'index.html'), '<html></html>')
  mkdirSync(join(root, 'docs', 'sub'), { recursive: true })
  writeFileSync(join(root, 'docs', 'a.md'), '# A')
  router = createDirRouter(root, dist)
})

afterEach(() => {
  router.watcher.close()
  treeCache.clear()
  rmSync(root, { recursive: true, force: true })
  rmSync(dist, { recursive: true, force: true })
})

test('POST /api/watch/sync updates watched set and POST /api/files/check-mtime detects mtime changes', async () => {
  const syncRes = await router.app.request('/api/watch/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'tab1', paths: ['', 'docs/sub', '../../etc'] }),
  })
  expect(syncRes.status).toBe(200)
  const syncJson = await syncRes.json() as { ok: boolean; activeCount: number }
  expect(syncJson.ok).toBe(true)
  expect(syncJson.activeCount).toBe(3) // '', 'docs', 'docs/sub'

  // 首次校验（未传 mtimeMs）：返回基线 mtimes，不报 changed
  const check1 = await router.app.request('/api/files/check-mtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirs: [{ path: '' }, { path: 'docs' }] }),
  })
  expect(check1.status).toBe(200)
  const j1 = await check1.json() as { changed: string[]; mtimes: Record<string, number> }
  expect(j1.changed).toEqual([])
  expect(typeof j1.mtimes['docs']).toBe('number')

  // 无变更时再次校验：changed 为空
  const check2 = await router.app.request('/api/files/check-mtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirs: [{ path: 'docs', mtimeMs: j1.mtimes['docs'] }] }),
  })
  const j2 = await check2.json() as { changed: string[]; mtimes: Record<string, number> }
  expect(j2.changed).toEqual([])

  // 目录新增文件并推进 mtimeMs：check-mtime 立即检出 docs 变化
  writeFileSync(join(root, 'docs', 'b.md'), '# B')
  const bumped = new Date(j1.mtimes['docs'] + 5000)
  utimesSync(join(root, 'docs'), bumped, bumped)

  const check3 = await router.app.request('/api/files/check-mtime', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dirs: [{ path: 'docs', mtimeMs: j1.mtimes['docs'] }] }),
  })
  const j3 = await check3.json() as { changed: string[]; mtimes: Record<string, number> }
  expect(j3.changed).toEqual(['docs'])
})

test('treeCache invalidates automatically when directory mtimeMs changes on disk', async () => {
  // 首次拉取写入 treeCache
  const r1 = await router.app.request('/api/files?path=docs&depth=0')
  expect(r1.status).toBe(200)
  const list1 = await r1.json() as Array<{ name: string }>
  expect(list1.map((n) => n.name)).toContain('a.md')
  expect(list1.map((n) => n.name)).not.toContain('c.md')

  // 不经过 watcher，直接修改磁盘并推进目录 mtimeMs
  writeFileSync(join(root, 'docs', 'c.md'), '# C')
  const bumped = new Date(Date.now() + 10_000)
  utimesSync(join(root, 'docs'), bumped, bumped)

  // 立即再次请求 /api/files（仍在 60s TTL 内）：mtimeMs 校验使缓存自动失效并返回 c.md
  const r2 = await router.app.request('/api/files?path=docs&depth=0')
  expect(r2.status).toBe(200)
  const list2 = await r2.json() as Array<{ name: string }>
  expect(list2.map((n) => n.name)).toContain('c.md')
})
