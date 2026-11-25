import { expect, test } from 'bun:test'
import type { FileNode } from '../../types.js'
import {
  collapseColumnStackOnHideHidden,
  computeColumnScrollLeft,
  syncColumnStackFromTree,
} from './columnStack.ts'

function folder(path: string, children?: FileNode[]): FileNode {
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path || 'root'
  return { name: name || 'root', type: 'folder', path, children }
}

function file(path: string): FileNode {
  return { name: path.slice(path.lastIndexOf('/') + 1), type: 'file', path }
}

test('collapseColumnStackOnHideHidden retreats drilled hidden folders to column root', () => {
  const hidden = folder('.agents', [file('.agents/notes.md')])
  const root = folder('', [hidden, folder('docs')])
  const prev = [root, hidden]
  const next = collapseColumnStackOnHideHidden(prev, root)
  expect(next.map((n) => n.path)).toEqual([''])
})

test('collapseColumnStackOnHideHidden keeps a fully visible column stack', () => {
  const docs = folder('docs', [file('docs/a.md')])
  const root = folder('', [docs])
  const prev = [root, docs]
  expect(collapseColumnStackOnHideHidden(prev, root)).toBe(prev)
})

test('collapseColumnStackOnHideHidden leaves a hidden column root for the outer view to reset', () => {
  const hiddenRoot = folder('.agents', [file('.agents/notes.md')])
  const prev = [hiddenRoot]
  expect(collapseColumnStackOnHideHidden(prev, hiddenRoot)).toBe(prev)
})

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

test('computeColumnScrollLeft hides older ancestor columns to the left while keeping active col visible', () => {
  // Fits completely
  expect(computeColumnScrollLeft(200, 400, 440, 400)).toBe(0)
  // 4 cols (800px) in 440px wrap, active col 3 (600) -> scroll 360 to push cols 0..1 left
  expect(computeColumnScrollLeft(600, 800, 440, 800)).toBe(360)
  // Active col 1 (200) with deeper cols open -> clamp so col 1 left edge is not clipped
  expect(computeColumnScrollLeft(200, 800, 300, 800)).toBe(200)
  // Stepping back via keyboard Left (stack shrinks to 3 cols -> 600px, then 2 cols -> 400px)
  expect(computeColumnScrollLeft(400, 600, 440, 600)).toBe(160)
  expect(computeColumnScrollLeft(200, 400, 440, 400)).toBe(0)
})
