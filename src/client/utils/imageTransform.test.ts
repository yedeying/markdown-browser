import { expect, test } from 'bun:test'
import {
  clampScale,
  zoomIn,
  zoomOut,
  rotateLeft,
  rotateRight,
  fitScale,
  resetTransform,
  MIN_SCALE,
  MAX_SCALE,
} from './imageTransform.ts'

test('zoomIn/out clamps', () => {
  expect(zoomOut(MIN_SCALE)).toBe(MIN_SCALE)
  expect(zoomIn(MAX_SCALE)).toBe(MAX_SCALE)
  expect(zoomIn(1)).toBeGreaterThan(1)
})

test('rotate steps by 90', () => {
  expect(rotateRight(0)).toBe(90)
  expect(rotateLeft(0)).toBe(-90)
  expect(rotateLeft(90)).toBe(0)
})

test('reset and fit', () => {
  expect(fitScale()).toBe(1)
  expect(resetTransform()).toEqual({ scale: 1, rotateDeg: 0 })
})
