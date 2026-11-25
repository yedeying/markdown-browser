import { test, expect } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, appendFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirWatcher, shouldIgnoreWatchPath } from './watcher.ts'
import type { WatchEvent } from '../types.js'

test('shouldIgnoreWatchPath drops macOS Library / Chrome cache noise', () => {
  expect(shouldIgnoreWatchPath('Library/Caches/Google/Chrome/Default/Cache/Cache_Data/foo')).toBe(true)
  expect(shouldIgnoreWatchPath('Library/Caches/foo')).toBe(true)
  expect(shouldIgnoreWatchPath('Library')).toBe(true)
  expect(shouldIgnoreWatchPath('Files/document/life/japan/note.md')).toBe(false)
  expect(shouldIgnoreWatchPath('Documents/work/readme.md')).toBe(false)
})

test('shouldIgnoreWatchPath drops node_modules and git', () => {
  expect(shouldIgnoreWatchPath('proj/node_modules/lodash/index.js')).toBe(true)
  expect(shouldIgnoreWatchPath('proj/.git/objects/xx')).toBe(true)
})

function makeTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'vmd-watch-'))
  mkdirSync(join(root, 'a', 'b'), { recursive: true })
  mkdirSync(join(root, 'a', 'c'), { recursive: true })
  return root
}

test('ensureWatched registers path + ancestor chain (on-demand, not recursive)', () => {
  const root = makeTree()
  const w = createDirWatcher(root)
  try {
    // 未请求任何路径 → 无 watch
    expect(w.activeCount()).toBe(0)

    // 根
    w.ensureWatched('')
    expect(w.activeCount()).toBe(1)

    // a/b → 祖先链 '', a, a/b
    w.ensureWatched('a/b')
    expect(w.activeCount()).toBe(3)

    // a/c → 只新增 a/c（'' 和 a 已覆盖）
    w.ensureWatched('a/c')
    expect(w.activeCount()).toBe(4)
  } finally {
    w.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('releasePath drops dirs no longer covered by active paths', () => {
  const root = makeTree()
  const w = createDirWatcher(root)
  try {
    w.ensureWatched('')
    w.ensureWatched('a/b')
    w.ensureWatched('a/c')
    expect(w.activeCount()).toBe(4)

    // 释放 a/b → a 仍被 a/c 覆盖，保留
    w.releasePath('a/b')
    expect(w.activeCount()).toBe(3)

    // 释放 a/c → a 不再被任何活跃路径覆盖，只剩根
    w.releasePath('a/c')
    expect(w.activeCount()).toBe(1)

    // 释放根 → 全部清空
    w.releasePath('')
    expect(w.activeCount()).toBe(0)
  } finally {
    w.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('watch fires tree-change / reload for md files in watched dirs', async () => {
  const root = makeTree()
  const w = createDirWatcher(root)
  const events: WatchEvent[] = []
  w.onEvent((e) => events.push(e))
  try {
    w.ensureWatched('a/b')
    writeFileSync(join(root, 'a', 'b', 'note.md'), 'hello')
    // 等待防抖（DEBOUNCE_MS=200）与事件派发
    await new Promise((r) => setTimeout(r, 500))
    const treeChanges = events.filter((e) => e.type === 'tree-change')
    const reloads = events.filter((e) => e.type === 'reload')
    expect(treeChanges.length).toBeGreaterThan(0)
    expect(treeChanges[0].affectedPath).toBe('a/b')
    expect(reloads.length).toBeGreaterThan(0)

    // 未 watch 的目录不产生事件
    const before = events.length
    appendFileSync(join(root, 'a', 'c', 'x.txt'), 'x')
    await new Promise((r) => setTimeout(r, 400))
    expect(events.length).toBe(before)
  } finally {
    w.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('out-of-bounds paths are ignored', () => {
  const root = makeTree()
  const w = createDirWatcher(root)
  try {
    w.ensureWatched('../../etc')
    w.ensureWatched('/etc')
    w.ensureWatched('a/b/../../../../x')
    expect(w.activeCount()).toBe(0)
  } finally {
    w.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('syncWatched maintains multi-client union and survives disconnect within grace period', async () => {
  const root = makeTree()
  const w = createDirWatcher(root, { graceMs: 80 })
  const writer1 = () => {}
  const writer2 = () => {}
  try {
    w.addClient(writer1, 'c1')
    w.syncWatched('c1', ['a/b'])
    expect(w.activeCount()).toBe(3) // '', 'a', 'a/b'

    w.addClient(writer2, 'c2')
    w.syncWatched('c2', ['a/c'])
    expect(w.activeCount()).toBe(4) // '', 'a', 'a/b', 'a/c'

    // c1 断开后在宽限期内重连：监听不丢失
    w.removeClient(writer1, 'c1')
    await new Promise((r) => setTimeout(r, 25))
    expect(w.activeCount()).toBe(4)
    w.addClient(writer1, 'c1')
    await new Promise((r) => setTimeout(r, 90))
    expect(w.activeCount()).toBe(4)

    // c1 真正离开超过宽限期：只释放 a/b，保留 c2 的 '', 'a', 'a/c'
    w.removeClient(writer1, 'c1')
    await new Promise((r) => setTimeout(r, 120))
    expect(w.activeCount()).toBe(3)

    // c2 也离开超过宽限期：全部释放
    w.removeClient(writer2, 'c2')
    await new Promise((r) => setTimeout(r, 120))
    expect(w.activeCount()).toBe(0)
  } finally {
    w.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('non-markdown files in watched dir fire reload with exact path', async () => {
  const root = makeTree()
  const w = createDirWatcher(root)
  const events: WatchEvent[] = []
  w.onEvent((e) => events.push(e))
  try {
    w.syncWatched('c1', ['a/b'])
    writeFileSync(join(root, 'a', 'b', 'chat.txt'), 'hello')
    await new Promise((r) => setTimeout(r, 450))
    const reload = events.find((e) => e.type === 'reload' && e.path === 'a/b/chat.txt')
    expect(reload).toBeDefined()
  } finally {
    w.close()
    rmSync(root, { recursive: true, force: true })
  }
})
