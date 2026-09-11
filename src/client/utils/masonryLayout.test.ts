import { expect, test } from 'bun:test'
import type { FileNode } from '../../types.js'
import {
  appendRevealOrder,
  columnWidthForMode,
  estimateMasonryTileHeight,
  MASONRY_COL_GAP,
  MASONRY_COL_WIDTH,
  MASONRY_PLACEHOLDER_RATIO,
  masonryColumnCount,
  masonrySkeletonCount,
  orderMasonryForPack,
  packMasonryColumns,
  pendingMasonryNodes,
  prioritizeLoadedMasonryNodes,
  resolveMasonryColumnCount,
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

test('packMasonryColumns counts inter-item gap so more tiles do not silently run long', () => {
  const items = [
    { id: 'a', h: 10 },
    { id: 'b', h: 25 },
    { id: 'c', h: 10 },
    { id: 'd', h: 2 },
  ]
  // No gap: after a,c col0=20 < col1=25 → d stacks on col0.
  expect(packMasonryColumns(items, 2, (x) => x.h).map((c) => c.map((x) => x.id))).toEqual([
    ['a', 'c', 'd'],
    ['b'],
  ])
  // gap=10: after a,c col0=30 > col1=25 → d prefers col1 instead.
  expect(packMasonryColumns(items, 2, (x) => x.h, 10).map((c) => c.map((x) => x.id))).toEqual([
    ['a', 'c'],
    ['b', 'd'],
  ])
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

test('estimateMasonryTileHeight uses placeholder for unsettled video (matches CSS)', () => {
  const vid: FileNode = { name: 'c.mp4', type: 'file', path: 'c.mp4' }
  expect(estimateMasonryTileHeight(vid, {})).toBe(1 / MASONRY_PLACEHOLDER_RATIO)
})

test('estimateMasonryTileHeight uses real video cover ratio when known', () => {
  const vid: FileNode = { name: 'c.mp4', type: 'file', path: 'c.mp4' }
  expect(estimateMasonryTileHeight(vid, { 'c.mp4': 16 / 9 })).toBeCloseTo(9 / 16)
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

test('prioritizeLoadedMasonryNodes puts settled media before pending ones', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.mp4', type: 'file', path: 'c.mp4' },
    { name: 'd.jpg', type: 'file', path: 'd.jpg' },
  ]
  const settled = new Set(['b.jpg'])
  const ordered = prioritizeLoadedMasonryNodes(nodes, settled)
  // 未就绪视频也算 pending；ready 仅 b
  expect(ordered.map((n) => n.path)).toEqual(['b.jpg', 'a.jpg', 'c.mp4', 'd.jpg'])
})

test('orderMasonryForPack restores source order when all media settled', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.mp4', type: 'file', path: 'c.mp4' },
  ]
  const settled = new Set(['a.jpg', 'b.jpg', 'c.mp4'])
  expect(orderMasonryForPack(nodes, settled).map((n) => n.path)).toEqual([
    'a.jpg',
    'b.jpg',
    'c.mp4',
  ])
})

test('orderMasonryForPack waits for image ratios and video covers alike', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.mp4', type: 'file', path: 'c.mp4' },
  ]
  expect(orderMasonryForPack(nodes, new Set(['a.jpg', 'b.jpg'])).map((n) => n.path)).toEqual([
    'a.jpg',
    'b.jpg',
  ])
  expect(orderMasonryForPack(nodes, new Set(['b.jpg', 'c.mp4'])).map((n) => n.path)).toEqual([
    'b.jpg',
    'c.mp4',
  ])
})

test('orderMasonryForPack and pendingMasonryNodes gate images and videos', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.mp4', type: 'file', path: 'c.mp4' },
  ]
  const settled = new Set(['b.jpg'])
  expect(orderMasonryForPack(nodes, settled).map((n) => n.path)).toEqual(['b.jpg'])
  expect(pendingMasonryNodes(nodes, settled).map((n) => n.path)).toEqual(['a.jpg', 'c.mp4'])
})

test('appendRevealOrder only appends newly ready paths', () => {
  expect(appendRevealOrder(['c.mp4', 'b.jpg'], ['c.mp4', 'b.jpg', 'a.jpg'])).toEqual([
    'c.mp4',
    'b.jpg',
    'a.jpg',
  ])
  expect(appendRevealOrder(['c.mp4', 'b.jpg'], ['c.mp4', 'b.jpg'])).toEqual(['c.mp4', 'b.jpg'])
})

test('orderMasonryForPack with revealOrder keeps first-ready position', () => {
  const nodes: FileNode[] = [
    { name: 'a.jpg', type: 'file', path: 'a.jpg' },
    { name: 'b.jpg', type: 'file', path: 'b.jpg' },
    { name: 'c.mp4', type: 'file', path: 'c.mp4' },
  ]
  const settled = new Set(['a.jpg', 'b.jpg', 'c.mp4'])
  // a 后就绪：仍排在 b、视频之后，不插回目录首位
  expect(
    orderMasonryForPack(nodes, settled, ['c.mp4', 'b.jpg', 'a.jpg']).map((n) => n.path),
  ).toEqual(['c.mp4', 'b.jpg', 'a.jpg'])
})

test('masonrySkeletonCount matches pending one-to-one', () => {
  expect(masonrySkeletonCount(0)).toBe(0)
  expect(masonrySkeletonCount(2)).toBe(2)
  expect(masonrySkeletonCount(343)).toBe(343)
})

test('MASONRY_COL_* stay aligned with auto default width', () => {
  expect(MASONRY_COL_WIDTH).toBe(160)
  expect(MASONRY_COL_GAP).toBe(4)
})

test('resolveMasonryColumnCount: narrow/auto give ≥2 cols on phone width', () => {
  const phone = 375
  expect(resolveMasonryColumnCount({
    mode: 'size', size: 'narrow', fixedCount: 2, containerWidth: phone,
  })).toBeGreaterThanOrEqual(2)
  expect(resolveMasonryColumnCount({
    mode: 'auto', size: 'narrow', fixedCount: 2, containerWidth: phone,
  })).toBeGreaterThanOrEqual(2)
})

test('resolveMasonryColumnCount: fixed clamps 1–8', () => {
  expect(resolveMasonryColumnCount({
    mode: 'fixed', size: 'narrow', fixedCount: 0, containerWidth: 1000,
  })).toBe(1)
  expect(resolveMasonryColumnCount({
    mode: 'fixed', size: 'narrow', fixedCount: 99, containerWidth: 100,
  })).toBe(8)
  expect(resolveMasonryColumnCount({
    mode: 'fixed', size: 'narrow', fixedCount: 3, containerWidth: 100,
  })).toBe(3)
})

test('columnWidthForMode maps size presets', () => {
  expect(columnWidthForMode('size', 'narrow')).toBe(120)
  expect(columnWidthForMode('size', 'medium')).toBe(160)
  expect(columnWidthForMode('size', 'wide')).toBe(220)
  expect(columnWidthForMode('auto')).toBe(160)
})
