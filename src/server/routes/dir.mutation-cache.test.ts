import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter } from './dir.ts'
import { treeCache } from '../tree-cache.ts'
import type { FileNode } from '../../types.ts'

/**
 * 回归：DELETE 成功后即使 OS watcher 尚未触发，
 * /api/files 也不得继续命中删除前的目录缓存（否则刷新仍看到已删项）。
 */

let base: string
let app: ReturnType<typeof createDirRouter>['app']
let watcher: ReturnType<typeof createDirRouter>['watcher']

beforeEach(() => {
  treeCache.clear()
  base = mkdtempSync(join(tmpdir(), 'vmd-mut-cache-'))
  mkdirSync(join(base, 'keep'))
  mkdirSync(join(base, 'gone'))
  writeFileSync(join(base, 'gone', 'a.md'), '# a\n')
  writeFileSync(join(base, 'keep', 'b.md'), '# b\n')
  const router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
  watcher = router.watcher
})

afterEach(() => {
  watcher.close()
  treeCache.clear()
  rmSync(base, { recursive: true, force: true })
})

test('DELETE folder then immediate list must not return stale cached children', async () => {
  // 先列表，填满 tree cache
  const before = await app.request('/api/files?path=&depth=1')
  expect(before.status).toBe(200)
  const beforeTree = await before.json() as FileNode[]
  expect(beforeTree.map(n => n.name).sort()).toEqual(['gone', 'keep'])

  const del = await app.request('/api/fs/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['gone'] }),
  })
  expect(del.status).toBe(200)
  expect(await del.json()).toEqual({ ok: true, deleted: 1 })
  expect(existsSync(join(base, 'gone'))).toBe(false)

  // 立刻再列表（不等 watcher debounce）：不得再出现 gone
  const after = await app.request('/api/files?path=&depth=1')
  expect(after.status).toBe(200)
  const afterTree = await after.json() as FileNode[]
  expect(afterTree.map(n => n.name)).toEqual(['keep'])
})

test('mkdir empty folder then immediate list shows it', async () => {
  await app.request('/api/files?path=&depth=1')
  const created = await app.request('/api/fs/mkdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'brand-new' }),
  })
  expect(created.status).toBe(200)
  expect(existsSync(join(base, 'brand-new'))).toBe(true)

  const after = await app.request('/api/files?path=&depth=1')
  const names = ((await after.json()) as FileNode[]).map(n => n.name)
  expect(names).toContain('brand-new')
})
