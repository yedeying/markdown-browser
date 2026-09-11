import { expect, test } from 'bun:test'
import { parseBytesRange } from './http-range.ts'

test('parseBytesRange handles start-end and open end', () => {
  expect(parseBytesRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
  expect(parseBytesRange('bytes=100-', 1000)).toEqual({ start: 100, end: 999 })
  expect(parseBytesRange('bytes=-50', 1000)).toEqual({ start: 950, end: 999 })
})

test('parseBytesRange rejects invalid ranges', () => {
  expect(parseBytesRange(undefined, 100)).toBeNull()
  expect(parseBytesRange('bytes=500-100', 1000)).toBeNull()
  expect(parseBytesRange('bytes=1000-1001', 1000)).toBeNull()
})
