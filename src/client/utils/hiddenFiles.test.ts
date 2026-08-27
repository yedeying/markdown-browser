import { test, expect, beforeEach } from 'bun:test'
import { isDotfile, filterVisible, filterTree, isHiddenPath, revealHiddenForPath } from './hiddenFiles.ts'
import { getPref, setPref } from './prefs.ts'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
  get length(): number {
    return this.store.size
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage()
})

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

test('revealHiddenForPath turns showHidden on for hidden paths', () => {
  expect(getPref('showHidden')).toBe(false)
  expect(revealHiddenForPath('.hermes/memory/note.md')).toBe(true)
  expect(getPref('showHidden')).toBe(true)
})

test('revealHiddenForPath leaves showHidden alone for visible paths', () => {
  setPref('showHidden', false)
  expect(revealHiddenForPath('notes/daily.md')).toBe(false)
  expect(getPref('showHidden')).toBe(false)
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
