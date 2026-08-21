import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter } from './dir.ts'
import type { FileNode } from '../../types.ts'

// 目录只要有内容（即使全是未知扩展名）就应出现在树中；
// 未知类型文件也应作为 type: 'file' 节点列出，供后续按纯文本回落打开。

let base: string
let app: ReturnType<typeof createDirRouter>['app']
let watcher: ReturnType<typeof createDirRouter>['watcher']

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'vmd-listing-'))
  // 目录仅含未登记扩展名（.jsonl 目前不在 SUPPORTED_EXTS 中）
  mkdirSync(join(base, 'only-jsonl'))
  writeFileSync(join(base, 'only-jsonl', 'chat.jsonl'), '{"a":1}\n')
  // 目录仅含完全未知扩展名
  mkdirSync(join(base, 'only-weird'))
  writeFileSync(join(base, 'only-weird', 'weird.xyz'), 'binary-ish content\n')
  // 磁盘上真正为空的目录：现有策略（隐藏）应保持不变
  mkdirSync(join(base, 'truly-empty'))
  // 父目录只有空子目录：父目录仍应出现（磁盘上有子项），空叶子可继续省略
  mkdirSync(join(base, 'outer'))
  mkdirSync(join(base, 'outer', 'inner'))
  // 正常白名单文件作为对照
  writeFileSync(join(base, 'README.md'), '# hello\n')

  const router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
  watcher = router.watcher
})

afterAll(() => {
  watcher.close()
  rmSync(base, { recursive: true, force: true })
})

function findFolder(nodes: FileNode[], name: string): FileNode | undefined {
  return nodes.find(n => n.type === 'folder' && n.name === name)
}

test('folder containing only an unknown-extension file (.jsonl) still appears in the tree', async () => {
  const res = await app.request('/api/files?path=&depth=2')
  expect(res.status).toBe(200)
  const tree = await res.json() as FileNode[]

  const folder = findFolder(tree, 'only-jsonl')
  expect(folder).toBeDefined()
  const childNames = (folder!.children ?? []).map(c => c.name)
  expect(childNames).toContain('chat.jsonl')
  const fileNode = folder!.children!.find(c => c.name === 'chat.jsonl')
  expect(fileNode?.type).toBe('file')
})

test('folder containing only a fully unknown extension (.xyz) still appears and lists it', async () => {
  const res = await app.request('/api/files?path=&depth=2')
  const tree = await res.json() as FileNode[]

  const folder = findFolder(tree, 'only-weird')
  expect(folder).toBeDefined()
  const childNames = (folder!.children ?? []).map(c => c.name)
  expect(childNames).toContain('weird.xyz')
  const fileNode = folder!.children!.find(c => c.name === 'weird.xyz')
  expect(fileNode?.type).toBe('file')
})

test('a truly empty directory (no children on disk) is still omitted, preserving prior behavior', async () => {
  const res = await app.request('/api/files?path=&depth=2')
  const tree = await res.json() as FileNode[]
  expect(findFolder(tree, 'truly-empty')).toBeUndefined()
})

test('a folder whose only child is an empty subdirectory still appears', async () => {
  const res = await app.request('/api/files?path=&depth=3')
  const tree = await res.json() as FileNode[]
  const outer = findFolder(tree, 'outer')
  expect(outer).toBeDefined()
  // 空叶子 inner 可以继续省略；关键是 outer 不被连带丢掉
  const inner = (outer!.children ?? []).find(c => c.name === 'inner')
  expect(inner === undefined || inner.type === 'folder').toBe(true)
})

test('whitelisted files are unaffected by the change', async () => {
  const res = await app.request('/api/files?path=&depth=2')
  const tree = await res.json() as FileNode[]
  const names = tree.map(n => n.name)
  expect(names).toContain('README.md')
})

test('GET /api/stat distinguishes folder vs file', async () => {
  const folder = await app.request('/api/stat?path=only-jsonl')
  expect(folder.status).toBe(200)
  expect(await folder.json()).toMatchObject({ type: 'folder', path: 'only-jsonl', name: 'only-jsonl' })

  const file = await app.request('/api/stat?path=README.md')
  expect(file.status).toBe(200)
  expect(await file.json()).toMatchObject({ type: 'file', path: 'README.md', name: 'README.md' })

  const missing = await app.request('/api/stat?path=nope')
  expect(missing.status).toBe(404)
})
