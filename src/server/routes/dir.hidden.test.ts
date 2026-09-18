import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter, hasHiddenSegment, wantsHidden } from './dir.ts'
import type { FileNode } from '../../types.ts'

// showHidden 只决定「列举时列什么」：列表/搜索默认不含点路径，?showHidden=1 才含。
// 读取单个路径（file / asset / download / stat）不看这个标记，也不因隐藏而 404。

let base: string
let app: ReturnType<typeof createDirRouter>['app']
let watcher: ReturnType<typeof createDirRouter>['watcher']

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'vmd-hidden-'))
  writeFileSync(join(base, 'README.md'), '# public\n')
  writeFileSync(join(base, '.hidden-note.md'), '# secret note\n')
  mkdirSync(join(base, '.docker'))
  writeFileSync(join(base, '.docker', 'config.json'), '{"auths":{"registry":"token"}}')
  mkdirSync(join(base, 'notes'))
  writeFileSync(join(base, 'notes', 'daily.md'), 'plain-name marker\n')
  // 名字本身不是点文件，但父目录是点目录
  mkdirSync(join(base, '.private'))
  writeFileSync(join(base, '.private', 'plain-name.md'), 'plain-name marker\n')
  // 硬性排除项不受 showHidden 影响
  mkdirSync(join(base, '.git'))
  writeFileSync(join(base, '.git', 'HEAD.md'), 'ref: refs/heads/main\n')

  const router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
  watcher = router.watcher
})

afterAll(() => {
  watcher.close()
  rmSync(base, { recursive: true, force: true })
})

function names(nodes: FileNode[]): string[] {
  return nodes.flatMap(n => [n.name, ...(n.children ? names(n.children) : [])])
}

test('wantsHidden only accepts an explicit "1"', () => {
  expect(wantsHidden('1')).toBe(true)
  expect(wantsHidden('0')).toBe(false)
  expect(wantsHidden('true')).toBe(false)
  expect(wantsHidden('')).toBe(false)
  expect(wantsHidden(undefined)).toBe(false)
})

test('hasHiddenSegment flags any dot segment, not just the file name', () => {
  expect(hasHiddenSegment('.private/plain-name.md')).toBe(true)
  expect(hasHiddenSegment('notes/.secret/a.md')).toBe(true)
  expect(hasHiddenSegment('.hidden-note.md')).toBe(true)
  expect(hasHiddenSegment('notes/daily.md')).toBe(false)
  expect(hasHiddenSegment('')).toBe(false)
})

// ── 列举：showHidden 决定列什么 ─────────────────────────────

test('GET /api/files omits dotfiles and dot-directories by default', async () => {
  const res = await app.request('/api/files?path=&depth=3')
  expect(res.status).toBe(200)
  const listed = names(await res.json() as FileNode[])
  expect(listed).toContain('README.md')
  expect(listed).toContain('daily.md')
  expect(listed).not.toContain('.hidden-note.md')
  expect(listed).not.toContain('.docker')
  expect(listed).not.toContain('config.json')
  expect(listed).not.toContain('.private')
  expect(listed).not.toContain('plain-name.md')
})

test('GET /api/files?showHidden=1 lists dotfiles but still honors IGNORE_DIRS', async () => {
  const res = await app.request('/api/files?path=&depth=3&showHidden=1')
  const listed = names(await res.json() as FileNode[])
  expect(listed).toContain('.hidden-note.md')
  expect(listed).toContain('.docker')
  expect(listed).toContain('config.json')
  expect(listed).not.toContain('.git')
  expect(listed).not.toContain('HEAD.md')
})

test('showHidden=1 listing does not poison the default listing cache', async () => {
  await app.request('/api/files?path=&depth=1&showHidden=1')
  const res = await app.request('/api/files?path=&depth=1')
  const listed = names(await res.json() as FileNode[])
  expect(listed).not.toContain('.hidden-note.md')
  expect(listed).not.toContain('.docker')
})

test('explicitly listing a dot-directory works without the flag', async () => {
  // 已经点名要这个目录了，不该因为「默认隐藏」而 404
  const res = await app.request('/api/files?path=.docker&depth=1')
  expect(res.status).toBe(200)
  expect(names(await res.json() as FileNode[])).toContain('config.json')
})

test('name search omits hidden paths by default and includes them with showHidden=1', async () => {
  const hidden = await app.request('/api/search?q=plain-name&type=name')
  expect(await hidden.json()).toEqual([])

  const shown = await app.request('/api/search?q=plain-name&type=name&showHidden=1')
  const results = await shown.json() as Array<{ filePath: string }>
  expect(results.map(r => r.filePath)).toContain('.private/plain-name.md')
})

test('content search omits hidden paths by default and includes them with showHidden=1', async () => {
  const hidden = await app.request('/api/search?q=plain-name%20marker&type=content')
  const hiddenPaths = (await hidden.json() as Array<{ filePath: string }>).map(r => r.filePath)
  expect(hiddenPaths).toContain('notes/daily.md')
  expect(hiddenPaths).not.toContain('.private/plain-name.md')

  const shown = await app.request('/api/search?q=plain-name%20marker&type=content&showHidden=1')
  const shownPaths = (await shown.json() as Array<{ filePath: string }>).map(r => r.filePath)
  expect(shownPaths).toContain('.private/plain-name.md')
})

// ── 读取单个路径：不看 showHidden，也不因隐藏而 404 ──────────

test('GET /api/file/* serves hidden paths without the flag', async () => {
  const note = await app.request('/api/file/.hidden-note.md')
  expect(note.status).toBe(200)
  expect(await note.text()).toContain('secret note')
  expect((await app.request('/api/file/.docker/config.json')).status).toBe(200)
  // 父目录是点目录也照样能读
  expect((await app.request('/api/file/.private/plain-name.md')).status).toBe(200)
  expect((await app.request('/api/file/README.md')).status).toBe(200)
})

test('GET /api/asset/* serves hidden paths without the flag', async () => {
  expect((await app.request('/api/asset/.docker/config.json')).status).toBe(200)
})

test('GET /api/download/* serves hidden paths without the flag', async () => {
  expect((await app.request('/api/download/.hidden-note.md')).status).toBe(200)
})

test('GET /api/stat resolves hidden paths without the flag', async () => {
  const res = await app.request('/api/stat?path=.private/plain-name.md')
  expect(res.status).toBe(200)
  expect(await res.json()).toMatchObject({ type: 'file', path: '.private/plain-name.md' })
})
