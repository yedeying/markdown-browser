import { expect, test } from 'bun:test'
import {
  clampMasonryRecurseDepth,
  DEFAULT_MASONRY_RECURSE_DEPTH,
  resolveMasonryRecurseDepth,
} from './masonry-config.ts'

test('resolveMasonryRecurseDepth defaults to 3', () => {
  expect(resolveMasonryRecurseDepth(undefined)).toBe(DEFAULT_MASONRY_RECURSE_DEPTH)
  expect(resolveMasonryRecurseDepth('')).toBe(3)
  expect(resolveMasonryRecurseDepth('nope')).toBe(3)
})

test('resolveMasonryRecurseDepth clamps env values', () => {
  expect(resolveMasonryRecurseDepth('5')).toBe(5)
  expect(resolveMasonryRecurseDepth(0)).toBe(1)
  expect(resolveMasonryRecurseDepth(99)).toBe(10)
  expect(clampMasonryRecurseDepth(3.7)).toBe(4)
})
