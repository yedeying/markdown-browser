import type { FileNode } from '../../types.js'
import { getFileType } from './fileType.js'
import type { MasonryColModePref, MasonryColSizePref } from './prefs.js'
import { clampMasonryColCount } from './prefs.js'

/** 未知图片/视频尺寸时的占位宽高比（宽/高）——须与 tile 渲染一致 */
export const MASONRY_PLACEHOLDER_RATIO = 3 / 4

/** 默认列间距（px） */
export const MASONRY_COL_GAP = 4

/** @deprecated use columnWidthForMode — kept for older tests expecting a single default */
export const MASONRY_COL_WIDTH = 160

export const MASONRY_SIZE_WIDTHS: Record<MasonryColSizePref, number> = {
  narrow: 120,
  medium: 160,
  wide: 220,
}

/** auto 模式目标列宽（手机 ~375px 可得 ≥2 列） */
export const MASONRY_AUTO_COL_WIDTH = 160

/**
 * 瀑布流列分配：按预估高度放入当前最短列。
 * 高度应尽量用真实宽高比（1/ratio）；未知时用占位，否则各图同高 → 退化成按数量均分。
 * `gap` 为相对列宽的间距（通常 COL_GAP/COL_WIDTH），计入项间空隙以免多/少项列底部漂移。
 */
export function packMasonryColumns<T>(
  items: T[],
  columnCount: number,
  estimateHeight: (item: T) => number,
  gap = 0,
): T[][] {
  const n = Math.max(1, Math.floor(columnCount))
  const cols: T[][] = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  const gapH = Math.max(0, gap)
  for (const item of items) {
    let minI = 0
    for (let i = 1; i < n; i++) {
      if (heights[i] < heights[minI]) minI = i
    }
    if (cols[minI].length > 0) heights[minI] += gapH
    cols[minI].push(item)
    heights[minI] += Math.max(0, estimateHeight(item))
  }
  return cols
}

/** 由容器宽度推算列数（与 CSS column-width / gap 对齐） */
export function masonryColumnCount(
  containerWidth: number,
  columnWidth = MASONRY_COL_WIDTH,
  gap = MASONRY_COL_GAP,
): number {
  if (containerWidth <= 0) return 1
  return Math.max(1, Math.floor((containerWidth + gap) / (columnWidth + gap)))
}

export function columnWidthForMode(
  mode: MasonryColModePref,
  size: MasonryColSizePref = 'narrow',
): number {
  if (mode === 'size') return MASONRY_SIZE_WIDTHS[size]
  if (mode === 'auto') return MASONRY_AUTO_COL_WIDTH
  // fixed：列宽由 flex 均分，估高用 medium 作相对单位
  return MASONRY_SIZE_WIDTHS.medium
}

export interface ResolveMasonryColumnsOpts {
  mode: MasonryColModePref
  size: MasonryColSizePref
  fixedCount: number
  containerWidth: number
  gap?: number
}

export function resolveMasonryColumnCount(opts: ResolveMasonryColumnsOpts): number {
  if (opts.mode === 'fixed') return clampMasonryColCount(opts.fixedCount)
  const gap = opts.gap ?? MASONRY_COL_GAP
  const colW = columnWidthForMode(opts.mode, opts.size)
  return masonryColumnCount(opts.containerWidth, colW, gap)
}

/** 缩略图请求宽度 ≈ 2× CSS 列宽，宽列封顶 480 */
export function masonryThumbWidth(columnWidth: number): number {
  return Math.min(480, Math.max(240, Math.round(columnWidth * 2)))
}

/**
 * 相对列高：单位列宽下的 media 高度。
 * 标题为 absolute 叠层，不计入文档流，故不再加 caption 余量。
 * 图片与视频共用：`ratios[path]` 已知则用真实比，否则用占位比（与 CSS aspect-ratio 一致）。
 */
