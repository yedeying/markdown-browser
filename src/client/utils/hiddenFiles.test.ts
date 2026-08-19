import { test, expect } from 'bun:test'
import { isDotfile, filterVisible, filterTree, isHiddenPath } from './hiddenFiles.ts'

test('isDotfile detects leading dot', () => {
  expect(isDotfile('.hidden-note.md')).toBe(true)
  expect(isDotfile('visible.md')).toBe(false)
  expect(isDotfile('..')).toBe(true)
  expect(isDotfile('')).toBe(false)
})

test('filterVisible hides dotfiles by default', () => {
  const nodes = [{ name: 'a.md' }, { name: '.secret.md' }, { name: 'b.md' }]
  expect(filterVisible(nodes, false)).toEqual([{ name: 'a.md' }, { name: 'b.md' }])
})

test('filterVisible keeps dotfiles when showHidden=true', () => {
  const nodes = [{ name: 'a.md' }, { name: '.secret.md' }]
  expect(filterVisible(nodes, true)).toEqual(nodes)
})

test('filterVisible returns empty array when all nodes are dotfiles and hidden', () => {
  expect(filterVisible([{ name: '.a' }, { name: '.b' }], false)).toEqual([])
})

test('isHiddenPath flags a dotfile leaf', () => {
  expect(isHiddenPath('.hidden-note.md')).toBe(true)
  expect(isHiddenPath('notes/.hidden.md')).toBe(true)
})

test('isHiddenPath flags a plain filename nested inside a dot-directory', () => {
  // The bug this guards against: the leaf name alone ("plain-name.md") is not
  // a dotfile, but the parent directory (".private") is — the whole path
  // must still be treated as hidden so search results don't leak it.
  expect(isHiddenPath('.private/plain-name.md')).toBe(true)
  expect(isHiddenPath('notes/.secret/plain-name.md')).toBe(true)
})

test('isHiddenPath returns false for fully visible paths', () => {
  expect(isHiddenPath('notes/daily.md')).toBe(false)
  expect(isHiddenPath('README.md')).toBe(false)
})

interface Node { name: string; children?: Node[] }

test('filterTree recursively strips dotfiles/dotfolders at every level', () => {
  const tree: Node[] = [
    {
      name: 'notes',
      children: [
        { name: 'a.md' },
        { name: '.hidden.md' },
        { name: '.git', children: [{ name: 'config' }] },
      ],
    },
    { name: '.dotdir', children: [{ name: 'x' }] },
  ]
  const filtered = filterTree(tree, false)
  expect(filtered).toHaveLength(1)
  expect(filtered[0].name).toBe('notes')
  expect(filtered[0].children).toHaveLength(1)
  expect(filtered[0].children![0].name).toBe('a.md')
})

test('filterTree returns the original array reference when showHidden=true', () => {
  const tree: Node[] = [{ name: '.dot', children: [{ name: '.x' }] }]
  expect(filterTree(tree, true)).toBe(tree)
})

test('filterTree leaves leaf nodes (no children key) untouched', () => {
  const tree: Node[] = [{ name: 'a.md' }, { name: 'b.md' }]
  expect(filterTree(tree, false)).toEqual(tree)
})
