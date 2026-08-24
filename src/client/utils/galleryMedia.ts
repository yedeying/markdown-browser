import type { FileNode } from '../../types.js'
import { getFileType } from './fileType.js'

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