export function estimateMasonryTileHeight(
  node: FileNode,
  ratios: Readonly<Record<string, number>>,
): number {
  if (node.type === 'folder') return 1
  const ft = getFileType(node.name)
  if (ft === 'image' || ft === 'video') {
    const r = ratios[node.path]
    const ratio = r && r > 0 ? r : MASONRY_PLACEHOLDER_RATIO
    return 1 / ratio
  }
  return 1
}

/** 主瀑布流尚未接纳的项：未就绪图片，以及尚未出封面（或失败态）的视频。
 * 二者均用骨架占目录序槽位，就绪后原地换成真实 tile，避免未加载媒体顶到前面。 */
export function isMasonryMediaPending(
  node: FileNode,
  settledPaths: ReadonlySet<string>,
): boolean {
  if (node.type !== 'file') return false
  const ft = getFileType(node.name)
  if (ft !== 'image' && ft !== 'video') return false
  return !settledPaths.has(node.path)
}

/** @deprecated use isMasonryMediaPending */
export const isMasonryImagePending = isMasonryMediaPending

/**
 * 已加载（或非媒体）排在未加载媒体前面，两组内部保持原相对顺序。
 */
export function prioritizeLoadedMasonryNodes(
  nodes: FileNode[],
  settledPaths: ReadonlySet<string>,
): FileNode[] {
  const ready: FileNode[] = []
  const pending: FileNode[] = []
  for (const n of nodes) {
    if (isMasonryMediaPending(n, settledPaths)) pending.push(n)
    else ready.push(n)
  }
  return ready.length === nodes.length ? nodes : [...ready, ...pending]
}

/**
 * 分列辅助：历史上用于「只排已就绪」；现主视图改为目录序全量入列 + 骨架槽。
 * 仍可供测试 / 其它调用方使用。
 * 若提供 revealOrder：按首次就绪顺序排布。
 */
export function orderMasonryForPack(
  nodes: FileNode[],
  settledPaths: ReadonlySet<string>,
  revealOrder?: readonly string[],
): FileNode[] {
  const ready = nodes.filter((n) => !isMasonryMediaPending(n, settledPaths))
  if (!revealOrder || revealOrder.length === 0) return ready
  const byPath = new Map(ready.map((n) => [n.path, n]))
  const out: FileNode[] = []
  for (const path of revealOrder) {
    const n = byPath.get(path)
    if (!n) continue
    out.push(n)
    byPath.delete(path)
  }
  for (const n of ready) {
    if (byPath.has(n.path)) out.push(n)
  }
  return out
}

/**
 * 把新就绪 path 追加到 reveal 序列末尾；丢掉已不在 ready 里的项。
 * 已出现过的 path 保持原位，保证主区不因「目录序回填」而闪跳。
 */
export function appendRevealOrder(
  prev: readonly string[],
  readyPaths: readonly string[],
): string[] {
  const readySet = new Set(readyPaths)
  const next = prev.filter((p) => readySet.has(p))
  const seen = new Set(next)
  for (const p of readyPaths) {
    if (seen.has(p)) continue
    seen.add(p)
    next.push(p)
  }
  if (
    next.length === prev.length
    && next.every((p, i) => p === prev[i])
  ) {
    return prev as string[]
  }
  return next
}

/** 尚未进入主瀑布流的媒体（供 preload） */
export function pendingMasonryNodes(
  nodes: FileNode[],
  settledPaths: ReadonlySet<string>,
): FileNode[] {
  return nodes.filter((n) => isMasonryMediaPending(n, settledPaths))
}

/** @deprecated use masonryThumbWidth — default for ~160–200px columns */
export const MASONRY_THUMB_WIDTH = 400

/** 骨架占位宽高比（宽/高），轮换以模拟真实瀑布流参差 */
export const MASONRY_SKELETON_RATIOS = [3 / 4, 1, 4 / 3, 2 / 3, 5 / 4] as const

/** 可见骨架数量：与未就绪媒体一一对应（空 div 压力可接受） */
export function masonrySkeletonCount(pending: number): number {
  return Math.max(0, pending | 0)
}
