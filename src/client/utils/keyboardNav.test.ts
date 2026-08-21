import { test, expect } from 'bun:test'
import type { FileNode } from '../../types.js'
import {
  clampIndex,
  collectCompactPaths,
  flattenVisibleTree,
  isTypingTarget,
  normalizeNavKey,
  parentPath,
  stepGridIndex,
  stepIndex,
  treeNodeTestId,
} from './keyboardNav.ts'

function folder(name: string, path: string, children: FileNode[] = []): FileNode {
  return { name, type: 'folder', path, children }
}
function file(name: string, path: string): FileNode {
  return { name, type: 'file', path, size: '1' }
}

test('clampIndex and stepIndex', () => {
  expect(clampIndex(-1, 3)).toBe(0)
  expect(clampIndex(9, 3)).toBe(2)
  expect(clampIndex(1, 0)).toBe(-1)
  expect(stepIndex(-1, 5, 1)).toBe(0)
  expect(stepIndex(-1, 5, -1)).toBe(4)
  expect(stepIndex(0, 5, -1)).toBe(0)
  expect(stepIndex(4, 5, 1)).toBe(4)
  // 仅一项时步进仍停在 0；调用方应以 nextIdx === curIdx 跳过 onSelect
  expect(stepIndex(0, 1, 1)).toBe(0)
  expect(stepIndex(0, 1, -1)).toBe(0)
})

test('normalizeNavKey maps hjkl and arrows; ignores modifiers', () => {
  expect(normalizeNavKey({ key: 'j' } as KeyboardEvent)).toBe('down')
  expect(normalizeNavKey({ key: 'k' } as KeyboardEvent)).toBe('up')
  expect(normalizeNavKey({ key: 'h' } as KeyboardEvent)).toBe('left')
  expect(normalizeNavKey({ key: 'l' } as KeyboardEvent)).toBe('right')
  expect(normalizeNavKey({ key: 'ArrowDown' } as KeyboardEvent)).toBe('down')
  expect(normalizeNavKey({ key: 'Enter' } as KeyboardEvent)).toBe('enter')
  expect(normalizeNavKey({ key: 'j', metaKey: true } as KeyboardEvent)).toBe(null)
  expect(normalizeNavKey({ key: 'a' } as KeyboardEvent)).toBe(null)
})

test('parentPath', () => {
  expect(parentPath('a/b/c.md')).toBe('a/b')
  expect(parentPath('a')).toBe('')
  expect(parentPath('')).toBe(null)
})

test('collectCompactPaths follows single-folder chains', () => {
  const leaf = folder('c', 'a/b/c', [file('x.md', 'a/b/c/x.md')])
  const mid = folder('b', 'a/b', [leaf])
  const root = folder('a', 'a', [mid])
  expect(collectCompactPaths(root)).toEqual(['a', 'a/b', 'a/b/c'])
})

test('flattenVisibleTree respects expanded and compact display', () => {
  const tree: FileNode[] = [
    folder('docs', 'docs', [
      folder('only', 'docs/only', [
        file('a.md', 'docs/only/a.md'),
        file('b.md', 'docs/only/b.md'),
      ]),
    ]),
    file('root.md', 'root.md'),
  ]
  const collapsed = flattenVisibleTree(tree, new Set())
  expect(collapsed.map((n) => n.path)).toEqual(['docs', 'root.md'])

  const expanded = flattenVisibleTree(tree, new Set(['docs', 'docs/only']))
  // compact: docs row then children of docs/only (docs/only not a separate row beyond docs's compact chain)
  // FileTree: expanding docs compact-expands to docs/only, shows docs/only's children under the docs row
  expect(expanded.map((n) => n.path)).toEqual(['docs', 'docs/only/a.md', 'docs/only/b.md', 'root.md'])
})

test('stepGridIndex moves in 2D', () => {
  // 3 cols, 7 items: 0 1 2 / 3 4 5 / 6
  expect(stepGridIndex(0, 7, 3, 'right')).toBe(1)
  expect(stepGridIndex(2, 7, 3, 'right')).toBe(3)
  expect(stepGridIndex(1, 7, 3, 'down')).toBe(4)
  expect(stepGridIndex(6, 7, 3, 'down')).toBe(6)
  expect(stepGridIndex(4, 7, 3, 'up')).toBe(1)
  expect(stepGridIndex(3, 7, 3, 'left')).toBe(2)
})

test('treeNodeTestId', () => {
  expect(treeNodeTestId('a/b.md')).toBe('tree-node-a-b.md')
})

test('isTypingTarget returns false for non-Elements', () => {
  expect(isTypingTarget(null)).toBe(false)
  expect(isTypingTarget({} as EventTarget)).toBe(false)
})
