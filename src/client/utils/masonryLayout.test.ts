import { expect, test } from 'bun:test'
import type { FileNode } from '../../types.js'
import {
  estimateMasonryTileHeight,
  masonryColumnCount,
  orderMasonryForPack,
  packMasonryColumns,
  prioritizeLoadedMasonryNodes,
} from './masonryLayout.ts'

test('masonryColumnCount floors by column width + gap', () => {
  expect(masonryColumnCount(0)).toBe(1)
  expect(masonryColumnCount(200)).toBe(1)
  expect(masonryColumnCount(404)).toBe(2)
  expect(masonryColumnCount(1000, 200, 4)).toBe(4)
})

test('packMasonryColumns puts each next item into the shortest column', () => {
  const items = [
    { id: 'a', h: 10 },
    { id: 'b', h: 10 },
    { id: 'c', h: 30 },
    { id: 'd', h: 10 },
  ]
  const cols = packMasonryColumns(items, 2, (x) => x.h)
  expect(cols).toHaveLength(2)
  expect(cols[0].map((x) => x.id)).toEqual(['a', 'c'])
  expect(cols[1].map((x) => x.id)).toEqual(['b', 'd'])
})

test('packMasonryColumns with one column keeps source order', () => {
  const items = [1, 2, 3]
  expect(packMasonryColumns(items, 1, () => 1)).toEqual([[1, 2, 3]])
})

test('estimateMasonryTileHeight uses real aspect ratio so tall images weigh more', () => {
  const wide: FileNode = { name: 'w.jpg', type: 'file', path: 'w.jpg' }
  const tall: FileNode = { name: 't.jpg', type: 'file', path: 't.jpg' }
  const ratios = { 'w.jpg': 2, 't.jpg': 0.5 }
  expect(estimateMasonryTileHeight(tall, ratios)).toBeGreaterThan(
    estimateMasonryTileHeight(wide, ratios),
  )
})

test('estimateMasonryTileHeight does not add phantom caption height', () => {
  const img: FileNode = { name: 'a.jpg', type: 'file', path: 'a.jpg' }
  expect(estimateMasonryTileHeight(img, { 'a.jpg': 1 })).toBe(1)
})

test('pack with real ratios balances by height not by count', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.jpg', type: 'file', path: 'c.jpg' },
  ]
  const ratios = { 'a.jpg': 0.5, 'b.jpg': 2, 'c.jpg': 2 }
  const cols = packMasonryColumns(nodes, 2, (n) => estimateMasonryTileHeight(n, ratios))
  const paths = cols.map((c) => c.map((n) => n.path))
  expect(paths[0]).toEqual(['a.jpg'])
  expect(paths[1]).toEqual(['b.jpg', 'c.jpg'])
})

test('prioritizeLoadedMasonryNodes puts settled images before pending ones', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.mp4', type: 'file', path: 'c.mp4' },
    { name: 'd.jpg', type: 'file', path: 'd.jpg' },
  ]
  const settled = new Set(['b.jpg'])
  const ordered = prioritizeLoadedMasonryNodes(nodes, settled)
  expect(ordered.map((n) => n.path)).toEqual(['b.jpg', 'c.mp4', 'a.jpg', 'd.jpg'])
})

test('orderMasonryForPack restores source order when all images settled', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.mp4', type: 'file', path: 'c.mp4' },
  ]
  const settled = new Set(['a.jpg', 'b.jpg'])
  expect(orderMasonryForPack(nodes, settled).map((n) => n.path)).toEqual([
    'a.jpg',
    'b.jpg',
    'c.mp4',
  ])
})

test('orderMasonryForPack prioritizes while images still pending', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
  ]
  expect(orderMasonryForPack(nodes, new Set(['b.jpg'])).map((n) => n.path)).toEqual([
    'b.jpg',
    'a.jpg',
  ])
})
