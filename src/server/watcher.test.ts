import { test, expect } from 'bun:test'
import { shouldIgnoreWatchPath } from './watcher.ts'

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
