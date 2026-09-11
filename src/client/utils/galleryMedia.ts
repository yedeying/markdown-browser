import type { FileNode } from '../../types.js'
import { findNodeByPath } from './columnStack.js'
import { getFileType } from './fileType.js'
import { filterVisible } from './hiddenFiles.js'
import { parentPath } from './keyboardNav.js'
import {
  clampMasonryRecurseDepth,
  DEFAULT_MASONRY_RECURSE_DEPTH,
} from '../../shared/masonry-config.js'

/** 图片或视频文件（非文件夹）。 */
export function isMediaFile(node: FileNode): boolean {
  if (node.type !== 'file') return false
  const ft = getFileType(node.name)
  return ft === 'image' || ft === 'video'
}

/** 当前目录可见子项中是否含图片或视频（用于显示「瀑布流」按钮）。 */
export function folderHasMedia(nodes: FileNode[]): boolean {
  return nodes.some(isMediaFile)
}

/** 瀑布流内容：仅图片/视频，不含文件夹与其它文件。 */
export function filterMasonryNodes(nodes: FileNode[]): FileNode[] {
  return nodes.filter(isMediaFile)
}

/**
 * DFS flatten media under a tree returned by /api/files?depth=N.
 * Does not emit folder tiles. Order: directory order, files before diving
 * is not required — we emit media when visited, then recurse folders.
 */
export function flattenMediaNodes(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = []
  const walk = (list: FileNode[]) => {
    for (const n of list) {
      if (isMediaFile(n)) out.push(n)
      else if (n.type === 'folder' && n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** Lightbox 播放列表：仅媒体文件，保持原顺序。 */
export function buildMediaPlaylist(nodes: FileNode[]): FileNode[] {
  return nodes.filter(isMediaFile)
}

/** Parent-folder media siblings for half-pane ←→; empty if unknown */
export function mediaPlaylistForPath(
  filePath: string,
  tree: FileNode[] | undefined,
  showHidden: boolean,
): FileNode[] {
  if (!tree || !filePath) return []
  const parent = parentPath(filePath)
  if (parent === null) return []
  const children =
    parent === ''
      ? tree
      : findNodeByPath(tree, parent)?.children
  if (!children) return []
  return buildMediaPlaylist(filterVisible(children, showHidden))
}

export function stepPlaylistPath(
  playlist: FileNode[],
  currentPath: string,
  delta: number,
): string | null {
  const i = playlist.findIndex((n) => n.path === currentPath)
  if (i === -1) return null
  const next = ((i + delta) % playlist.length + playlist.length) % playlist.length
  return playlist[next].path
}

/** Client: depth from injected runtime, else code default. */
export function getClientMasonryRecurseDepth(): number {
  if (typeof window === 'undefined') return DEFAULT_MASONRY_RECURSE_DEPTH
  const w = window as unknown as { __VMD_MASONRY_RECURSE_DEPTH__?: number | string }
  const raw = w.__VMD_MASONRY_RECURSE_DEPTH__
  if (raw == null || raw === '') return DEFAULT_MASONRY_RECURSE_DEPTH
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_MASONRY_RECURSE_DEPTH
  return clampMasonryRecurseDepth(n)
}
