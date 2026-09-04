import { test, expect } from 'bun:test'
import { joinUploadPath, normalizeRelPath, suggestRename } from './uploadPaths.ts'

test('normalizeRelPath strips slashes and rejects ..', () => {
  expect(normalizeRelPath('/a/b/')).toBe('a/b')
  expect(normalizeRelPath('a\\b')).toBe('a/b')
  expect(normalizeRelPath('../x')).toBe(null)
  expect(normalizeRelPath('a/./b')).toBe(null)
  expect(normalizeRelPath('')).toBe(null)
})

test('joinUploadPath nests under target', () => {
  expect(joinUploadPath('docs', 'img/a.png')).toBe('docs/img/a.png')
  expect(joinUploadPath('', 'a.txt')).toBe('a.txt')
  expect(joinUploadPath('/docs/', 'x')).toBe('docs/x')
  expect(joinUploadPath('docs', '../x')).toBe(null)
})

test('suggestRename finds free name (n)', () => {
  const taken = new Set(['a.txt', 'a (1).txt'])
  expect(suggestRename('a.txt', p => taken.has(p))).toBe('a (2).txt')
  expect(suggestRename('docs/photo', p => p === 'docs/photo')).toBe('docs/photo (1)')
})
