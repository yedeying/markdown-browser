import type { FileNode } from '../../types.js'
import { getFileType } from './fileType.js'

/** 未知图片尺寸时的占位宽高比（宽/高） */
export const MASONRY_PLACEHOLDER_RATIO = 3 / 4

/**
 * 瀑布流列分配：按预估高度放入当前最短列。
 * 高度应尽量用真实宽高比（1/ratio）；未知时用占位，否则各图同高 → 退化成按数量均分。
 */
export function packMasonryColumns<T>(
  items: T[],
  columnCount: number,
  estimateHeight: (item: T) => number,
): T[][] {
  const n = Math.max(1, Math.floor(columnCount))
  const cols: T[][] = Array.from({ length: n }, () => [])
  const heights = new Array(n).fill(0)
  for (const item of items) {
    let minI = 0
    for (let i = 1; i < n; i++) {
      if (heights[i] < heights[minI]) minI = i
    }
    cols[minI].push(item)
    heights[minI] += Math.max(0, estimateHeight(item))
  }
  return cols
}

/** 由容器宽度推算列数（与 CSS column-width / gap 对齐） */
export function masonryColumnCount(
  containerWidth: number,
  columnWidth = 200,
  gap = 4,
): number {
  if (containerWidth <= 0) return 1
  return Math.max(1, Math.floor((containerWidth + gap) / (columnWidth + gap)))
}

/**
 * 相对列高：单位列宽下的 media 高度。
 * 标题为 absolute 叠层，不计入文档流，故不再加 caption 余量。
 * `ratios[path]` 为已知宽/高；缺失则用占位比。
 */
export function estimateMasonryTileHeight(
  node: FileNode,
  ratios: Readonly<Record<string, number>>,
): number {
  if (node.type === 'folder') return 1
  const ft = getFileType(node.name)
  if (ft === 'video') return 9 / 16
  if (ft === 'image') {
    const r = ratios[node.path]
    const ratio = r && r > 0 ? r : MASONRY_PLACEHOLDER_RATIO
    return 1 / ratio
  }
  return 1
}

/** 仍在等图片尺寸的项（仅 image）；文件夹/视频视为已就绪 */
export function isMasonryImagePending(
  node: FileNode,
  settledPaths: ReadonlySet<string>,
): boolean {
  if (node.type !== 'file') return false
  if (getFileType(node.name) !== 'image') return false
  return !settledPaths.has(node.path)
}

/**
 * 已加载（或非图片）排在未加载图片前面，避免列中间夹大片 skeleton。
 * 两组内部保持原相对顺序。
 */
export function prioritizeLoadedMasonryNodes(
  nodes: FileNode[],
  settledPaths: ReadonlySet<string>,
): FileNode[] {
  const ready: FileNode[] = []
  const pending: FileNode[] = []
  for (const n of nodes) {
    if (isMasonryImagePending(n, settledPaths)) pending.push(n)
    else ready.push(n)
  }
  return ready.length === nodes.length ? nodes : [...ready, ...pending]
}

/**
 * 分列输入顺序：
 * - 仍有未测尺寸的图片 → 就绪优先（避免中间大片 loading）
 * - 全部 settled → 恢复目录排序，做最终齐平分列
 */
export function orderMasonryForPack(
  nodes: FileNode[],
  settledPaths: ReadonlySet<string>,
): FileNode[] {
  const images = nodes.filter(
    (n) => n.type === 'file' && getFileType(n.name) === 'image',
  )
  const allSettled = images.every((n) => settledPaths.has(n.path))
  if (allSettled) return nodes
  return prioritizeLoadedMasonryNodes(nodes, settledPaths)
}

/** 瀑布流缩略图请求宽度（CSS 列约 200px，按 2x） */
export const MASONRY_THUMB_WIDTH = 400
