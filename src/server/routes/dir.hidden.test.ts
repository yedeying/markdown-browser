import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter, hasHiddenSegment, wantsHidden } from './dir.ts'
import type { FileNode } from '../../types.ts'

// 点文件默认必须对所有客户端不可见（既不列出、也不可读），
// 只有显式 ?showHidden=1 时才返回 —— 这个开关由客户端 vmd_show_hidden 偏好驱动。

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

test('GET /api/files hides dotfiles and dot-directories by default', async () => {
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

test('GET /api/files refuses to list a dot-directory directly when showHidden is off', async () => {
  const res = await app.request('/api/files?path=.docker&depth=1')
  expect(res.status).toBe(404)

  const allowed = await app.request('/api/files?path=.docker&depth=1&showHidden=1')
  expect(allowed.status).toBe(200)
  expect(names(await allowed.json() as FileNode[])).toContain('config.json')
})

test('showHidden=1 listing does not poison the default listing cache', async () => {
  await app.request('/api/files?path=&depth=1&showHidden=1')
  const res = await app.request('/api/files?path=&depth=1')
  const listed = names(await res.json() as FileNode[])
  expect(listed).not.toContain('.hidden-note.md')
  expect(listed).not.toContain('.docker')
})

test('GET /api/file/* refuses hidden paths unless showHidden=1', async () => {
  expect((await app.request('/api/file/.hidden-note.md')).status).toBe(404)
  expect((await app.request('/api/file/.docker/config.json')).status).toBe(404)
  // 父目录是点目录也算隐藏
  expect((await app.request('/api/file/.private/plain-name.md')).status).toBe(404)

  const ok = await app.request('/api/file/.hidden-note.md?showHidden=1')
  expect(ok.status).toBe(200)
  expect(await ok.text()).toContain('secret note')

  // 普通文件不受影响
  expect((await app.request('/api/file/README.md')).status).toBe(200)
})

test('GET /api/asset/* refuses hidden paths unless showHidden=1', async () => {
  expect((await app.request('/api/asset/.docker/config.json')).status).toBe(404)
  expect((await app.request('/api/asset/.docker/config.json?showHidden=1')).status).toBe(200)
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
