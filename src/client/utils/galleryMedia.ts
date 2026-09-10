import type { FileNode } from '../../types.js'
import { findNodeByPath } from './columnStack.js'
import { getFileType } from './fileType.js'
import { filterVisible } from './hiddenFiles.js'
import { parentPath } from './keyboardNav.js'

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
  const next = i + delta
  if (next < 0 || next >= playlist.length) return null
  return playlist[next].path
}
