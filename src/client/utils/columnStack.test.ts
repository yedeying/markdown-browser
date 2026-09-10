import { expect, test } from 'bun:test'
import type { FileNode } from '../../types.js'
import { syncColumnStackFromTree } from './columnStack.ts'

function folder(path: string, children?: FileNode[]): FileNode {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path || 'root'
  return { name: name || 'root', type: 'folder', path, children }
}

function file(path: string): FileNode {
  return { name: path.slice(path.lastIndexOf('/') + 1), type: 'file', path }
}

test('sync keeps drilled columns when virtual root path is empty and tree refreshes', () => {
  const nested = folder('docs', [file('docs/a.md')])
  const tree: FileNode[] = [nested]
  const root = folder('', tree)
  const prev = [root, nested]

  // 模拟 loadChildren 完成后 tree 引用变化（children 已解析）
  const treeAfter: FileNode[] = [folder('docs', [file('docs/a.md')])]
  const next = syncColumnStackFromTree(prev, treeAfter, root)

  expect(next.map((n) => n.path)).toEqual(['', 'docs'])
  expect(next[1].children).toEqual([file('docs/a.md')])
})

test('sync keeps empty drilled folder instead of retreating to parent', () => {
  const empty = folder('empty', [])
  const tree: FileNode[] = [empty]
  const root = folder('', tree)
  const prev = [root, folder('empty')] // 进入时尚未带 children

  const next = syncColumnStackFromTree(prev, tree, root)
  expect(next.map((n) => n.path)).toEqual(['', 'empty'])
  expect(next[1].children).toEqual([])
})

test('sync truncates when a drilled folder disappears from tree', () => {
  const gone = folder('gone', [])
  const treeBefore: FileNode[] = [gone]
  const root = folder('', treeBefore)
  const prev = [root, gone]

  const treeAfter: FileNode[] = [folder('other', [])]
  const next = syncColumnStackFromTree(prev, treeAfter, root)
  expect(next.map((n) => n.path)).toEqual([''])
})

test('sync refreshes non-root folder roots by path', () => {
  const sub = folder('notes/sub', [file('notes/sub/a.md')])
  const notes = folder('notes', [sub])
  const tree: FileNode[] = [notes]
  const root = notes
  const prev = [folder('notes', [folder('notes/sub')]), folder('notes/sub')]

  const next = syncColumnStackFromTree(prev, tree, root)
  expect(next.map((n) => n.path)).toEqual(['notes', 'notes/sub'])
  expect(next[1].children?.[0].path).toBe('notes/sub/a.md')
})
